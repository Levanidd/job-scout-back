-- Labels were derived from the domain, and on a shared board the domain is the
-- ATS: fourteen employers on Ashby all came out as "Ashbyhq". The token holds
-- the employer's own slug, so use it wherever the label is just a board name.
UPDATE sources
SET label = UPPER(SUBSTR(token, 1, 1)) || SUBSTR(token, 2)
WHERE kind = 'company'
  AND deleted_at IS NULL
  AND token NOT LIKE '%/%'
  AND LOWER(label) IN (
    'ashbyhq', 'greenhouse', 'lever', 'smartrecruiters', 'recruitee', 'workable',
    'personio', 'teamtailor', 'softgarden', 'join', 'workday', 'career', 'careers', 'jobs', 'apply'
  );
