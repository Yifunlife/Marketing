const crmReportCustomers = `channel <> '模拟流程演练' AND COALESCE(grade, '') NOT IN ('Yifun Staff', '同事')`;
const crmReportLeads = `WITH leads AS (
 SELECT l.*, COALESCE(date(l.entered), date(l.created, '+8 hours')) AS acquired_day
 FROM crm_leads l WHERE ${crmReportCustomers}
)`;
const crmReportDeals = `FROM crm_deals d JOIN leads l ON l.id=d.lead_id`;
const crmConfirmedCampaign = `JOIN crm_attribution_leads a ON a.lead_id=l.id AND a.source_kind='广告活动'
 JOIN crm_attribution_campaigns c ON c.id=a.campaign_id
 JOIN crm_operation_accounts o ON o.id=c.account_id AND o.platform=c.platform`;

function crmSummaryQueries(db, today) {
 const month = today.slice(0, 7), start = month + '-01';
 const money = (date, currency, amount, join, filter) => db.prepare(`${crmReportLeads}
  SELECT ${currency} AS currency, SUM(${amount}) AS amount_minor
  ${crmReportDeals} ${join}
  WHERE d.cancelled=0 AND ${date} BETWEEN ? AND ? ${filter}
  GROUP BY ${currency} ORDER BY ${currency}`).bind(start, today);
 return [
  db.prepare(`${crmReportLeads}
   SELECT l.business_scope, l.source, COUNT(*) AS customers,
    COUNT(CASE WHEN l.acquired_day BETWEEN ? AND ? THEN 1 END) AS new_customers,
    COUNT(CASE WHEN l.grade='A' THEN 1 END) AS a_customers,
    COUNT(CASE WHEN l.last_contact<>'' THEN 1 END) AS contacted,
    COUNT(CASE WHEN q.state='有效' THEN 1 END) AS valid_customers,
    COUNT(CASE WHEN q.state='无效' THEN 1 END) AS invalid_customers,
    COUNT(CASE WHEN l.status='待首次联系' THEN 1 END) AS awaiting_first_contact,
    COUNT(CASE WHEN l.next_date<>'' AND l.next_date<?
     AND l.status NOT IN ('已成交','已结束','暂停跟进')
     AND NOT EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0)
     THEN 1 END) AS overdue
   FROM leads l LEFT JOIN crm_attribution_quality q ON q.lead_id=l.id
   GROUP BY l.business_scope,l.source ORDER BY l.business_scope,customers DESC,l.source`).bind(start, today, today),
  db.prepare(`${crmReportLeads}
   SELECT d.business_scope,l.source,COUNT(*) AS orders,COUNT(DISTINCT d.lead_id) AS customers,
    COUNT(CASE WHEN w.total_minor IS NULL OR COALESCE(w.currency,'')='' THEN 1 END) AS unpriced
   ${crmReportDeals} LEFT JOIN crm_workflow_contracts w ON w.deal_id=d.id
   WHERE d.cancelled=0 AND d.deal_date BETWEEN ? AND ?
   GROUP BY d.business_scope,l.source`).bind(start, today),
  db.prepare(`${crmReportLeads}
   SELECT COUNT(*) AS quotes FROM crm_sales_quote_links q
   JOIN crm_sales_projects p ON p.project_id=q.project_id JOIN leads l ON l.id=p.lead_id
   WHERE date(q.created,'+8 hours') BETWEEN ? AND ?`).bind(start, today),
  money('d.deal_date','w.currency','w.total_minor',
   'JOIN crm_workflow_contracts w ON w.deal_id=d.id', "AND w.total_minor IS NOT NULL AND w.currency<>''"),
  money('r.received_date','r.currency','r.amount_minor',
   'JOIN crm_receipts r ON r.deal_id=d.id', 'AND r.cancelled=0'),
  money('f.refunded_date','r.currency','f.amount_minor',
   'JOIN crm_receipts r ON r.deal_id=d.id JOIN crm_workflow_refunds f ON f.receipt_id=r.id', 'AND r.cancelled=0'),
  db.prepare(`${crmReportLeads}
   SELECT t.reason,COUNT(*) AS customers FROM crm_lead_outcomes t
   JOIN leads l ON l.id=t.lead_id
   WHERE date(t.updated,'+8 hours') BETWEEN ? AND ?
    AND l.status='已结束' AND NOT EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0)
   GROUP BY t.reason ORDER BY customers DESC,t.reason`).bind(start, today),
  db.prepare(`${crmReportLeads}
   SELECT c.platform,o.id AS account_id,o.name AS account,c.id AS campaign_id,c.name AS campaign,
    COUNT(*) AS customers,COUNT(CASE WHEN q.state='有效' THEN 1 END) AS valid_customers
   FROM leads l ${crmConfirmedCampaign}
   LEFT JOIN crm_attribution_quality q ON q.lead_id=l.id
   WHERE l.acquired_day BETWEEN ? AND ?
   GROUP BY c.id,c.platform,o.name,c.name ORDER BY customers DESC,c.id`).bind(start, today)
 ];
}

