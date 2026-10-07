-- Per person, like notes: which CV went with this application, and what
-- Claude made of the posting. Both are written over the API, the card only shows them.
ALTER TABLE user_jobs ADD COLUMN cv_url TEXT;
ALTER TABLE user_jobs ADD COLUMN claude_comment TEXT;
