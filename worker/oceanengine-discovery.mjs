// Read-only discovery: an authorized enterprise workspace is not itself an
// advertiser. Enumerate its business accounts before deciding any attribution.
async function oeEnterpriseProbe(env){
 const token=await oeFreshToken(env),discovery=await xget('oe:discovery',env);
 const sources=(discovery?.accounts||[]).filter(a=>a.valid&&['PLATFORM_ROLE_ENTERPRISE_BP_ADMIN','PLATFORM_ROLE_ENTERPRISE_BP_OPERATOR'].includes(a.type));
 if(!sources.length)throw Error('请先检查已授权账户；尚未发现企业工作台授权');
 const result={checked_at:Date.now(),accounts:[],checks:[],binding_status:'unverified'};
 for(const source of sources)for(const kind of ['AD','LOCAL']){
  const check={source_id:source.id,account_source:kind,status:'ok',count:0};
  try{
   let page=1,total=1;
   do{
    const data=await oeLocalGet('2/ebp/advertiser/list/',{enterprise_organization_id:source.id,account_source:kind,page:String(page),page_size:'100'},token);
    if(!Array.isArray(data.account_list))throw Error('企业投放账户列表格式异常');
    total=Number(data.page_info?.total_page||1);
    if(!Number.isSafeInteger(total)||total<1||total>20)throw Error('企业投放账户分页异常');
    for(const row of data.account_list){
     const id=typeof row.account_id==='string'?row.account_id:Number.isSafeInteger(row.account_id)?String(row.account_id):'';
     if(!/^\d{1,22}$/.test(id)||typeof row.account_name!=='string')throw Error('企业投放账户信息不完整');
     if(!result.accounts.some(a=>a.id===id&&a.account_source===kind))result.accounts.push({id,name:row.account_name,account_source:kind,account_type:String(row.account_type||''),source_id:source.id});
     check.count++;
    }
    page++;
   }while(page<=total);
  }catch(e){check.status='error';check.error=oeSafeError(e);check.code=e.oeCode||null;}
  result.checks.push(check);
 }
 result.status=result.checks.every(c=>c.status==='ok')?'ok':'partial';
 // Never convert candidates into bindings or merge their costs into a target.
 await xput('oe:enterprise-probe',result,env);
 return result;
}

async function oeAdIdentityProbe(env){
 const token=await oeFreshToken(env),candidates=await xget('oe:enterprise-probe',env);
 const result={checked_at:Date.now(),accounts:[]};
 for(const a of (candidates?.accounts||[]).filter(a=>a.account_source==='AD').slice(0,20)){
  const item={...a,awemes:[]};
  try{let page=1,total=1;do{
   const data=await oeLocalGet('2/tools/aweme_auth_list/',{advertiser_id:a.id,page:String(page),page_size:'100'},token);
   if(!Array.isArray(data.list))throw Error('广告抖音授权列表格式异常');
   total=Number(data.page_info?.total_page||1);if(!Number.isSafeInteger(total)||total<1||total>20)throw Error('授权分页异常');
   for(const row of data.list)item.awemes.push({id:String(row.aweme_id||''),name:String(row.aweme_name||''),auth_status:String(row.auth_status||'')});page++;
  }while(page<=total);item.status='ok';}catch(e){item.status='error';item.error=oeSafeError(e);item.code=e.oeCode||null;}
  result.accounts.push(item);
 }
 await xput('oe:ad-identities',result,env);return result;
}
