-- Accounts share boards and postings. What a person does with a posting —
-- score, status, notes, applications — lives on user_jobs so two people can
-- look at the same opening and keep different verdicts.
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('master', 'user')),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id),
  content        TEXT NOT NULL DEFAULT '',
  prefilter_keep TEXT NOT NULL DEFAULT '[]',
  prefilter_drop TEXT NOT NULL DEFAULT '[]',
  blacklist      TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE user_jobs (
  user_id      INTEGER NOT NULL REFERENCES users(id),
  job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'new',
  score        INTEGER,
  score_reason TEXT,
  flags        TEXT,
  notes        TEXT,
  applied_at   TEXT,
  viewed_at    TEXT,
  later_at     TEXT,
  notified_at  TEXT,
  PRIMARY KEY (user_id, job_id)
);
CREATE INDEX idx_user_jobs_status ON user_jobs(user_id, status, score DESC);
CREATE INDEX idx_user_jobs_applied ON user_jobs(user_id, applied_at) WHERE applied_at IS NOT NULL;
CREATE INDEX idx_user_jobs_unscored ON user_jobs(user_id, job_id) WHERE score IS NULL;

ALTER TABLE cycles ADD COLUMN user_id INTEGER REFERENCES users(id);
