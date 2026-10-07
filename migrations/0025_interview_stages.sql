-- The rounds a person went through for one application: "HR screen",
-- "tech interview", "offer call". Per user, like the rest of user_jobs.
CREATE TABLE interview_stages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  happened_on TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_interview_stages_job ON interview_stages(user_id, job_id);
