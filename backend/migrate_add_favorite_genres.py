"""
One-off migration: adds `users.favorite_genres` -- a comma-separated list
of genre names picked during the post-signup onboarding step, used to seed
recommendations for brand new accounts that haven't rated anything yet.
Run once by hand:

    venv/Scripts/python.exe migrate_add_favorite_genres.py
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL)


def main():
    with engine.begin() as conn:
        has_column = conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='users' AND column_name='favorite_genres'"
        )).first()

        if not has_column:
            conn.execute(text("ALTER TABLE users ADD COLUMN favorite_genres VARCHAR"))
            print("Added users.favorite_genres column")
        else:
            print("users.favorite_genres already exists, skipping ALTER TABLE")

    print("Migration complete.")


if __name__ == "__main__":
    main()
