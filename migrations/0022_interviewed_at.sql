-- A rejection used to replace "interview", so the fact of the interview was gone
-- and the stats counted the application only as a rejection. interviewed_at
-- stays once an interview happened, whatever status comes after it.
ALTER TABLE user_jobs ADD COLUMN interviewed_at TEXT;

UPDATE user_jobs
SET interviewed_at = COALESCE(applied_at, datetime('now'))
WHERE status = 'interview' AND interviewed_at IS NULL;
