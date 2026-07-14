"""
One-off migration: adds `users.display_name`, and drops a stray legacy
UNIQUE index on `movies.imdb_id` alone (left over from before multi-user
support existed) which incorrectly blocks two different users from ever
saving the same movie -- the correct constraint is the composite
`uq_movies_user_imdb (user_id, imdb_id)`, added by migrate_add_users.py.
Run once by hand:

    venv/Scripts/python.exe migrate_add_display_name.py
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

engine = create_engine(os.getenv("DATABASE_URL"))


def main():
    with engine.begin() as conn:
        has_column = conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='users' AND column_name='display_name'"
        )).first()

        if not has_column:
            conn.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR"))
            print("Added users.display_name column")
        else:
            print("users.display_name already exists, skipping ALTER TABLE")

        has_legacy_index = conn.execute(text(
            "SELECT 1 FROM pg_indexes WHERE tablename='movies' AND indexname='ix_movies_imdb_id'"
        )).first()

        if has_legacy_index:
            conn.execute(text("DROP INDEX ix_movies_imdb_id"))
            print("Dropped legacy unique index ix_movies_imdb_id on movies.imdb_id")
        else:
            print("ix_movies_imdb_id already gone, skipping DROP INDEX")

    print("Migration complete.")


if __name__ == "__main__":
    main()
