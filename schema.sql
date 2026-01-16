DROP TABLE IF EXISTS links;
CREATE TABLE links (
    slug TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    status TEXT DEFAULT 'active',
    interstitial INTEGER DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    creator_ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_expires_at ON links(expires_at);
