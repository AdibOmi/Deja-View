"""
One-off migration: adds the `users` table, backfills a `user_id` column on
the existing `movies` table, and assigns all pre-existing rows to a new
account so no data is lost. Run once by hand:

    venv/Scripts/python.exe migrate_add_users.py
"""

import json
import os
import sys

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))

from app.db.db import Base
from app.models.user import User
from app.models.movie import Movie
from app.auth import hash_password

MIGRATION_USERNAME = "Lamia Sifat"
MIGRATION_PASSWORD = "yeana"

engine = create_engine(os.getenv("DATABASE_URL"))


def backup_movies(conn):
    rows = conn.execute(text("SELECT * FROM movies")).mappings().all()
    backup_path = os.path.join(os.path.dirname(__file__), "movies_backup_pre_auth.json")
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump([dict(r) for r in rows], f, default=str, indent=2)
    print(f"Backed up {len(rows)} rows to {backup_path}")


def main():
    with engine.connect() as conn:
        backup_movies(conn)

    # Creates the `users` table (movies already exists, so this is a no-op for it).
    Base.metadata.create_all(bind=engine, tables=[User.__table__])

    with engine.begin() as conn:
        has_column = conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='movies' AND column_name='user_id'"
        )).first()

        if not has_column:
            conn.execute(text("ALTER TABLE movies ADD COLUMN user_id INTEGER"))
            print("Added movies.user_id column")
        else:
            print("movies.user_id already exists, skipping ALTER TABLE")

        existing_user = conn.execute(
            text("SELECT id FROM users WHERE username = :u"),
            {"u": MIGRATION_USERNAME},
        ).first()

        if existing_user:
            user_id = existing_user[0]
            print(f"User '{MIGRATION_USERNAME}' already exists (id={user_id})")
        else:
            result = conn.execute(
                text("INSERT INTO users (username, hashed_password) VALUES (:u, :p) RETURNING id"),
                {"u": MIGRATION_USERNAME, "p": hash_password(MIGRATION_PASSWORD)},
            )
            user_id = result.first()[0]
            print(f"Created user '{MIGRATION_USERNAME}' (id={user_id})")

        result = conn.execute(
            text("UPDATE movies SET user_id = :uid WHERE user_id IS NULL"),
            {"uid": user_id},
        )
        print(f"Backfilled user_id on {result.rowcount} existing movie rows")

        conn.execute(text("ALTER TABLE movies ALTER COLUMN user_id SET NOT NULL"))

        has_fk = conn.execute(text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE table_name='movies' AND constraint_name='fk_movies_user_id'"
        )).first()
        if not has_fk:
            conn.execute(text(
                "ALTER TABLE movies ADD CONSTRAINT fk_movies_user_id "
                "FOREIGN KEY (user_id) REFERENCES users(id)"
            ))
            print("Added FK constraint on movies.user_id")

        has_unique = conn.execute(text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE table_name='movies' AND constraint_name='uq_movies_user_imdb'"
        )).first()
        if not has_unique:
            conn.execute(text(
                "ALTER TABLE movies ADD CONSTRAINT uq_movies_user_imdb "
                "UNIQUE (user_id, imdb_id)"
            ))
            print("Added UNIQUE(user_id, imdb_id) constraint")

    print("Migration complete.")


if __name__ == "__main__":
    main()
