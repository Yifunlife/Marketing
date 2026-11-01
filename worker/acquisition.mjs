const acquisitionPlatforms=['小红书','抖音','视频号','Facebook','Instagram','YouTube','TikTok','Google','阿里巴巴','独立站','WhatsApp','其他'];
const acquisitionStatuses={pending_source:'来源待核实',pending_handoff:'待关联CRM',crm_linked:'已关联CRM'};
const acquisitionText=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
function acquisitionInput(body){const platform=acquisitionText(body.platform),kind=acquisitionText(body.source_kind),request=acquisitionText(body.request_id,80);if(!acquisitionPlatforms.includes(platform)||!['ad','content','form','referral','manual'].includes(kind)||!/^[-\w]{8,80}$/.test(request))throw Error('请选择平台、来源类型，并重新打开录入窗口');const contact=acquisitionText(body.contact,120),phone=acquisitionText(body.phone,100),email=acquisitionText(body.email,254);if(!contact||(!phone&&!email))throw Error('请填写联系人，以及联系方式或邮箱');if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('邮箱格式不正确');return {platform,account_id:acquisitionText(body.account_id),account_name:acquisitionText(body.account_name),external_id:acquisitionText(body.external_id)||'manual:'+request,contact,phone,email,requirement:acquisitionText(body.requirement,4000),source_kind:kind,source_id:acquisitionText(body.source_id),entry_method:'人工录入',received_at:new Date().toISOString()};}
async function acquisitionApi(req,env,user){
 if(user.role!=='owner'||user.must_change)return json({error:'目前仅主管理员可操作获客资料'},403);
 const url=new URL(req.url),path=url.pathname;
 if(path==='/api/acquisition'&&req.method==='GET'){
  const page=Math.max(1,Math.min(10000,parseInt(url.searchParams.get('page')||'1')||1)),status=url.searchParams.get('status')||'',args=[];let where='';if(status){if(!Object.hasOwn(acquisitionStatuses,status))return json({error:'状态无效'},400);where='WHERE status=?';args.push(status);}
  const [rows,count,summary]=await Promise.all([env.DB.prepare('SELECT * FROM acquisition_leads '+where+' ORDER BY received_at DESC,id LIMIT 25 OFFSET ?').bind(...args,(page-1)*25).all(),env.DB.prepare('SELECT COUNT(*) AS total FROM acquisition_leads '+where).bind(...args).first(),env.DB.prepare('SELECT status,COUNT(*) AS total FROM acquisition_leads GROUP BY status').all()]);
  return json({rows:rows.results||[],total:count?.total||0,page,page_size:25,summary:Object.fromEntries((summary.results||[]).map(r=>[r.status,r.total])),statuses:acquisitionStatuses,platforms:acquisitionPlatforms,platform_lead_connections:[],read_at:new Date().toISOString()});
 }
 if(path==='/api/acquisition'&&req.method==='POST'){
  let value;try{value=acquisitionInput(await req.json());}catch(e){return json({error:e.message},400);}
  const id=crypto.randomUUID();await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO acquisition_leads(id,platform,account_id,account_name,external_id,contact,phone,email,requirement,source_kind,source_id,entry_method,received_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,...['platform','account_id','account_name','external_id','contact','phone','email','requirement','source_kind','source_id','entry_method','received_at'].map(k=>value[k]),user.id),env.DB.prepare('INSERT INTO acquisition_events(id,lead_id,kind,payload,actor_id,created_at) SELECT ?,id,?,?,?,? FROM acquisition_leads WHERE id=?').bind(crypto.randomUUID(),'received',JSON.stringify(value),user.id,value.received_at,id)]);
  const saved=await env.DB.prepare('SELECT id,status,crm_customer_id FROM acquisition_leads WHERE platform=? AND account_id=? AND external_id=?').bind(value.platform,value.account_id,value.external_id).first();return json({ok:true,id:saved.id,duplicate:saved.id!==id,message:saved.id===id?'线索已保存，来源待核实；尚未交接CRM。':'该平台线索已存在，未重复创建或覆盖原始来源。'});
 }
 const match=path.match(/^\/api\/acquisition\/([^/]+)(?:\/(verify|link))?$/);if(!match)return json({error:'接口不存在'},404);
 const lead=await env.DB.prepare('SELECT * FROM acquisition_leads WHERE id=?').bind(match[1]).first();if(!lead)return json({error:'线索不存在'},404);
 if(!match[2]&&req.method==='GET'){const events=await env.DB.prepare('SELECT kind,payload,created_at FROM acquisition_events WHERE lead_id=? ORDER BY created_at,id').bind(lead.id).all();return json({lead,events:events.results||[],budget_eligible:false});}
 if(req.method!=='POST')return json({error:'操作不支持'},405);
 const body=await req.json();
 if(match[2]==='verify'){
  const evidence=acquisitionText(body.evidence,2000),accountId=acquisitionText(body.account_id)||lead.account_id,sourceId=acquisitionText(body.source_id)||lead.source_id;const verifiedSource={platform:lead.platform,account_id:accountId,account_name:acquisitionText(body.account_name)||lead.account_name,source_kind:lead.source_kind,source_id:sourceId};if(!accountId||!sourceId||!evidence)return json({error:'缺少具体账号ID、广告/内容/表单/来源编号或核实依据，不能确认来源。请保留待核实。'},400);
  if(lead.status!=='pending_source')return json({ok:true,message:'来源已核实，未重复修改。'});
  const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("UPDATE acquisition_leads SET status='pending_handoff',verified_at=?,evidence=?,verified_source=? WHERE id=? AND status='pending_source'").bind(now,evidence,JSON.stringify(verifiedSource),lead.id),env.DB.prepare('INSERT INTO acquisition_events(id,lead_id,kind,payload,actor_id,created_at) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),lead.id,'source_manually_verified',JSON.stringify({evidence,verified_source:verifiedSource,budget_eligible:false}),user.id,now)]);return json({ok:true,message:'人工核实已留痕，可关联CRM；尚不具备自动投放决策资格。'});
 }
 if(match[2]==='link'){
  if(lead.status==='pending_source')return json({error:'请先核实来源，不能跳过来源检查'},409);
  if(body.confirm_match!==true)return json({error:'请先在CRM查重，并明确确认该客户与线索是同一客户'},400);const customerId=acquisitionText(body.customer_id);if(!customerId||!env.CRM_DB)return json({error:'请填写已有CRM客户ID，并确认CRM已连接'},400);
  const customer=await env.CRM_DB.prepare('SELECT id FROM crm_leads WHERE id=? AND channel<>?').bind(customerId,'模拟流程演练').first();if(!customer)return json({error:'未找到正式CRM客户，请先在业务CRM查重并录入，再返回关联'},404);
  if(lead.crm_customer_id&&lead.crm_customer_id!==customerId)return json({error:'已关联其他CRM客户，不能覆盖原关联，请核对'},409);
  if(lead.crm_customer_id===customerId)return json({ok:true,message:'已关联该CRM客户，未重复创建。'});
  const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("UPDATE acquisition_leads SET status='crm_linked',crm_customer_id=? WHERE id=? AND crm_customer_id IS NULL").bind(customerId,lead.id),env.DB.prepare('INSERT INTO acquisition_events(id,lead_id,kind,payload,actor_id,created_at) SELECT ?,id,?,?,?,? FROM acquisition_leads WHERE id=? AND crm_customer_id=?').bind(crypto.randomUUID(),'crm_linked',JSON.stringify({customer_id:customerId,method:'manual_existing_customer_link'}),user.id,now,lead.id,customerId)]);const linked=await env.DB.prepare('SELECT crm_customer_id FROM acquisition_leads WHERE id=?').bind(lead.id).first();if(linked?.crm_customer_id!==customerId)return json({error:'关联状态已被其他操作更新，请刷新核对'},409);return json({ok:true,message:'已关联CRM原客户；未创建新客户，后续业务进展从CRM读取。'});
 }
 return json({error:'接口不存在'},404);
}
