ALTER TABLE jobs ADD COLUMN viewed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_viewed ON jobs(viewed_at) WHERE viewed_at IS NOT NULL;
