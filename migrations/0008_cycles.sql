-- One live cycle at a time. The admin starts it; the Worker walks sources,
-- scores, and sends the digest without keeping the browser tab open.
CREATE TABLE cycles (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'idle',
  phase TEXT NOT NULL DEFAULT 'sources',
  source_ids TEXT NOT NULL DEFAULT '[]',
  cursor INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  source_total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  current_label TEXT,
  current_id INTEGER,
  found INTEGER NOT NULL DEFAULT 0,
  fresh INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  scored INTEGER NOT NULL DEFAULT 0,
  notified INTEGER NOT NULL DEFAULT 0,
  hops INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  origin TEXT,
  started_at TEXT,
  updated_at TEXT,
  finished_at TEXT
);

INSERT INTO cycles (id, status) VALUES (1, 'idle');
