-- User-facing "updated" must not jump on every crawl. last_seen_at still
-- tracks whether the board still lists the job; changed_at moves only when
-- title, location, description or posted_at actually differ.
ALTER TABLE jobs ADD COLUMN changed_at TEXT;

UPDATE jobs SET changed_at = first_seen_at WHERE changed_at IS NULL;
