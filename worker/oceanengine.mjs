// Separate from Douyin creator OAuth and XHS advertisers. No inferred account binding.
const oeAppId='1876027941412073';
function oeSafeError(e){return {name:String(e?.name||'Error').slice(0,40),detail:String(e?.message||'').replace(/https?:\/\/[^\s]+/g,'[url]').replace(/[A-Za-z0-9_-]{16,}/g,'[redacted]').slice(0,180)};}
const oeCallbackPath='/integrations/oceanengine/callback';
function oeSetup(){return xpage('<h1>抖音广告 API 接入</h1><p>先核实授权账户，再读取广告报表。成功同步后启用每日08:00采集、10:30补采；未取得的广告费不会填为零。</p><p>应用：yifunlife-ben-ditui-leads（'+oeAppId+'）</p><label>应用 Secret<input id="oe-secret" type="password" autocomplete="off" placeholder="仅首次配置时填写，不要发到聊天"></label><button id="oe-save">加密保存应用密钥</button><p>请在巨量应用后台将回调地址设置为：</p><p>'+ 'https://yifun-marketing.yifunlife.workers.dev'+oeCallbackPath+'</p><button id="oe-start">前往巨量官方授权</button><button id="oe-accounts">检查已授权账户</button><button id="oe-connect">检查接口连接</button><button id="oe-identities">核实巨量广告对应抖音号</button><button id="oe-enterprise">核查企业工作台下广告账户</button><button id="oe-local">读取本地推投放账户与广告报表</button><button id="oe-sync">同步乐园号年度、月度广告费并启用定时采集</button><button id="oe-verify">验收云端定时采集</button><p id="oe-status"></p><pre id="oe-result" style="white-space:pre-wrap"></pre><p><a href="/">返回运营看板</a></p>',`async function call(path,body){const r=await fetch('/api/oceanengine/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'请求失败');return d;}const status=document.querySelector('#oe-status'),out=document.querySelector('#oe-result');function showLocal(d){out.replaceChildren();for(const a of d.accounts||[]){const p=document.createElement('p');const r=a.report?.data_list||[];p.textContent='投放账户：'+a.id+' / '+(Array.isArray(a.info)?a.info[0]?.name:a.name||'待核实')+'；昨日消耗：'+(a.report?.data_list?JSON.stringify(r.map(x=>({date:x.stat_time_day,cost:x.stat_cost}))):a.cost??'未取得')+'；可投抖音号：'+(a.aweme?.aweme_id_list||a.awemes||[]).map(x=>x.aweme_name+'（'+x.aweme_id+'）').join('、');out.append(p);}}async function load(){try{const d=await call('status');status.textContent=(d.configured?'应用密钥已配置。':'请先保存应用密钥。')+(d.authorized?'已收到授权，尚待核实乐园号投放账户。':'尚未收到云端授权。')+(d.diagnostic&&d.diagnostic.stage!=='authorized'?'连接检查：'+d.diagnostic.stage+(d.diagnostic.code?'（'+d.diagnostic.code+'）':''):'');if(d.authorized){const r=await call('reports');if(r.reports)showReports(r.reports);else showLocal(await call('local-results'));if(r.schedule?.enabled)status.textContent='乐园号广告 API 已授权；云端每日08:00采集、10:30补采。粉丝和发布数据需单独接入。';}}catch(e){status.textContent=e.message;}}document.querySelector('#oe-save').onclick=async()=>{try{await call('config',{secret:document.querySelector('#oe-secret').value});document.querySelector('#oe-secret').value='';await load();}catch(e){status.textContent=e.message;}};document.querySelector('#oe-start').onclick=async()=>{try{const d=await call('start',{});location.href=d.url;}catch(e){status.textContent=e.message;}};document.querySelector('#oe-accounts').onclick=async()=>{const b=document.querySelector('#oe-accounts');b.disabled=true;try{const d=await call('accounts',{});out.textContent=d.accounts.length?d.accounts.map(a=>a.name+'（'+a.id+'）'+a.type).join('\\n')+'\\n上述账户尚未绑定为乐园号；工作台/来客账户不等于本地推投放账户。':'官方未返回已授权账户。';}catch(e){out.textContent=e.message;}finally{b.disabled=false;}};function showReports(d){out.replaceChildren();for(const a of d.accounts||[]){for(const [key,p] of Object.entries(a.periods)){const line=document.createElement('p');line.textContent=({year:'年度累计',month:'本月截至昨日',yesterday:'昨日'}[key]||key)+' '+p.start+' 至 '+p.end+'：'+(p.status==='ok'?'¥'+p.metrics.fee+(p.stale?'（保留上次结果，待更新）':''):'待补采（保留原数据）'+(p.last_error?.code||p.code?' ['+(p.last_error?.code||p.code)+']':''));out.append(line);}for(const h of a.history||[]){const line=document.createElement('p');line.textContent=h.month+'：'+(h.status==='ok'?'¥'+h.metrics.fee:'待补采');out.append(line);}}}document.querySelector('#oe-verify').onclick=async()=>{const b=document.querySelector('#oe-verify');b.disabled=true;out.textContent='正在执行云端定时采集验收…';try{showReports(await call('verify-schedule',{}));}catch(e){out.textContent=e.message;}finally{b.disabled=false;}};document.querySelector('#oe-sync').onclick=async()=>{const b=document.querySelector('#oe-sync');b.disabled=true;out.textContent='正在同步年度和月度官方报表…';try{const d=await call('sync-garden',{});if(d.busy)out.textContent=d.message;else showReports(d);}catch(e){out.textContent=e.message;}finally{b.disabled=false;}};document.querySelector('#oe-local').onclick=async()=>{const b=document.querySelector('#oe-local');b.disabled=true;out.textContent='正在读取官方投放账户及报表…';try{const d=await call('local-probe',{});showLocal(d);}catch(e){out.textContent=e.message;}finally{b.disabled=false;}};document.querySelector('#oe-identities').onclick=async()=>{const b=document.querySelector('#oe-identities');b.disabled=true;out.textContent='正在读取巨量广告账户下已授权抖音号…';try{const d=await call('ad-identities',{});out.textContent=JSON.stringify(d,null,2);}catch(e){out.textContent=e.message;}finally{b.disabled=false;}};document.querySelector('#oe-enterprise').onclick=async()=>{const b=document.querySelector('#oe-enterprise');b.disabled=true;out.textContent='正在查询企业工作台下的巨量广告与本地推账户…';try{const d=await call('enterprise-probe',{});out.textContent=(d.accounts||[]).map(a=>a.account_source+' / '+a.name+'（'+a.id+'）').join('\\n')+'\\n'+(d.checks||[]).map(c=>c.account_source+'：'+(c.status==='ok'?'读取完成，'+c.count+'个账户':'读取失败 '+(c.code||'')+' '+(c.error?.detail||''))).join('\\n')+'\\n候选账户未自动绑定，须核实工厂号归属。';}catch(e){out.textContent=e.message;}finally{b.disabled=false;}};document.querySelector('#oe-connect').onclick=async()=>{try{const d=await call('connectivity',{});out.textContent=JSON.stringify(d);}catch(e){out.textContent=e.message;}};if(location.search){const s=new URL(location.href).searchParams.get('status');out.textContent=s==='authorized'?'授权已接收，请检查已授权账户。':'授权未完成，请检查回调配置后重试。';history.replaceState(null,'',location.pathname);}load();`,'巨量广告接入 · 亦玩集团');}
async function oeRequest(path,options={}){
 const r=await fetch('https://api.oceanengine.com/open_api/'+path,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});
 const j=await oeReadJson(r);if(!r.ok||j.code!==0||!j.data){
  // OAuth may echo credentials. For read-only business queries retain a bounded,
  // redacted official explanation so configuration errors remain diagnosable.
  let detail='官方请求未通过';
  if(!path.startsWith('oauth2/')&&(!options.method||options.method==='GET')){
   let message=String(j.message||j.msg||'');
   const token=options.headers?.['Access-Token'];if(token)message=message.split(token).join('[redacted]');
   detail=oeSafeError(Error(message)).detail||detail;
  }
  const e=Error(detail);e.oeCode=String(j.code??r.status).replace(/[^0-9-]/g,'').slice(0,12);throw e;
 }return j.data;
}
async function oeReadJson(response){
 const text=await response.text();let out='',i=0;
 while(i<text.length){if(text[i]==='"'){const start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')break;}out+=text.slice(start,i);continue;}
 const m=text.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(m){const n=m[0];out+=/^-?\d+$/.test(n)&&!Number.isSafeInteger(Number(n))?JSON.stringify(n):n;i+=n.length;}else out+=text[i++];}
 return JSON.parse(out);
}
function oeAccounts(data){if(!Array.isArray(data?.list))throw Error('官方账户格式异常，未绑定账号');return data.list.map(a=>{const id=a.account_string_id||(typeof a.account_id==='string'?a.account_id:Number.isSafeInteger(a.account_id)?String(a.account_id):'')||(typeof a.advertiser_id==='string'?a.advertiser_id:Number.isSafeInteger(a.advertiser_id)?String(a.advertiser_id):'');if(!/^\d{1,22}$/.test(id))throw Error('账户ID格式异常，未绑定账号');return {id,name:String(a.account_name||a.advertiser_name||'未命名账户'),type:String(a.account_type||a.account_role||''),valid:a.is_valid!==false};});}
async function oeApi(req,env,user){
 if(user.role!=='owner'||user.must_change)return xjson({error:'仅主管理员可配置广告接入'},403);
 const p=new URL(req.url).pathname;
 try{
 if(p==='/api/oceanengine/verify-schedule'&&req.method==='POST'){if(!(await xget('oe:schedule',env))?.enabled)return xjson({error:'请先成功同步并启用定时采集'},409);await oeScheduledSync(env);return xjson(await xget('oe:reports',env));}
 if(p==='/api/oceanengine/sync-garden'&&req.method==='POST')return xjson(await oeSyncGarden(env,true));
 if(p==='/api/oceanengine/reports'&&req.method==='GET')return xjson({reports:await xget('oe:reports',env),schedule:await xget('oe:schedule',env),failure:await xget('oe:sync-failure',env)});
 if(p==='/api/oceanengine/enterprise-probe'&&req.method==='POST')return xjson(await oeEnterpriseProbe(env));
 if(p==='/api/oceanengine/ad-identities'&&req.method==='POST')return xjson(await oeAdIdentityProbe(env));
 if(p==='/api/oceanengine/enterprise-results'&&req.method==='GET')return xjson(await xget('oe:enterprise-probe',env)||{accounts:[],checks:[]});
 if(p==='/api/oceanengine/local-results'&&req.method==='GET')return xjson(oeLocalSummary(await xget('oe:local-probe',env)));
 if(p==='/api/oceanengine/local-probe'&&req.method==='POST')return await oeLocalProbe(env);
 if(p==='/api/oceanengine/connectivity'&&req.method==='POST'){try{await oeRequest('oauth2/access_token/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_id:Number(oeAppId),secret:'invalid-diagnostic',auth_code:'invalid-diagnostic'})});return xjson({reachable:true});}catch(e){return xjson({reachable:!!e.oeCode,code:e.oeCode||null,error:oeSafeError(e)});}}
 if(p==='/api/oceanengine/status'&&req.method==='GET'){const cfg=await xget('oe:config',env),token=await xget('oe:token',env);return xjson({app_id:oeAppId,configured:!!cfg?.secret,authorized:!!token?.access_token,authorized_at:token?.received_at||null,diagnostic:await xget('oe:diagnostic',env),collection_ready:false});}
 if(p==='/api/oceanengine/config'&&req.method==='POST'){const b=await req.json();if(typeof b.secret!=='string'||!/^\S{16,512}$/.test(b.secret))return xjson({error:'请填写有效的巨量应用 Secret'},400);await xput('oe:config',{app_id:oeAppId,secret:b.secret},env);return xjson({ok:true});}
 if(p==='/api/oceanengine/start'&&req.method==='POST'){
  if(!(await xget('oe:config',env))?.secret)return xjson({error:'请先配置应用密钥'},409);
  const state=rand(),browser=rand();await env.DB.prepare('INSERT INTO xhs_states(hash,browser_hash,expires) VALUES(?,?,?)').bind(await digest('oe:'+state),await digest(browser),Date.now()+600000).run();
  const u=new URL('https://open.oceanengine.com/audit/oauth.html');u.searchParams.set('app_id',oeAppId);u.searchParams.set('state',state);u.searchParams.set('redirect_uri',new URL(oeCallbackPath,req.url).href);
  return new Response(JSON.stringify({url:u.href}),{headers:{...xhsHeaders,'Content-Type':'application/json','Set-Cookie':'oe_flow='+browser+'; Path=/integrations/oceanengine; HttpOnly; Secure; SameSite=Lax; Max-Age=600'}});
 }
 if(p==='/api/oceanengine/accounts'&&req.method==='POST'){
  const token=await xget('oe:token',env);if(!token?.access_token)return xjson({error:'云端尚未收到授权，请先完成官方授权'},409);
  if(token.expires_at<=Date.now())return xjson({error:'授权凭证已到期，请重新授权；原数据保留'},409);
  const url=new URL('https://api.oceanengine.com/open_api/oauth2/advertiser/get/');url.searchParams.set('access_token',token.access_token);
  const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)}),j=await oeReadJson(r);if(!r.ok||j.code!==0){const e=Error('account_query_failed');e.oeCode=String(j.code??r.status);throw e;}
  const accounts=oeAccounts(j.data);await xput('oe:discovery',{accounts,checked_at:Date.now(),binding_status:'unverified'},env);return xjson({accounts,collection_ready:false});
 }
 return xjson({error:'接口不存在'},404);
 }catch(e){await xput('oe:account-diagnostic',{error:oeSafeError(e),code:e.oeCode||null,checked_at:Date.now()},env);return xjson({error:'账户检查失败：'+oeSafeError(e).detail+(e.oeCode?'（'+e.oeCode+'）':'')+'；未改动现有报表'},502);}
}
async function oeCallback(req,env){
 let stage='parameters';const fail=async(reason,code=null,error=null)=>{await xput('oe:diagnostic',{stage:reason,code,error,checked_at:Date.now()},env);return redirect('failed');};
 const redirect=status=>new Response(null,{status:303,headers:{...xhsHeaders,Location:'/integrations/oceanengine?status='+status,'Set-Cookie':'oe_flow=; Path=/integrations/oceanengine; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}});
 if(req.method!=='GET')return xjson({error:'操作不支持'},405);
 try{
 const u=new URL(req.url),state=u.searchParams.get('state'),code=u.searchParams.get('auth_code'),browser=(req.headers.get('Cookie')||'').match(/(?:^|; )oe_flow=([^;]+)/)?.[1];
 if(!state||state.length>256||!code||code.length>4096||!browser)return redirect('invalid');
 stage='flow_validation';
 const claimed=await env.DB.prepare('DELETE FROM xhs_states WHERE hash=? AND browser_hash=? AND expires>? RETURNING hash').bind(await digest('oe:'+state),await digest(browser),Date.now()).first();if(!claimed)return redirect('invalid');
 const cfg=await xget('oe:config',env);if(!cfg?.secret)return fail('unconfigured');stage='token_exchange';
 const d=await oeRequest('oauth2/access_token/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_id:Number(oeAppId),secret:cfg.secret,auth_code:code})});
 if(typeof d.access_token!=='string'||typeof d.refresh_token!=='string'||!Number.isFinite(Number(d.expires_in))||Number(d.expires_in)<=0)return fail('invalid_token_response');
 await xput('oe:token',{access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Date.now()+Number(d.expires_in)*1000,received_at:Date.now(),binding_status:'unverified'},env);await xput('oe:diagnostic',{stage:'authorized',checked_at:Date.now()},env);return redirect('authorized');
 }catch(e){return fail(stage,e.oeCode||null,oeSafeError(e));}
}

async function oeLocalGet(path,params,token){const qs=new URLSearchParams(params);return oeRequest(path+'?'+qs,{headers:{'Access-Token':token.access_token}});}
async function oeLocalProbe(env){
 const token=await xget('oe:token',env),discovery=await xget('oe:discovery',env);
 if(!token?.access_token||token.expires_at<=Date.now())return xjson({error:'请先完成有效授权'},409);
 const life=(discovery?.accounts||[]).filter(a=>a.valid&&a.type==='PLATFORM_ROLE_LIFE');if(!life.length)return xjson({error:'请先读取已授权账户，核实来客账户'},409);
 const accounts=[];
 for(const source of life){
  let page=1,total=1;
  do {const d=await oeLocalGet('v3.0/local/life/advertiser/list/',{life_account_id:source.id,page:String(page),page_size:'100'},token);if(!Array.isArray(d.adv_list))throw Error('投放账户列表格式异常');
   for(const a of d.adv_list){const id=String(a.local_account_id||'');if(!/^\d{1,22}$/.test(id))throw Error('投放账户ID异常');if(!accounts.some(x=>x.id===id))accounts.push({id,source_id:source.id,role:a.local_account_role});}
   total=Number(d.page_info?.total_page||1);if(!Number.isSafeInteger(total)||total<1||total>20)throw Error('账户分页异常');page++;
  }while(page<=total);
 }
 if(accounts.length>20)throw Error('待核实投放账户过多，请先确认乐园号账户');
 const day=new Date(Date.now()+8*3600000-86400000).toISOString().slice(0,10),result={checked_at:Date.now(),date:day,accounts:[],binding_status:'unverified',collection_ready:false};
 for(const a of accounts){const item={...a};
  for(const [key,path,params] of [['info','2/advertiser/info/',{advertiser_ids:JSON.stringify([Number(a.id)]),fields:JSON.stringify(['id','name'])}],['projects','v3.0/local/project/list/',{local_account_id:a.id,page:'1',page_size:'100'}],['promotions','v3.0/local/promotion/list/',{local_account_id:a.id,page:'1',page_size:'100'}]]){try{item[key]=await oeLocalGet(path,params,token);}catch(e){item[key+'_error']={code:e.oeCode||null,...oeSafeError(e)};}}
  try{item.report=await oeLocalGet('v3.0/local/report/account/get/',{local_account_id:a.id,start_date:day,end_date:day,metrics:JSON.stringify(['stat_cost']),time_granularity:'TIME_GRANULARITY_DAILY',page:'1',page_size:'100'},token);item.report_status='ok';}catch(e){item.report_status='failed';item.report_error={code:e.oeCode||null,...oeSafeError(e)};}
  try{item.aweme=await oeLocalGet('v3.0/local/aweme/authorized/get/',{local_account_id:a.id,marketing_goal:'VIDEO_IMAGE',page:'1',page_size:'100'},token);}catch(e){item.identity_error={code:e.oeCode||null,...oeSafeError(e)};}
  result.accounts.push(item);
 }
 await xput('oe:local-probe',result,env);return xjson(result);
}

function oeLocalSummary(result){return {date:result?.date||null,accounts:(result?.accounts||[]).map(a=>({id:a.id,name:(Array.isArray(a.info)?a.info[0]?.name:null)||null,cost:a.report_status==='ok'&&a.report?.data_list?.length===1?a.report.data_list[0].stat_cost:null,awemes:(a.aweme?.aweme_id_list||[]).map(x=>({aweme_name:x.aweme_name,aweme_id:x.aweme_id})),report_status:a.report_status})),collection_ready:false};}
