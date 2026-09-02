-- Catch-all source for applications that have no ATS board to scrape.
INSERT OR IGNORE INTO sources (kind, tier, label, provider, token, enabled)
VALUES ('company', 'watchlist', 'Вручную', 'manual', 'manual', 0);
