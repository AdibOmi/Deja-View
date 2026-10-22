import { Hono } from "hono";
import { fail } from "../db.js";
import {
  tmdb,
  soft,
  toCard,
  normType,
  tmdbType,
  canonicalGenres,
  genreIdFor,
} from "../tmdb.js";

const recs = new Hono();

const keyOf = (card) => `${card.media_type}:${card.tmdb_id}`;
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const splitList = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);

// Genre taste profile in [-1, 1]: loved genres positive, disliked negative.
function tasteProfile(rows, favoriteGenres) {
  const weights = {};
  const bump = (genres, w) => canonicalGenres(genres).forEach((g) => (weights[g] = (weights[g] || 0) + w));
  for (const r of rows) {
    const genres = splitList(r.genre);
    if (r.my_rating != null) bump(genres, (r.my_rating - 5.5) / 2);
    else bump(genres, r.is_watched ? 0.5 : 0.3);
  }
  bump(splitList(favoriteGenres), 2);
  const max = Math.max(1e-6, ...Object.values(weights).map(Math.abs));
  for (const g of Object.keys(weights)) weights[g] /= max;
  return weights;
}

// Which library titles to branch out from, strongest signal first.
function pickSeeds(rows) {
  const seeds = [];
  for (const r of rows) {
    if (!r.tmdb_id) continue;
    if (r.is_watched && r.my_rating != null) {
      if (r.my_rating < 7) continue;
      seeds.push({ row: r, weight: r.my_rating - 6, label: `Because you ${r.my_rating >= 9 ? "loved" : "liked"} ${r.title}` });
    } else if (r.is_watched) {
      seeds.push({ row: r, weight: 1.2, label: `Because you watched ${r.title}` });
    } else {
      seeds.push({ row: r, weight: 0.8, label: `Like ${r.title} on your watchlist` });
    }
  }
  const recency = (r) => r.watched_at || r.added_at || "";
  seeds.sort((a, b) => b.weight - a.weight || recency(b.row).localeCompare(recency(a.row)));
  return seeds.slice(0, 10);
}