async function crmScheduledSync(env, source='crm') {
 const id = crypto.randomUUID(), at = Date.now();
 const started = await env.DB.prepare(`INSERT INTO sync_runs(id,source,status,started_at)
  SELECT ?,?,'running',? WHERE NOT EXISTS(
   SELECT 1 FROM sync_runs WHERE source IN ('crm','crm_manual') AND
    ((status='running' AND started_at>?) OR (?='crm_manual' AND started_at>?))
  )`).bind(id,source,at,at-15*60000,source,at-60000).run();
 if (!started.meta?.changes) return false;
 try {
  if (!env.CRM_DB) throw Error('CRM未连接');
  const today = new Date(at + 8 * 3600000).toISOString().slice(0,10);
  const [rows,deals,quotes,contracts,receipts,refunds,losses,campaigns] =
   (await env.CRM_DB.batch(crmSummaryQueries(env.CRM_DB, today))).map(result => result.results);
  const writtenAt = Date.now();
  const snapshot = { version:2, run_id:id, trigger:source==='crm_manual'?'manual':'scheduled', at, written_at:writtenAt, today, rows, deals, quotes:quotes[0].quotes, contracts, receipts, refunds, losses, campaigns };
  const payload = await xseal(snapshot,env);
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO xhs_settings(id,payload,updated_at) VALUES(?,?,?)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
    WHERE xhs_settings.updated_at<=excluded.updated_at`).bind('crm:summary',payload,at),
   env.DB.prepare(`UPDATE sync_runs SET finished_at=?,status=CASE
    WHEN EXISTS(SELECT 1 FROM xhs_settings WHERE id=? AND payload=?) THEN 'succeeded'
    ELSE 'skipped' END WHERE id=?`).bind(writtenAt,'crm:summary',payload,id)
  ]);
  return true;
 } catch (error) {
  await env.DB.prepare('UPDATE sync_runs SET status=?,finished_at=? WHERE id=?').bind('failed',Date.now(),id).run();
  throw error;
 }
}


function crmExpectedSlot(now) {
 const day = new Date(now+8*3600000).toISOString().slice(0,10);
 const localMidnight = Date.parse(day+'T00:00:00+08:00');
 const hours = 3600000;
 return [22,12,8,-2].map(hour=>localMidnight+hour*hours).find(slot=>slot<=now);
}

async function crmSummaryApi(req,env,user) {
 if (user.role!=='owner'||user.must_change) return json({error:'仅主管理员可读取业务报表'},403);
 if (req.method==='POST') {
  try {
   const started = await crmScheduledSync(env,'crm_manual');
   if (!started) return json({error:'正在同步或刚已执行，请稍后查看'},409);
  } catch {
   return json({error:'补跑失败，保留上次报表'},502);
  }
 } else if (req.method!=='GET') return json({error:'请求方式不支持'},405);
 const [saved,latest] = await env.DB.batch([
  env.DB.prepare('SELECT payload,updated_at FROM xhs_settings WHERE id=?').bind('crm:summary'),
  env.DB.prepare(`SELECT id,status,started_at,finished_at FROM sync_runs
   WHERE source IN ('crm','crm_manual') ORDER BY started_at DESC,id DESC LIMIT 1`)
 ]);
 const row = saved.results[0], run = latest.results[0];
 const stored = row ? await xopen(row.payload,env) : null;
 const report = stored?.version===2 ? {...stored,written_at:stored.written_at??row.updated_at} : null;
 const isCurrent = report && run && (report.run_id ? report.run_id===run.id : report.at===run.started_at);
 const now = Date.now(), expected = crmExpectedSlot(now);
 const thisSlot = run?.started_at>=expected;
 let status = 'waiting';
 if (thisSlot && run.status==='running' && now-run.started_at<15*60000) status = 'running';
 else if (thisSlot && run.status==='failed') status = 'failed';
 else if (thisSlot && isCurrent && run.status==='succeeded') status = 'succeeded';
 else if (now-expected>=15*60000) status = 'stale';
 return json({report,status,expected_at:expected});
}
