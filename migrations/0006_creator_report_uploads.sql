CREATE TABLE IF NOT EXISTS creator_report_uploads (
 id TEXT PRIMARY KEY,
 account_key TEXT NOT NULL,
 report_kind TEXT NOT NULL,
 sha256 TEXT NOT NULL,
 object_key TEXT NOT NULL,
 original_name TEXT NOT NULL,
 content_type TEXT NOT NULL,
 size_bytes INTEGER NOT NULL,
 uploaded_by TEXT NOT NULL,
 uploaded_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 UNIQUE(account_key, report_kind, sha256)
);
CREATE INDEX IF NOT EXISTS creator_report_uploads_account ON creator_report_uploads(account_key, uploaded_at DESC);
