CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, employee_id TEXT UNIQUE, role TEXT NOT NULL, permissions TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 1, salt TEXT NOT NULL, password_hash TEXT NOT NULL);

CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE attempts (id TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL);

CREATE TABLE xhs_settings (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE xhs_states (hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE files (id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes>=0), owner_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE marketing_snapshot(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE sync_runs(id TEXT PRIMARY KEY,source TEXT NOT NULL,status TEXT NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER);
CREATE INDEX sessions_user_expires ON sessions(user_id,expires);
CREATE INDEX attempts_expiry ON attempts(until_at);
CREATE INDEX xhs_states_expiry ON xhs_states(expires);
CREATE INDEX files_owner_created ON files(owner_id,created_at);
