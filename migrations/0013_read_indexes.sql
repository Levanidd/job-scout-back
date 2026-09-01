-- Partial indexes so list/join queries only walk open postings, not the whole table.
CREATE INDEX IF NOT EXISTS idx_jobs_open_source ON jobs(source_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_open_company ON jobs(company_key) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_open_score ON jobs(score, status) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_unscored ON jobs(status) WHERE closed_at IS NULL AND score IS NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_applied ON jobs(applied_at) WHERE applied_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_source_runs_source ON source_runs(source_id, id);
