CREATE TABLE IF NOT EXISTS acquisition_leads (
 id TEXT PRIMARY KEY,
 platform TEXT NOT NULL,
 account_id TEXT NOT NULL DEFAULT '',
 account_name TEXT NOT NULL DEFAULT '',
 external_id TEXT NOT NULL,
 contact TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '',
 requirement TEXT NOT NULL DEFAULT '',
 source_kind TEXT NOT NULL,
 source_id TEXT NOT NULL DEFAULT '',
 entry_method TEXT NOT NULL,
 received_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending_source' CHECK(status IN ('pending_source','pending_handoff','crm_linked')),
 crm_customer_id TEXT,
 verified_at TEXT,
 evidence TEXT NOT NULL DEFAULT '',
 verified_source TEXT NOT NULL DEFAULT '{}',
 created_by TEXT NOT NULL,
 UNIQUE(platform,account_id,external_id)
);
CREATE TABLE IF NOT EXISTS acquisition_events (
 id TEXT PRIMARY KEY,
 lead_id TEXT NOT NULL REFERENCES acquisition_leads(id),
 kind TEXT NOT NULL,
 payload TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS acquisition_status_created ON acquisition_leads(status,received_at);
CREATE INDEX IF NOT EXISTS acquisition_crm_customer ON acquisition_leads(crm_customer_id);
