-- Both tables cascade from jobs(id), and their existing indexes lead with
-- user_id, so deleting a job or copying its rows on a repost merge scanned the
-- whole table each time.
CREATE INDEX IF NOT EXISTS idx_user_jobs_job ON user_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_interview_stages_job_id ON interview_stages(job_id);
