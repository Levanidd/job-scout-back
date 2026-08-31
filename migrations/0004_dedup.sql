-- One opening reaches us from the employer's board and from every aggregator
-- that scraped it. Those copies share no id, so they are matched on who is
-- hiring and for what.
ALTER TABLE jobs ADD COLUMN dedup_key TEXT;

CREATE INDEX idx_jobs_dedup ON jobs (dedup_key) WHERE dedup_key IS NOT NULL;
