-- Release reminders and title quizzes.

CREATE TABLE IF NOT EXISTS reminders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users (id),
  tmdb_id      INTEGER NOT NULL,
  media_type   TEXT NOT NULL DEFAULT 'movie',     -- movie | series
  title        TEXT NOT NULL,
  poster       TEXT,
  backdrop     TEXT,
  release_date TEXT NOT NULL,                     -- YYYY-MM-DD
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  dismissed_at TEXT,                              -- set once the user has seen it's out
  UNIQUE (user_id, media_type, tmdb_id)
);
CREATE INDEX IF NOT EXISTS ix_reminders_user ON reminders (user_id, release_date);

-- A quiz is generated once and then shared, so everyone who takes it answers
-- the same questions and scores are comparable. `questions` is JSON and holds
-- the correct answers -- it is never sent to clients as-is.
CREATE TABLE IF NOT EXISTS quizzes (
  id          TEXT PRIMARY KEY,                   -- short random id, used in links
  creator_id  INTEGER NOT NULL REFERENCES users (id),
  tmdb_id     INTEGER NOT NULL,
  media_type  TEXT NOT NULL DEFAULT 'movie',
  title       TEXT NOT NULL,
  poster      TEXT,
  backdrop    TEXT,
  questions   TEXT NOT NULL,
  has_ai      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ix_quizzes_creator ON quizzes (creator_id, created_at);

-- First attempt per person counts (keeps friend leaderboards fair).
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id    TEXT NOT NULL REFERENCES quizzes (id),
  user_id    INTEGER NOT NULL REFERENCES users (id),
  score      INTEGER NOT NULL,
  total      INTEGER NOT NULL,
  answers    TEXT NOT NULL,                       -- JSON array of chosen option indexes
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (quiz_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_attempts_user ON quiz_attempts (user_id, created_at);

CREATE TABLE IF NOT EXISTS quiz_invites (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id      TEXT NOT NULL REFERENCES quizzes (id),
  sender_id    INTEGER NOT NULL REFERENCES users (id),
  recipient_id INTEGER NOT NULL REFERENCES users (id),
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending | done | dismissed
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (quiz_id, recipient_id)
);
CREATE INDEX IF NOT EXISTS ix_invites_recipient ON quiz_invites (recipient_id, status);
