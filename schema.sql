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

CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    tg_notify_create INTEGER DEFAULT 0,
    tg_notify_login INTEGER DEFAULT 0,
    tg_notify_update INTEGER DEFAULT 0
);
INSERT OR IGNORE INTO config (id, tg_notify_create, tg_notify_login, tg_notify_update) VALUES (1, 0, 0, 0);
