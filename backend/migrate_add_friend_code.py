"""
One-off migration: adds `users.friend_code`, backfills a unique code for
every existing user, then enforces NOT NULL + UNIQUE. Run once by hand:

    venv/Scripts/python.exe migrate_add_friend_code.py
"""

import os
import sys

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

sys.path.insert(0, os.path.dirname(__file__))

from app.auth import generate_friend_code

engine = create_engine(os.getenv("DATABASE_URL"))


def main():
    with engine.begin() as conn:
        has_column = conn.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='users' AND column_name='friend_code'"
        )).first()

        if not has_column:
            conn.execute(text("ALTER TABLE users ADD COLUMN friend_code VARCHAR"))
            print("Added users.friend_code column")
        else:
            print("users.friend_code already exists, skipping ALTER TABLE")

        rows = conn.execute(text("SELECT id FROM users WHERE friend_code IS NULL")).fetchall()
        existing_codes = set(
            row[0] for row in conn.execute(text("SELECT friend_code FROM users WHERE friend_code IS NOT NULL")).fetchall()
        )

        for (user_id,) in rows:
            code = generate_friend_code()
            while code in existing_codes:
                code = generate_friend_code()
            existing_codes.add(code)
            conn.execute(text("UPDATE users SET friend_code = :code WHERE id = :id"), {"code": code, "id": user_id})

        if rows:
            print(f"Backfilled friend_code for {len(rows)} user(s)")

        has_unique = conn.execute(text(
            "SELECT 1 FROM pg_indexes WHERE tablename='users' AND indexname='ix_users_friend_code'"
        )).first()
        if not has_unique:
            conn.execute(text("CREATE UNIQUE INDEX ix_users_friend_code ON users (friend_code)"))
            print("Added unique index on users.friend_code")
        else:
            print("ix_users_friend_code already exists, skipping")

        conn.execute(text("ALTER TABLE users ALTER COLUMN friend_code SET NOT NULL"))

    print("Migration complete.")


if __name__ == "__main__":
    main()
