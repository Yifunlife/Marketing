CREATE TABLE IF NOT EXISTS creator_content_items(
 report_id TEXT NOT NULL,
 account_key TEXT NOT NULL,
 item_key TEXT NOT NULL,
 title TEXT NOT NULL,
 published_at TEXT,
 plays INTEGER,
 likes INTEGER,
 comments INTEGER,
 shares INTEGER,
 collects INTEGER,
 followers INTEGER,
 completion REAL,
 cover_url TEXT,
 item_url TEXT,
 PRIMARY KEY(report_id,item_key)
);
CREATE INDEX IF NOT EXISTS creator_content_account ON creator_content_items(account_key,report_id);
