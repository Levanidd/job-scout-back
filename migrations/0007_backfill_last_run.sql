-- A killed Worker can leave jobs in the table without ever writing last_run_at,
-- so the card says "never ran" next to a live count. Fill the gap from the jobs.
UPDATE sources
SET last_run_at = (
  SELECT MAX(last_seen_at) FROM jobs WHERE jobs.source_id = sources.id
)
WHERE last_run_at IS NULL
  AND EXISTS (SELECT 1 FROM jobs WHERE jobs.source_id = sources.id);
