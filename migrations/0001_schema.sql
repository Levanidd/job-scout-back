CREATE TABLE sources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'watchlist',
  label       TEXT NOT NULL,
  provider    TEXT NOT NULL,
  token       TEXT NOT NULL,
  careers_url TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  deleted_at  TEXT,
  last_run_at TEXT,
  last_count  INTEGER,
  bootstrapped INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, token)
);

CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  source_id     INTEGER NOT NULL REFERENCES sources(id),
  external_id   TEXT NOT NULL,
  company       TEXT NOT NULL,
  company_key   TEXT NOT NULL,
  title         TEXT NOT NULL,
  location      TEXT,
  url           TEXT NOT NULL,
  description   TEXT,
  posted_at     TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at     TEXT,
  score         INTEGER,
  score_reason  TEXT,
  flags         TEXT,
  notified_at   TEXT,
  status        TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX idx_jobs_status  ON jobs(status, score DESC);
CREATE INDEX idx_jobs_company ON jobs(company_key);

CREATE TABLE discovered_companies (
  company_key   TEXT PRIMARY KEY,
  company       TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  hits          INTEGER NOT NULL DEFAULT 1,
  best_score    INTEGER,
  sample_url    TEXT,
  careers_url   TEXT,
  detected_ats  TEXT,
  state         TEXT NOT NULL DEFAULT 'new'
);

CREATE TABLE source_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ok INTEGER NOT NULL,
  jobs_found INTEGER,
  jobs_new INTEGER,
  error TEXT,
  duration_ms INTEGER,
  suspicious INTEGER DEFAULT 0
);

CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id=1),
  content TEXT NOT NULL
);
