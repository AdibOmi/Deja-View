-- Deja View schema for Cloudflare D1 (SQLite).
-- Mirrors the old Postgres tables, plus tmdb_id / backdrop / rewatch tracking.

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT NOT NULL UNIQUE,
  hashed_password TEXT NOT NULL,
  display_name    TEXT,
  friend_code     TEXT UNIQUE,
  favorite_genres TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ix_users_username_nocase ON users (username COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS movies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users (id),
  tmdb_id       INTEGER,
  imdb_id       TEXT,
  media_type    TEXT NOT NULL DEFAULT 'movie',   -- movie | series
  title         TEXT NOT NULL,
  poster        TEXT,
  backdrop      TEXT,
  year          TEXT,
  runtime       TEXT,
  genre         TEXT,                            -- comma separated names
  director      TEXT,
  actors        TEXT,
  plot          TEXT,
  imdb_rating   TEXT,
  tmdb_rating   REAL,
  my_rating     REAL,
  my_comment    TEXT,
  watch_comment TEXT,
  is_watched    INTEGER NOT NULL DEFAULT 1,
  rewatch_count INTEGER NOT NULL DEFAULT 0,
  added_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  watched_at    TEXT
);
CREATE INDEX IF NOT EXISTS ix_movies_user ON movies (user_id, is_watched);
CREATE UNIQUE INDEX IF NOT EXISTS uq_movies_user_tmdb ON movies (user_id, media_type, tmdb_id) WHERE tmdb_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_movies_user_imdb ON movies (user_id, imdb_id) WHERE imdb_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS friendships (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users (id),
  addressee_id INTEGER NOT NULL REFERENCES users (id),
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  responded_at TEXT,
  UNIQUE (requester_id, addressee_id)
);
CREATE INDEX IF NOT EXISTS ix_friendships_addressee ON friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS ix_friendships_requester ON friendships (requester_id, status);

CREATE TABLE IF NOT EXISTS shared_movies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id   INTEGER NOT NULL REFERENCES users (id),
  receiver_id INTEGER NOT NULL REFERENCES users (id),
  tmdb_id     INTEGER,
  imdb_id     TEXT,
  media_type  TEXT NOT NULL DEFAULT 'movie',
  title       TEXT NOT NULL,
  poster      TEXT,
  imdb_rating TEXT,
  comment     TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',   -- pending | added | dismissed
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ix_shares_receiver ON shared_movies (receiver_id, status);
CREATE INDEX IF NOT EXISTS ix_shares_sender ON shared_movies (sender_id);
