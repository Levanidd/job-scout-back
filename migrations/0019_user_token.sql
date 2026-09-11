-- Keep the plaintext token next to its hash so the master can hand it out
-- again instead of it being visible exactly once at creation time.
-- Rows created before this migration keep NULL until the token is reissued.
ALTER TABLE users ADD COLUMN token TEXT;
