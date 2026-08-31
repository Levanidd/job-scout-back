-- Openings dropped by the title prefilter were parked under 'ignored', the same
-- status a job gets when it is hidden by hand. They are worth browsing — that
-- pile is where a role the prefilter does not know about shows up — so they get
-- a status of their own.
UPDATE jobs SET status = 'off_profile'
WHERE status = 'ignored' AND score_reason = 'prefilter';
