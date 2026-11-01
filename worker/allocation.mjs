function allocationPeriod(month){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('请选择有效考核月份');const start=month+'-01',next=new Date(start+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);return {start,end:next.toISOString().slice(0,10),month};}
function allocationShares(rows,performance){if(!rows.some(r=>r.active&&r.state==='参与'))return rows.map(r=>({...r,proposed_share:0}));const members=rows.filter(r=>r.active&&r.state==='参与');const rated=members.filter(r=>r.mature>0),baseline=rated.length?rated.reduce((n,r)=>n+r.won/r.mature,0)/rated.length:0;const score=r=>r.mature?r.won/r.mature:baseline;const total=members.reduce((n,r)=>n+score(r),0);let remaining=10000;const fractions=members.map(r=>{const equal=10000/members.length;const raw=total?(1-performance/100)*equal+(performance/100)*10000*score(r)/total:equal;const points=Math.floor(raw);remaining-=points;return {id:r.id,points,fraction:raw-points};});fractions.sort((a,b)=>b.fraction-a.fraction||a.id.localeCompare(b.id));for(let i=0;i<remaining;i++)fractions[i%fractions.length].points++;return rows.map(r=>({...r,proposed_share:(fractions.find(f=>f.id===r.id)?.points||0)/100}));}
async function allocationApi(req,env,user){
 if(user.role!=='owner'||user.must_change)return json({error:'仅主管理员可查看分配与业绩'},403);
 if(!['GET','POST'].includes(req.method))return json({error:'操作不支持'},405);
 if(!env.CRM_DB)return json({error:'业务CRM未连接'},503);
 let body={};try{if(req.method==='POST')body=await req.json();}catch{return json({error:'请求内容无效'},400);}
 const url=new URL(req.url),month=body.month||url.searchParams.get('month')||new Date(Date.now()+8*3600000).toISOString().slice(0,7),scope=body.scope||url.searchParams.get('scope')||'all';let period;try{period=allocationPeriod(month);}catch(e){return json({error:e.message},400);}
 const maturity=Number(body.maturity??url.searchParams.get('maturity')??30),performance=Number(body.performance??url.searchParams.get('performance')??40);
 if(!Number.isInteger(maturity)||maturity<1||maturity>180||!Number.isFinite(performance)||performance<0||performance>100)return json({error:'观察期应为1至180天，业绩权重应为0至100'},400);
 if(req.method==='POST'&&body.action!=='save_draft')return json({error:'这里只保存建议方案，实际分配请在业务CRM执行'},400);
 try{
 const db=env.CRM_DB;const configs=await db.prepare('SELECT scope,payload,updated FROM crm_allocation_configs ORDER BY scope').all();const selected=(configs.results||[]).find(r=>r.scope===scope);if(!selected)return json({error:'该业务范围尚未在CRM配置分配规则'},400);const config=crmObject(selected.payload);
 const scopeSql=scope==='all'?'':' AND a.business_scope=?',scopeArgs=scope==='all'?[]:[scope];
 const asOf=new Date(Math.min(Date.now(),Date.parse(period.end+'T00:00:00+08:00'))).toISOString();
 const [users,stats,confirmed,pool,saved]=await Promise.all([
 db.prepare('SELECT id,name,active FROM crm_users').all(),
 db.prepare(`WITH eligible AS (
 SELECT a.user_id,a.lead_id,a.created,a.business_scope FROM crm_assignments a JOIN crm_leads l ON l.id=a.lead_id
 WHERE l.channel<>'模拟流程演练' AND l.cohort='new' AND a.policy NOT IN ('historical-sheet-v1','test-simulation')
 AND julianday(a.created)>=julianday(?) AND julianday(a.created)<julianday(?) ${scopeSql}
 AND a.id=(SELECT a2.id FROM crm_assignments a2 WHERE a2.lead_id=a.lead_id AND a2.policy NOT IN ('historical-sheet-v1','test-simulation') ORDER BY a2.created,a2.id LIMIT 1)
 ) SELECT e.user_id,COUNT(*) assigned,
 SUM(CASE WHEN julianday(?)-julianday(e.created)>=? THEN 1 ELSE 0 END) mature,
 SUM(CASE WHEN julianday(?)-julianday(e.created)>=? AND EXISTS(SELECT 1 FROM crm_deals d WHERE d.lead_id=e.lead_id AND d.owner_id=e.user_id AND d.business_scope=e.business_scope AND d.cancelled=0 AND d.deal_date>=substr(e.created,1,10) AND d.deal_date<?) THEN 1 ELSE 0 END) won
 FROM eligible e GROUP BY e.user_id`).bind(period.start+'T00:00:00+08:00',period.end+'T00:00:00+08:00',...scopeArgs,asOf,maturity,asOf,maturity,period.end).all(),
 db.prepare('SELECT scope,month,payload,confirmed FROM crm_allocation_plans WHERE scope=? AND month=?').bind(scope,period.end.slice(0,7)).first(),
 db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN owner_id IS NULL OR owner_id='' THEN 1 ELSE 0 END) unassigned,SUM(CASE WHEN cohort='unknown' THEN 1 ELSE 0 END) unknown_cohort FROM crm_leads WHERE channel<>'模拟流程演练'").first(),
 env.DB.prepare('SELECT id,created_at,payload FROM allocation_reviews WHERE scope=? AND month=? ORDER BY created_at DESC,id LIMIT 1').bind(scope,month).first()
 ]);
 const rows=(config.members||[]).map(m=>{const u=(users.results||[]).find(u=>u.id===m.user_id),s=(stats.results||[]).find(s=>s.user_id===m.user_id);return {id:m.user_id,name:u?.name||'CRM人员已缺失',active:!!u?.active,state:m.state||'未配置',current_share:Number.isFinite(m.share)?m.share:null,assigned:s?.assigned||0,mature:s?.mature||0,won:s?.won||0};});
 const result={month,next_month:period.end.slice(0,7),scope,scopes:(configs.results||[]).map(c=>c.scope),maturity,performance,as_of:asOf,read_at:new Date().toISOString(),rows:allocationShares(rows,performance),config:config.rule||{},config_updated:selected.updated,confirmed:confirmed?{...confirmed,payload:crmObject(confirmed.payload)}:null,pool,saved:saved?{...saved,payload:crmObject(saved.payload)}:null,provisional:true,notes:['只统计CRM标记为新客户的首次正式分配；历史导入、模拟记录和归属不明的客户不进入业绩分母。','成交按CRM未取消成交记录计客户数，同一客户多单只计一次；尚未核验定金或回款。','观察期从首次正式分配起算；无成熟样本人员使用团队平均成交率，不按零成交降权。','建议方案按平均份额与成熟客户成交率混合；全员无成交时回到平均。停分及停用人员建议份额为零。','本月数据为截至当前的预览，月末核验后再由业务CRM确认；此处不改变客户负责人或生效分配规则。']};
 if(req.method==='POST'){const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO allocation_reviews(id,scope,month,payload,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(id,scope,month,JSON.stringify(result),user.id,result.read_at).run();return json({ok:true,id,message:'次月建议方案已留档，待业务负责人核验；尚未生效，请在业务CRM确认执行。'});}
 return json(result);
 }catch{return json({error:'读取分配与业绩失败，未修改业务CRM。请稍后重试'},502);}
}
