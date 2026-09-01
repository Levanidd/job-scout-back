-- Default title tags, same phrases that used to live in the worker regex.
INSERT OR IGNORE INTO settings (key, value) VALUES
  (
    'prefilter_keep',
    '["product manager","product owner","principal product","group product","head of product","product lead","technical product","platform product","ai product"]'
  ),
  (
    'prefilter_drop',
    '["intern","working student","praktikum","werkstudent","ausbildung"]'
  );
