-- Users who pressed "run" while another run was live: they join it and get
-- their own scoring pass once the current user's pass is done.
ALTER TABLE cycles ADD COLUMN score_queue TEXT NOT NULL DEFAULT '[]';
