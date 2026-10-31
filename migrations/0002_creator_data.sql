CREATE TABLE IF NOT EXISTS creator_accounts (
 account_id TEXT PRIMARY KEY,
 display_name TEXT NOT NULL,
 fans INTEGER NOT NULL CHECK(fans >= 0),
 fans_source TEXT NOT NULL,
 observed_at INTEGER NOT NULL,
 last_success_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS creator_daily (
 account_id TEXT NOT NULL REFERENCES creator_accounts(account_id),
 date TEXT NOT NULL,
 metrics_json TEXT NOT NULL,
 observed_at INTEGER NOT NULL,
 PRIMARY KEY(account_id,date)
);
