CREATE TABLE IF NOT EXISTS douyin_daily_metrics (
 account_key TEXT NOT NULL,
 metric_date TEXT NOT NULL,
 metric_key TEXT NOT NULL,
 metric_value INTEGER NOT NULL,
 report_id TEXT NOT NULL,
 report_uploaded_at INTEGER NOT NULL,
 PRIMARY KEY(account_key,metric_date,metric_key)
);
CREATE TABLE IF NOT EXISTS creator_report_sources (
 sha256 TEXT PRIMARY KEY,
 account_key TEXT NOT NULL,
 evidence TEXT NOT NULL
);
INSERT OR IGNORE INTO creator_report_sources VALUES (
 'eebf6005903e19a53439c90090ed84778a3167396df6e20d74e34364d97040dc','toy',
 '2026-11-04从本机已核实抖音号85639035334导出的文件，与上传原件SHA256一致'
);
