CREATE TABLE IF NOT EXISTS allocation_reviews (
 id TEXT PRIMARY KEY,
 scope TEXT NOT NULL,
 month TEXT NOT NULL,
 payload TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS allocation_reviews_period ON allocation_reviews(scope,month,created_at);
