-- Images live in R2. Account + exact content key survives subsequent report uploads.
CREATE TABLE IF NOT EXISTS creator_content_covers (
 account_key TEXT NOT NULL,
 item_key TEXT NOT NULL,
 object_key TEXT NOT NULL,
 content_type TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 observed_at INTEGER NOT NULL,
 source TEXT NOT NULL,
 PRIMARY KEY(account_key,item_key)
);
CREATE INDEX IF NOT EXISTS creator_content_cover_lookup ON creator_content_covers(account_key,sha256);
