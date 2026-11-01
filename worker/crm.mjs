const crmCustomerFields=[['customer_id','客户ID'],['project_name','项目名称'],['country','国家'],['contact','联系人'],['whatsapp','WhatsApp'],['email','Email'],['source','客户来源'],['customer_type','客户类型'],['grade','客户等级'],['stage','当前阶段'],['project_status','项目状态'],['first_contact','初次联系'],['last_contact','最近联系'],['next_action','下一步动作'],['next_contact','下次联系'],['followup_status','跟进状态'],['deal_date','成交时间'],['expected_amount','预计金额'],['owner','负责人'],['loss_reason','丢单原因'],['notes','备注']];
const crmStageNames={qualification:'需求确认',design:'方案设计',quoted:'已报价',negotiation:'价格交涉',contract:'合同确认',won:'已成交',lost:'未成交',paused:'暂停推进'};
function crmObject(text){try{const value=JSON.parse(text||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
function crmCustomerRow(r){const detail=crmObject(r.detail),project=crmObject(r.project_details);return {customer_id:r.id,project_name:r.project_name||detail['项目名称']||'',country:r.country||'',contact:r.name||'',whatsapp:r.phone||'',email:r.email||'',source:r.source||'',customer_type:detail['客户类型']||'',grade:r.grade||'',stage:crmStageNames[r.project_stage]||r.project_stage||detail['当前阶段']||'',project_status:project.project_status||detail['项目状态']||'',first_contact:r.first_contact||'',last_contact:r.last_contact||'',next_action:r.project_next_action||r.next_step||'',next_contact:r.project_next_date||r.next_date||'',followup_status:r.status||'',deal_date:r.deal_date||'',expected_amount:r.amount_minor===null||r.amount_minor===undefined?null:Number(r.amount_minor)/100,currency:r.currency||'',owner:r.owner_name||'',loss_reason:r.loss_reason||detail['丢单原因']||'',notes:detail['备注']||r.last_note||'',provenance:{channel:r.channel||'',account_id:r.source_account_id||null,account_name:r.source_account_name||null,account_basis:r.source_account_id?'CRM广告ID唯一匹配':'待核实',ad_id:String(detail.ad_id||''),ad_name:String(detail.ad_name||detail['广告名称']||''),campaign_id:String(detail.campaign_id||''),campaign_name:String(detail.campaign_name||detail['广告活动']||''),form_id:String(detail.form_id||''),form_name:String(detail.form_name||detail['来源表单']||''),batch_id:r.batch_id||'',batch_name:r.batch_name||'',batch_source:r.batch_source||'',entry_time:r.entered||r.created||'',entry_method:r.batch_id?'业务CRM导入批次':'业务CRM记录',source_detail:String(detail['来源渠道']||detail.platform||'')}};}
const crmCustomerJoins=`FROM crm_leads l
LEFT JOIN crm_users u ON u.id=l.owner_id
LEFT JOIN crm_batches b ON b.id=l.batch_id
LEFT JOIN crm_sales_projects p ON p.project_id=(SELECT project_id FROM crm_sales_projects WHERE lead_id=l.id ORDER BY updated DESC,project_id LIMIT 1)
LEFT JOIN crm_customer_projects cp ON cp.id=COALESCE(p.customer_project_id,(SELECT project_id FROM crm_customer_project_leads WHERE lead_id=l.id ORDER BY created DESC,id LIMIT 1))
LEFT JOIN (SELECT ad_id,MIN(account_id) AS account_id FROM crm_meta_ad_daily GROUP BY ad_id HAVING COUNT(DISTINCT account_id)=1) am ON am.ad_id=json_extract(CASE WHEN json_valid(l.detail) THEN l.detail ELSE '{}' END,'$.ad_id')
LEFT JOIN crm_operation_accounts oa ON oa.id=am.account_id`;
async function crmCustomersApi(req,env,user){
 if(user.role!=='owner'||user.must_change)return json({error:'目前仅主管理员可读取业务CRM客户资料'},403);
 if(req.method!=='GET')return json({error:'客户资料为业务CRM只读视图，请到业务CRM维护'},405);
 if(!env.CRM_DB)return json({error:'业务CRM数据源尚未连接'},503);
 const url=new URL(req.url),page=Math.max(1,Math.min(10000,Number.parseInt(url.searchParams.get('page')||'1')||1)),pageSize=25;
 const conditions=["l.channel<>'模拟流程演练'"],args=[];
 const q=(url.searchParams.get('q')||'').trim().slice(0,120);if(q){conditions.push("(instr(lower(l.id),lower(?))>0 OR instr(lower(l.name),lower(?))>0 OR instr(lower(l.phone),lower(?))>0 OR instr(lower(l.email),lower(?))>0 OR instr(lower(COALESCE(p.name,'')),lower(?))>0)");args.push(q,q,q,q,q);}
 for(const [key,column] of [['source','l.source'],['channel','l.channel'],['batch','l.batch_id']]){const value=url.searchParams.get(key);if(value){conditions.push(column+'=?');args.push(value.slice(0,200));}}
 const account=url.searchParams.get('account');if(account==='unknown')conditions.push('oa.id IS NULL');else if(account){conditions.push('oa.id=?');args.push(account.slice(0,160));}
 const where='WHERE '+conditions.join(' AND ');
 const columns=`l.id,l.name,l.phone,l.email,l.country,l.source,l.channel,l.entered,l.created,l.detail,l.grade,l.status,l.last_contact,l.next_date,l.batch_id,u.name AS owner_name,b.filename AS batch_name,b.source AS batch_source,COALESCE(p.name,cp.name) AS project_name,p.stage AS project_stage,p.details AS project_details,p.amount_minor,p.currency,p.next_action AS project_next_action,p.next_date AS project_next_date,p.loss_reason,oa.id AS source_account_id,oa.name AS source_account_name,
 (SELECT MIN(n.created) FROM crm_notes n WHERE n.lead_id=l.id AND n.method NOT IN ('表单咨询','归属核正','系统导入','自动分配','系统收信')) AS first_contact,
 (SELECT n.content FROM crm_notes n WHERE n.lead_id=l.id ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS last_note,
 (SELECT n.next_step FROM crm_notes n WHERE n.lead_id=l.id ORDER BY n.created DESC,n.rowid DESC LIMIT 1) AS next_step,
 (SELECT MAX(d.deal_date) FROM crm_deals d WHERE d.lead_id=l.id AND d.cancelled=0) AS deal_date`;
 try{const [count,rows,sources,channels,batches,accounts]=await Promise.all([
 env.CRM_DB.prepare('SELECT COUNT(*) AS total '+crmCustomerJoins+' '+where).bind(...args).first(),
 env.CRM_DB.prepare('SELECT '+columns+' '+crmCustomerJoins+' '+where+' ORDER BY l.created DESC,l.id LIMIT ? OFFSET ?').bind(...args,pageSize,(page-1)*pageSize).all(),
 env.CRM_DB.prepare("SELECT DISTINCT source AS value FROM crm_leads WHERE channel<>'模拟流程演练' ORDER BY source").all(),
 env.CRM_DB.prepare("SELECT DISTINCT channel AS value FROM crm_leads WHERE channel<>'' AND channel<>'模拟流程演练' ORDER BY channel").all(),
 env.CRM_DB.prepare('SELECT id,filename AS name FROM crm_batches ORDER BY created DESC').all(),
 env.CRM_DB.prepare('SELECT id,name,platform,account_ref FROM crm_operation_accounts WHERE active=1 ORDER BY name').all()
 ]);return json({fields:crmCustomerFields,rows:(rows.results||[]).map(crmCustomerRow),page,page_size:pageSize,total:count?.total||0,read_at:new Date().toISOString(),readonly:true,source:'业务部CRM正式数据库',filters:{sources:sources.results||[],channels:channels.results||[],batches:batches.results||[],accounts:accounts.results||[]},notes:['按CRM客户ID直接读取，不新增或改写业务CRM客户。','客户来源与录入入口分别保留；账号仅在广告ID唯一匹配时确认。','未记录的字段留空，未知金额不计为零；已排除明确标为模拟流程演练的记录。','同一客户存在多个项目时，列表显示最近更新的销售项目。']});}catch{return json({error:'读取CRM失败，未改动原始客户记录，请稍后刷新'},502);}
}
