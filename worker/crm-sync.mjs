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

async function crmScheduledSync(env) {
 const id = crypto.randomUUID(), at = Date.now();
 await env.DB.prepare('INSERT INTO sync_runs(id,source,status,started_at) VALUES(?,?,?,?)').bind(id,'crm','running',at).run();
 try {
  if (!env.CRM_DB) throw Error('CRM未连接');
  const today = new Date(at + 8 * 3600000).toISOString().slice(0,10);
  const [rows,deals,quotes,contracts,receipts,refunds,losses,campaigns] =
   (await env.CRM_DB.batch(crmSummaryQueries(env.CRM_DB, today))).map(result => result.results);
  const snapshot = { version:2, at, today, rows, deals, quotes:quotes[0].quotes, contracts, receipts, refunds, losses, campaigns };
  await xput('crm:summary',snapshot,env);
  await env.DB.prepare('UPDATE sync_runs SET status=?,finished_at=? WHERE id=?').bind('succeeded',Date.now(),id).run();
  return snapshot;
 } catch (error) {
  await env.DB.prepare('UPDATE sync_runs SET status=?,finished_at=? WHERE id=?').bind('failed',Date.now(),id).run();
  throw error;
 }
}
