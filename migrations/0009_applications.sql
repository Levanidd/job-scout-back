-- Track the application pipeline separately from "I don't want this listing".
-- applied_at is the membership test for the Applied tab; rejected without it
-- stays a Jobs-list pass, not a company rejection.
ALTER TABLE jobs ADD COLUMN notes TEXT;
ALTER TABLE jobs ADD COLUMN applied_at TEXT;

UPDATE jobs
SET applied_at = datetime('now')
WHERE status = 'applied' AND applied_at IS NULL;
