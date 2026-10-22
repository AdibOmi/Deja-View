"""
One-off export of the old FastAPI/Postgres data (e.g. the Render database)
into a SQL file that can be loaded into Cloudflare D1.

It also backfills `tmdb_id` (plus a TMDB poster/backdrop/rating) for every
saved movie and share via TMDB's /find endpoint, so old entries work with the
TMDB-based recommendation engine.

Usage (from the repo root, with the old backend's venv which already has
psycopg2 + requests + python-dotenv):

    backend/venv/Scripts/python.exe scripts/migrate_postgres_to_d1.py \
        --database-url "postgresql://user:pass@host/db"   # Render "External Database URL"

    npx wrangler d1 execute deja-view --remote --file=scripts/d1_import.sql

--database-url defaults to DATABASE_URL in backend/.env. TMDB_API_KEY is read
from the environment or backend/.env. Pass --replace to wipe the D1 tables
first (otherwise rows whose id already exists are skipped).
"""

import argparse
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / "backend" / ".env")

IMG = "https://image.tmdb.org/t/p/"


def sql_value(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return "'" + v.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") + "'"
    return "'" + str(v).replace("'", "''") + "'"


def insert(table, row, columns, verb):
    cols = ", ".join(columns)
    vals = ", ".join(sql_value(row.get(c)) for c in columns)
    return f"{verb} INTO {table} ({cols}) VALUES ({vals});"


def fetch_all(conn, table):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = %s", (table,)
        )
        if not cur.fetchone():
            return []
        cur.execute(f"SELECT * FROM {table} ORDER BY id")
        return [dict(r) for r in cur.fetchall()]


def norm_type(t):
    return "series" if t == "series" else "movie"


def make_finder(api_key):
    session = requests.Session()
    cache = {}

    def find(imdb_id, media_type):
        if not imdb_id or not api_key:
            return None
        if imdb_id in cache:
            return cache[imdb_id]
        try:
            resp = session.get(
                f"https://api.themoviedb.org/3/find/{imdb_id}",
                params={"api_key": api_key, "external_source": "imdb_id"},
                timeout=10,
            )
            data = resp.json()
        except Exception:
            cache[imdb_id] = None
            return None
        primary = "tv_results" if media_type == "series" else "movie_results"
        secondary = "movie_results" if media_type == "series" else "tv_results"
        hit = (data.get(primary) or data.get(secondary) or [None])[0]
        result = None
        if hit:
            result = {
                "tmdb_id": hit["id"],
                "media_type": "series" if hit in (data.get("tv_results") or []) else "movie",
                "poster": f"{IMG}w342{hit['poster_path']}" if hit.get("poster_path") else None,
                "backdrop": f"{IMG}w780{hit['backdrop_path']}" if hit.get("backdrop_path") else None,
                "tmdb_rating": round(hit["vote_average"], 1) if hit.get("vote_average") else None,
            }
        cache[imdb_id] = result
        return result

    return find


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--database-url", default=os.getenv("DATABASE_URL"))
    ap.add_argument("--out", default=str(ROOT / "scripts" / "d1_import.sql"))
    ap.add_argument("--replace", action="store_true", help="delete existing D1 rows first")
    args = ap.parse_args()

    if not args.database_url:
        sys.exit("No database URL. Pass --database-url or set DATABASE_URL in backend/.env")
    url = args.database_url.replace("postgres://", "postgresql://", 1).replace("postgresql+psycopg2://", "postgresql://", 1)

    conn = psycopg2.connect(url)
    users = fetch_all(conn, "users")
    movies = fetch_all(conn, "movies")
    friendships = fetch_all(conn, "friendships")
    shares = fetch_all(conn, "shared_movies")
    conn.close()
    print(f"Read {len(users)} users, {len(movies)} movies, {len(friendships)} friendships, {len(shares)} shares")

    find = make_finder(os.getenv("TMDB_API_KEY"))
    lookups = {(m.get("imdb_id"), norm_type(m.get("media_type"))) for m in movies + shares if m.get("imdb_id")}
    with ThreadPoolExecutor(max_workers=10) as pool:
        resolved = dict(zip(lookups, pool.map(lambda k: find(*k), lookups)))
    print(f"Resolved {sum(1 for v in resolved.values() if v)}/{len(lookups)} titles on TMDB")

    verb = "INSERT" if args.replace else "INSERT OR IGNORE"
    lines = ["-- Generated by scripts/migrate_postgres_to_d1.py"]
    if args.replace:
        lines += [
            "DELETE FROM shared_movies;",
            "DELETE FROM friendships;",
            "DELETE FROM movies;",
            "DELETE FROM users;",
        ]

    for u in users:
        lines.append(insert("users", u, ["id", "username", "hashed_password", "display_name", "friend_code", "favorite_genres", "created_at"], verb))

    seen_tmdb = set()
    for m in movies:
        m["media_type"] = norm_type(m.get("media_type"))
        hit = resolved.get((m.get("imdb_id"), m["media_type"]))
        if hit:
            key = (m["user_id"], hit["media_type"], hit["tmdb_id"])
            if key not in seen_tmdb:  # respect the (user, type, tmdb_id) unique index
                seen_tmdb.add(key)
                m["tmdb_id"] = hit["tmdb_id"]
                m["media_type"] = hit["media_type"]
            m["backdrop"] = hit["backdrop"]
            m["tmdb_rating"] = hit["tmdb_rating"]
            if not m.get("poster") or m["poster"] == "N/A":
                m["poster"] = hit["poster"]
        m["is_watched"] = bool(m.get("is_watched", True))
        lines.append(insert("movies", m, [
            "id", "user_id", "tmdb_id", "imdb_id", "media_type", "title", "poster", "backdrop", "year", "runtime",
            "genre", "director", "actors", "plot", "imdb_rating", "tmdb_rating", "my_rating", "my_comment",
            "watch_comment", "is_watched",
        ], verb))

    for f in friendships:
        lines.append(insert("friendships", f, ["id", "requester_id", "addressee_id", "status", "created_at", "responded_at"], verb))

    for s in shares:
        s["media_type"] = norm_type(s.get("media_type"))
        hit = resolved.get((s.get("imdb_id"), s["media_type"]))
        if hit:
            s["tmdb_id"] = hit["tmdb_id"]
            s["media_type"] = hit["media_type"]
        lines.append(insert("shared_movies", s, [
            "id", "sender_id", "receiver_id", "tmdb_id", "imdb_id", "media_type", "title", "poster",
            "imdb_rating", "comment", "status", "created_at",
        ], verb))

    Path(args.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")
    print(f"Next: npx wrangler d1 execute deja-view --remote --file=\"{args.out}\"")


if __name__ == "__main__":
    main()
