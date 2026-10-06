-- `cycles` holds the one live run and is overwritten by the next, so the
-- history of runs — when each started and ended, and who or what started
-- it — needs a table of its own.
CREATE TABLE cycle_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL CHECK (kind IN ('manual', 'auto')),
  user_id     INTEGER REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'running',
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  sources     INTEGER NOT NULL DEFAULT 0,
  found       INTEGER NOT NULL DEFAULT 0,
  fresh       INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  scored      INTEGER NOT NULL DEFAULT 0,
  error       TEXT
);

CREATE INDEX idx_cycle_runs_started ON cycle_runs(started_at DESC);

ALTER TABLE cycles ADD COLUMN run_id INTEGER REFERENCES cycle_runs(id);

INSERT INTO cycle_runs (kind, user_id, status, started_at, finished_at, sources, found, fresh, failed, scored, error)
SELECT 'manual', user_id, status, started_at, finished_at, source_total, found, fresh, failed, scored, error
FROM cycles WHERE id = 1 AND started_at IS NOT NULL;

UPDATE cycles SET run_id = (SELECT MAX(id) FROM cycle_runs) WHERE id = 1 AND started_at IS NOT NULL;
