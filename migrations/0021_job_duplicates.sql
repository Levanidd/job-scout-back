-- Live copies of one opening on different boards stay as their own rows. The
-- one the list shows has duplicate_of NULL; the others point at it. A person
-- picks the primary from the job card instead of ingest deleting the extra.

ALTER TABLE jobs ADD COLUMN duplicate_of TEXT REFERENCES jobs(id);
CREATE INDEX idx_jobs_duplicate_of ON jobs(duplicate_of);
