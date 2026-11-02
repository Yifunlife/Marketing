// Separate from Douyin creator OAuth and XHS advertisers. No inferred account binding.
const oeAppId='1876027941412073';
function oeSafeError(e){return {name:String(e?.name||'Error').slice(0,40),detail:String(e?.message||'').replace(/https?:\/\/[^\s]+/g,'[url]').replace(/[A-Za-z0-9_-]{16,}/g,'[redacted]').slice(0,180)};}
const oeCallbackPath='/integrations/oceanengine/callback';
function oeSetup(){return xpage('<h1>乐园号 · 本地推广告接入</h1><p>先核实授权账户，再读取广告报表。尚未启用定时采集，不会把未取得的广告费填为零。</p><p>应用：yifunlife-ben-ditui-leads（'+oeAppId+'）</p><label>应用 Secret<input id="oe-secret" type="password" autocomplete="off" placeholder="仅首次配置时填写，不要发到聊天"></label><button id="oe-save">加密保存应用密钥</button><p>请在巨量应用后台将回调地址设置为：</p><p>'+ 'https://yifun-marketing.yifunlife.workers.dev'+oeCallbackPath+'</p><button id="oe-start">前往巨量官方授权</button><button id="oe-accounts">检查已授权账户</button><button id="oe-connect">检查接口连接</button><p id="oe-status"></p><pre id="oe-result" style="white-space:pre-wrap"></pre><p><a href="/">返回运营看板</a></p>',`async function call(path,body){const r=await fetch('/api/oceanengine/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const d=await r.json();if(!r.ok)throw Error(d.error||'请求失败');return d;}const status=document.querySelector('#oe-status'),out=document.querySelector('#oe-result');async function load(){try{const d=await call('status');status.textContent=(d.configured?'应用密钥已配置。':'请先保存应用密钥。')+(d.authorized?'已收到授权，尚待核实乐园号投放账户。':'尚未收到云端授权。')+(d.diagnostic&&d.diagnostic.stage!=='authorized'?'连接检查：'+d.diagnostic.stage+(d.diagnostic.code?'（'+d.diagnostic.code+'）':''):'');}catch(e){status.textContent=e.message;}}document.querySelector('#oe-save').onclick=async()=>{try{await call('config',{secret:document.querySelector('#oe-secret').value});document.querySelector('#oe-secret').value='';await load();}catch(e){status.textContent=e.message;}};document.querySelector('#oe-start').onclick=async()=>{try{const d=await call('start',{});location.href=d.url;}catch(e){status.textContent=e.message;}};document.querySelector('#oe-accounts').onclick=async()=>{const b=document.querySelector('#oe-accounts');b.disabled=true;try{const d=await call('accounts',{});out.textContent=d.accounts.length?d.accounts.map(a=>a.name+'（'+a.id+'）'+a.type).join('\\n')+'\\n上述账户尚未绑定为乐园号；工作台/来客账户不等于本地推投放账户。':'官方未返回已授权账户。';}catch(e){out.textContent=e.message;}finally{b.disabled=false;}};document.querySelector('#oe-connect').onclick=async()=>{try{const d=await call('connectivity',{});out.textContent=JSON.stringify(d);}catch(e){out.textContent=e.message;}};if(location.search){const s=new URL(location.href).searchParams.get('status');out.textContent=s==='authorized'?'授权已接收，请检查已授权账户。':'授权未完成，请检查回调配置后重试。';history.replaceState(null,'',location.pathname);}load();`);}
async function oeRequest(path,options={}){
 const r=await fetch('https://api.oceanengine.com/open_api/'+path,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});
 const j=await r.json();if(!r.ok||j.code!==0||!j.data){const e=Error('official_request_failed');e.oeCode=String(j.code??r.status).replace(/[^0-9-]/g,'').slice(0,12);throw e;}return j.data;
}
function oeAccounts(data){if(!Array.isArray(data?.list))throw Error('官方账户格式异常，未绑定账号');return data.list.map(a=>{const id=a.account_string_id||(Number.isSafeInteger(a.account_id)?String(a.account_id):'')||(Number.isSafeInteger(a.advertiser_id)?String(a.advertiser_id):'');if(!/^\d{1,22}$/.test(id))throw Error('账户ID格式异常，未绑定账号');return {id,name:String(a.account_name||a.advertiser_name||'未命名账户'),type:String(a.account_type||a.account_role||''),valid:a.is_valid!==false};});}
async function oeApi(req,env,user){
 if(user.role!=='owner'||user.must_change)return xjson({error:'仅主管理员可配置广告接入'},403);
 const p=new URL(req.url).pathname;
 try{
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
  const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)}),j=await r.json();if(!r.ok||j.code!==0)throw Error('账户查询未成功，请检查授权权限');
  const accounts=oeAccounts(j.data);await xput('oe:discovery',{accounts,checked_at:Date.now(),binding_status:'unverified'},env);return xjson({accounts,collection_ready:false});
 }
 return xjson({error:'接口不存在'},404);
 }catch{return xjson({error:'接入检查失败，请检查官方授权或稍后重试；未改动现有报表'},502);}
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
