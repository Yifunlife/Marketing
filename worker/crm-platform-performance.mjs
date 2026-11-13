const crmPerformancePlatforms=['抖音','小红书','视频号','Instagram','Facebook','YouTube','TikTok','阿里巴巴','独立站','WhatsApp'];
const crmPerformanceLeads=`WITH attributed AS (
 SELECT l.id,COALESCE(${crmSalesReportDay('l.entered')},${crmSalesReportDay('l.created')}) AS acquired_day,
 CASE WHEN c.platform IN ('抖音','小红书','视频号','Instagram','Facebook','YouTube','TikTok','阿里巴巴','独立站','WhatsApp') THEN c.platform
 WHEN trim(l.source) IN ('抖音','小红书','视频号','Instagram','Facebook','YouTube','TikTok','独立站','WhatsApp') THEN trim(l.source)
 WHEN trim(l.source) IN ('阿里','阿里巴巴') THEN '阿里巴巴'
 WHEN trim(l.source)='WhatsApp 自动同步' THEN 'WhatsApp' END AS platform
 FROM crm_leads l JOIN crm_users u ON u.id=l.owner_id AND u.active=1
 LEFT JOIN crm_attribution_leads a ON a.lead_id=l.id AND a.source_kind='广告活动'
 LEFT JOIN crm_attribution_campaigns c ON c.id=a.campaign_id
 WHERE ${crmReportCustomers}
)`;
async function crmPlatformPerformanceApi(req,env,user){
 if(req.method!=='GET')return json({error:'请求方式不支持'},405);
 if(!opsSyncAllowed(user)&&!opsSyncAllowed(user,false,1))return json({error:'请使用有运营中心权限的账号'},403);
 if(!env.CRM_DB)return json({error:'CRM 暂未连接'},503);
 const today=new Date(Date.now()+28800000).toISOString().slice(0,10);
 const periods={month:today.slice(0,7)+'-01',year:today.slice(0,4)+'-01-01'};
 const statements=[];
 for(const start of Object.values(periods)){
  statements.push(env.CRM_DB.prepare(`${crmPerformanceLeads}
   SELECT l.platform,COUNT(*) AS customers,
    SUM(CASE WHEN EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0 AND d.deal_date BETWEEN l.acquired_day AND ?) THEN 1 ELSE 0 END) AS converted
   FROM attributed l WHERE l.acquired_day BETWEEN ? AND ? AND l.platform IS NOT NULL GROUP BY l.platform`).bind(today,start,today));
  statements.push(env.CRM_DB.prepare(`${crmPerformanceLeads}
   SELECT l.platform,w.currency,COUNT(*) AS orders,COUNT(w.total_minor) AS priced,SUM(w.total_minor) AS amount_minor
   FROM crm_deals d JOIN attributed l ON l.id=d.lead_id
   LEFT JOIN crm_workflow_contracts w ON w.deal_id=d.id
   WHERE d.cancelled=0 AND d.deal_date BETWEEN ? AND ? AND l.platform IS NOT NULL GROUP BY l.platform,w.currency`).bind(start,today));
 }
 const results=await env.CRM_DB.batch(statements),platforms={};
 for(const platform of crmPerformancePlatforms){
  const domestic=['抖音','小红书','视频号'].includes(platform);
  if(!opsSyncAllowed(user,false,domestic?2:1))continue;
  platforms[platform]={};
  for(const [index,period] of Object.keys(periods).entries()){
   const cohort=results[index*2].results.find(row=>row.platform===platform);
   const amounts=results[index*2+1].results.filter(row=>row.platform===platform);
   platforms[platform][period]={
    start:periods[period],end:today,customers:cohort?.customers||0,converted:cohort?.converted||0,
    conversion:cohort?.customers?cohort.converted/cohort.customers*100:null,
    amounts:amounts.filter(row=>row.currency&&row.priced).map(row=>({currency:row.currency,amount_minor:row.amount_minor})),
    orders:amounts.reduce((n,row)=>n+row.orders,0),
    unpriced:amounts.reduce((n,row)=>n+(!row.currency?row.orders:row.orders-row.priced),0)
   };
  }
 }
 return json({updated_at:Date.now(),platforms});
}