recs.get("/recommendations", async (c) => {
  const env = c.env;
  const db = env.DB;
  const userId = c.get("userId");
  const page = clamp(Number(c.req.query("page")) || 1, 1, 5);
  const limit = clamp(Number(c.req.query("limit")) || 24, 1, 60);
  const exclude = new Set((c.req.query("exclude") || "").split(",").filter(Boolean));

  const [userRes, rowsRes] = await db.batch([
    db.prepare("SELECT favorite_genres FROM users WHERE id = ?1").bind(userId),
    db.prepare(
      "SELECT tmdb_id, media_type, title, genre, director, my_rating, is_watched, watched_at, added_at FROM movies WHERE user_id = ?1"
    ).bind(userId),
  ]);
  const user = userRes.results[0];
  if (!user) throw fail(401, "Account no longer exists");
  const rows = rowsRes.results;

  const known = new Set(rows.filter((r) => r.tmdb_id).map((r) => `${normType(r.media_type)}:${r.tmdb_id}`));
  const profile = tasteProfile(rows, user.favorite_genres);
  const seeds = pickSeeds(rows);
  const personalized = seeds.some((s) => s.row.is_watched);

  const candidates = new Map();
  function add(raw, type, points, label) {
    if (!raw?.id || !raw.poster_path || raw.adult) return;
    const card = toCard(raw, raw.media_type || type);
    const key = keyOf(card);
    if (known.has(key) || exclude.has(key) || card.vote_count < 30) return;
    let entry = candidates.get(key);
    if (!entry) {
      entry = { card, points: 0, reasons: new Map() };
      candidates.set(key, entry);
    }
    entry.points += points;
    if (label) entry.reasons.set(label, (entry.reasons.get(label) || 0) + points);
  }

  // Directors behind the user's favourite films, by the names saved with each
  // library row (no need to pull full credits for every seed).
  const directorWeights = new Map();
  if (page === 1) {
    for (const seed of seeds) {
      if (tmdbType(seed.row.media_type) !== "movie" || !(seed.row.my_rating >= 8)) continue;
      for (const name of splitList(seed.row.director).filter((n) => n !== "N/A")) {
        const prev = directorWeights.get(name) || { name, weight: 0, seed: seed.row.title };
        prev.weight += seed.weight;
        directorWeights.set(name, prev);
      }
    }
  }
  const directorNames = [...directorWeights.values()].sort((a, b) => b.weight - a.weight).slice(0, 2);

  // Phase 1: each seed's TMDB recommendations (~15 KB each, vs ~250 KB for
  // the full detail payload), alongside the director id lookups.
  const [seedData, directorIds] = await Promise.all([
    Promise.all(
      seeds.map(({ row }) =>
        soft(tmdb(env, `/${tmdbType(row.media_type)}/${row.tmdb_id}/recommendations`, { page }, 86400))
      )
    ),
    Promise.all(
      directorNames.map((d) =>
        soft(tmdb(env, "/search/person", { query: d.name }, 86400 * 7)).then((res) => {
          const people = res?.results || [];
          return (people.find((p) => p.known_for_department === "Directing") || people[0])?.id || null;
        })
      )
    ),
  ]);

  seeds.forEach((seed, i) => {
    const type = tmdbType(seed.row.media_type);
    (seedData[i]?.results || []).forEach((raw, pos) => add(raw, raw.media_type || type, seed.weight * (1 - pos / 30), seed.label));
  });

  // Phase 2: more from the directors behind the user's favourites, plus a
  // genre/trending top-up when the library is thin (or empty).
  const topDirectors = directorNames.map((d, i) => [directorIds[i], d]).filter(([id]) => id);
  const topGenres = Object.entries(profile)
    .filter(([, w]) => w > 0.25)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g)
    .filter((g) => genreIdFor(g))
    .slice(0, 3);
  const needFill = candidates.size < limit * 2;

  const phase2 = await Promise.all([
    ...topDirectors.map(([id]) =>
      soft(tmdb(env, "/discover/movie", { with_crew: id, sort_by: "vote_average.desc", "vote_count.gte": 300 }, 86400))
    ),
    ...(needFill
      ? topGenres.map((g) =>
          soft(
            tmdb(env, "/discover/movie", { with_genres: genreIdFor(g), sort_by: "vote_average.desc", "vote_count.gte": 1500, page }, 86400)
          )
        )
      : []),
    needFill ? soft(tmdb(env, "/trending/movie/week", { page }, 21600)) : null,
  ]);

  topDirectors.forEach(([, d], i) => {
    (phase2[i]?.results || []).forEach((raw, pos) => add(raw, "movie", 2.5 * (1 - pos / 40), `From ${d.name}, director of ${d.seed}`));
  });
  if (needFill) {
    topGenres.forEach((g, i) => {
      (phase2[topDirectors.length + i]?.results || []).forEach((raw, pos) =>
        add(raw, "movie", (personalized ? 0.8 : 2) * (1 - pos / 40), `Your top genre: ${g}`)
      );
    });
    (phase2[phase2.length - 1]?.results || []).forEach((raw, pos) =>
      add(raw, "movie", (personalized ? 0.5 : 1.5) * (1 - pos / 40), "Trending this week")
    );
  }

  // Score: graph points + genre affinity + quality, then a diversity pass so
  // one favourite doesn't fill the whole row.
  const scored = [...candidates.values()].map((e) => {
    const { card } = e;
    const affinity = canonicalGenres(card.genres).reduce((sum, g) => sum + (profile[g] || 0), 0);
    const quality = card.vote_count >= 200 ? ((card.rating || 0) - 6.8) * 0.6 : -0.6;
    const reasons = [...e.reasons.entries()].sort((a, b) => b[1] - a[1]);
    const hiddenGem = (card.rating || 0) >= 7.4 && card.vote_count >= 150 && card.vote_count <= 4000 && card.popularity < 25;
    return {
      ...card,
      score: e.points + affinity * 1.4 + quality + Math.log10(1 + card.popularity) * 0.15,
      reason: reasons[0]?.[0] || null,
      also: reasons.length > 1 ? reasons.length - 1 : 0,
      badge: hiddenGem ? "Hidden gem" : reasons.length >= 3 ? "Strong match" : null,
    };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  const perReason = new Map();
  const pool = [...scored];
  while (picked.length < limit && pool.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < Math.min(pool.length, 40); i++) {
      const s = pool[i].score * Math.pow(0.86, perReason.get(pool[i].reason) || 0);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    const [choice] = pool.splice(bestIdx, 1);
    perReason.set(choice.reason, (perReason.get(choice.reason) || 0) + 1);
    picked.push(choice);
  }

  return c.json({
    movies: picked,
    personalized,
    seeds: seeds.length,
    has_more: page < 5 && scored.length > picked.length,
  });
});

export default recs;
