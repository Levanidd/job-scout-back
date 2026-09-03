-- Keep one open row per opening (company + normalized title). Prefer an
-- application the user already acted on, then a Germany posting, then the
-- employer's own board, then a scored copy.
DELETE FROM jobs
WHERE id IN (
  SELECT id FROM (
    SELECT j.id,
      ROW_NUMBER() OVER (
        PARTITION BY j.dedup_key
        ORDER BY
          CASE j.status
            WHEN 'applied' THEN 0
            WHEN 'saved' THEN 1
            WHEN 'notified' THEN 2
            WHEN 'new' THEN 3
            ELSE 4
          END,
          CASE
            WHEN LOWER(COALESCE(j.location, '')) LIKE '%berlin%' THEN 0
            WHEN LOWER(COALESCE(j.location, '')) LIKE '%german%' THEN 1
            WHEN LOWER(COALESCE(j.location, '')) LIKE '%deutschland%' THEN 1
            ELSE 2
          END,
          CASE s.kind WHEN 'company' THEN 0 ELSE 1 END,
          CASE WHEN j.score IS NOT NULL THEN 0 ELSE 1 END,
          j.score DESC,
          j.first_seen_at ASC,
          j.id ASC
      ) AS rn
    FROM jobs j
    JOIN sources s ON s.id = j.source_id
    WHERE j.closed_at IS NULL
      AND j.dedup_key IS NOT NULL
      AND j.dedup_key != ''
  ) ranked
  WHERE rn > 1
);

-- Identical apply links left after the title match (query + company of the same board).
DELETE FROM jobs
WHERE id IN (
  SELECT id FROM (
    SELECT j.id,
      ROW_NUMBER() OVER (
        PARTITION BY j.url
        ORDER BY
          CASE j.status
            WHEN 'applied' THEN 0
            WHEN 'saved' THEN 1
            WHEN 'notified' THEN 2
            ELSE 3
          END,
          CASE s.kind WHEN 'company' THEN 0 ELSE 1 END,
          j.first_seen_at ASC,
          j.id ASC
      ) AS rn
    FROM jobs j
    JOIN sources s ON s.id = j.source_id
    WHERE j.closed_at IS NULL
  ) ranked
  WHERE rn > 1
);
