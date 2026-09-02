-- Resume a large board across hops: write N jobs, then continue from offset.
ALTER TABLE cycles ADD COLUMN chunk_offset INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cycles ADD COLUMN chunk_started_at TEXT;
