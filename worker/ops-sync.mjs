const opsSyncTargets={
 'douyin-garden':{platform:'抖音',label:'乐园号',url:'https://creator.douyin.com/creator-micro/home',origin:'https://creator.douyin.com',identity:'f09530',name:'上海亦玩游乐设备集团',key:'garden'},
 'douyin-factory':{platform:'抖音',label:'工厂号',url:'https://creator.douyin.com/creator-micro/home',origin:'https://creator.douyin.com',identity:null,name:'亦玩游乐设备工厂',key:'factory'},
 'douyin-toy':{platform:'抖音',label:'玩具号',url:'https://creator.douyin.com/creator-micro/home',origin:'https://creator.douyin.com',identity:'85639035334',name:'亦玩游乐玩具工厂',key:'toy'},
 'douyin-supertada':{platform:'抖音',label:'SUPER TADA',url:'https://creator.douyin.com/creator-micro/home',origin:'https://creator.douyin.com',identity:null,name:'SUPER TADA',key:'supertada'},
 'wechat-video':{platform:'微信视频号',label:'账号待核实',url:'https://channels.weixin.qq.com/',origin:'https://channels.weixin.qq.com'},
 'xhs-garden':{platform:'小红书',label:'乐园号',xhs:'garden'},'xhs-toy':{platform:'小红书',label:'玩具号',xhs:'toy'},'xhs-factory':{platform:'小红书',label:'工厂号',xhs:'factory'},'xhs-supertada':{platform:'小红书',label:'SUPER TADA',xhs:'supertada'}
};
function opsSyncAllowed(user,write=false){if(!user||user.must_change)return false;if(user.role==='owner')return true;let permissions;try{permissions=Array.isArray(user.permissions)?user.permissions:JSON.parse(user.permissions||'[]');}catch{return false;}return ['manager','operator',...(write?[]:['viewer'])].includes(user.role)&&Array.isArray(permissions)&&permissions.includes(2);}

const opsScanKey=(id,kind)=>'ops_scan:'+id+':'+kind;
async function opsSyncApi(req,env,user){
 const url=new URL(req.url),parts=url.pathname.split('/').filter(Boolean),id=parts[2],action=parts[3],write=req.method!=='GET';
 if(!opsSyncAllowed(user,write))return xjson({error:'请使用有内贸中心权限的运营账号登录'},403);
 if(!id&&req.method==='GET'){
 const cards=[];for(const [key,t] of Object.entries(opsSyncTargets)){
  if(t.xhs){const target=creatorTarget(t.xhs),state=await xget(creatorSetting(target,'state'),env),last=await xget(creatorSetting(target,'collection'),env),failure=await xget(creatorSetting(target,'failure'),env),schedule=await xget(creatorSetting(target,'schedule'),env);cards.push({id:key,platform:t.platform,label:t.label,automatic:!!state&&schedule?.enabled===true,login:state?'已保存登录状态，采集时会校验':'需要扫码',last_at:last?.at||null,data_end:last?.as_of?new Date(Date.parse(last.as_of)-86400000).toISOString().slice(0,10):null,collection:last?'已采集':'尚未采集',failure:failure?.at>(last?.at||0)?'上次读取未完成，旧数据保留':null,can_collect:true});}
  else {const login=await xget(opsScanKey(key,'login'),env),profile=await xget(opsScanKey(key,'profile'),env),last=await xget(opsScanKey(key,'collection'),env),failure=await xget(opsScanKey(key,'failure'),env);cards.push({id:key,platform:t.platform,label:t.label,scan_expires:login?.expires>Date.now()&&(!last?.at||login.created_at>last.at)?login.expires:null,login:profile?'账号身份已核实':login?.expires>Date.now()?'扫码窗口已准备':'需要扫码',last_at:last?.at||null,data_end:last?.data_end||null,collection:last?.status==='partial'?'已读取部分数据，报表待验证':'运营报表待验证',failure:failure?.message||null,can_collect:!!t.key});}
 }
 return xjson({cards,can_operate:opsSyncAllowed(user,true),ad_automatic:(await xget('oe:schedule',env))?.enabled===true});
 }
 const target=Object.prototype.hasOwnProperty.call(opsSyncTargets,id)?opsSyncTargets[id]:null;if(!target)return xjson({error:'未知平台账号'},404);
 if(!['start','check','collect','live','preview','control','screen','input','diagnostic'].includes(action))return xjson({error:'操作不存在'},404);
 if(['start','check','collect','input'].includes(action)&&req.method!=='POST'||['live','preview','control','screen','diagnostic'].includes(action)&&req.method!=='GET')return xjson({error:'操作不支持'},405);
 if(['live','preview','control','screen','diagnostic'].includes(action)&&!opsSyncAllowed(user,true))return xjson({error:'仅运营人员可打开扫码窗口'},403);
 if(['control','screen','input','diagnostic'].includes(action)&&!target.key)return xjson({error:'此账号不支持此登录窗口'},404);
 if(action==='control')return opsControlPage(id,target.label);
 let input;if(action==='input'){if(req.headers.get('Origin')!==url.origin)return xjson({error:'请从运营平台打开登录窗口'},403);try{input=await req.json();}catch{return xjson({error:'输入格式不正确'},400);}if(!opsValidInput(input))return xjson({error:'仅支持选择登录位置、输入手机号或验证码及常用按键'},400);}
 if(target.xhs){const map={start:'probe',check:'finish',collect:'collect',live:'live',preview:'screenshot'},u=new URL('/api/creator-cloud/'+map[action],req.url);u.searchParams.set('account',target.xhs);const response=await creatorCloudApi(new Request(u,{method:req.method,headers:req.headers}),env,user);if(action==='check'&&response.ok){const collectUrl=new URL('/api/creator-cloud/collect',req.url);collectUrl.searchParams.set('account',target.xhs);const collected=await creatorCloudApi(new Request(collectUrl,{method:'POST',headers:req.headers}),env,user);if(!collected.ok)await xput(creatorSetting(creatorTarget(target.xhs),'failure'),{at:Date.now(),error:'scan_followup_collection_failed',kind:'collection_failed'},env);return collected;}return response;}
 if(!env.BROWSER)return xjson({error:'云端浏览器暂不可用'},503);
 const key=kind=>opsScanKey(id,kind);
 if(action==='preview'){const login=await xget(key('login'),env);if(!login||login.expires<Date.now())return xjson({error:'二维码窗口已过期，请重新准备'},410);const obj=await env.BUCKET.get('private/ops-scan/'+id+'.png');if(!obj)return xjson({error:'暂无扫码画面'},404);return new Response(obj.body,{headers:{...xhsHeaders,'Content-Type':'image/png'}});}
 let browser;
 try{
 const pp=await cloudPuppeteer();let login=await xget(key('login'),env);
 if(action==='start'){
  if(login?.session_id&&login.expires>Date.now()){try{const old=await pp.connect(env.BROWSER,login.session_id);await old.close();}catch{}}
  browser=await pp.launch(env.BROWSER,{keep_alive:600000});const page=await browser.newPage();await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
  const saved=await xget(key('state'),env);if(saved?.cookies){await page.setCookie(...saved.cookies);await page.evaluateOnNewDocument(({origin,storage})=>{if(location.origin===origin)for(const [k,v] of Object.entries(storage||{}))localStorage.setItem(k,v);},{origin:target.origin,storage:saved.storage});}
  await page.goto(target.url,{waitUntil:'networkidle2',timeout:45000});await page.waitForNetworkIdle({idleTime:700,timeout:8000}).catch(()=>{});
  await env.BUCKET.put('private/ops-scan/'+id+'.png',await page.screenshot({type:'png'}),{httpMetadata:{contentType:'image/png'}});
  await xput(key('login'),{session_id:browser.sessionId(),expires:Date.now()+600000,created_at:Date.now()},env);browser.disconnect();browser=null;
  return xjson({ok:true,message:'登录窗口已准备。请扫码并在手机确认；如已有登录状态，可直接检查。扫码完成不等于数据已采集。'});
 }
 if(!login?.session_id||login.expires<Date.now())return xjson({error:'扫码窗口已过期，请重新准备'},410);
 browser=await opsConnectBrowser(pp,env,login.session_id);const page=(await browser.pages()).find(p=>{try{return new URL(p.url()).origin===target.origin;}catch{return false;}});if(!page)return xjson({error:'登录窗口已关闭，请重新准备'},409);
 // Preserve the existing page size and focused form instead of resetting its viewport on reconnect.
 if(action==='diagnostic'){const frames=[];for(const frame of page.frames()){let origin;try{origin=new URL(frame.url()).origin;}catch{continue;}if(!origin.endsWith('.douyin.com')&&origin!=='https://creator.douyin.com')continue;frames.push({origin,inputs:await frame.evaluate(()=>Array.from(document.querySelectorAll('input')).map(e=>({placeholder:e.getAttribute('placeholder'),type:e.type,read_only:e.readOnly,disabled:e.disabled,visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),max_length:e.maxLength,tag:e.tagName}))) });}return xjson({frames,health:await opsLoginHealth(page),viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,zoom:document.documentElement.style.zoom,sms_controls:Array.from(document.querySelectorAll('button,a,span,div')).filter(e=>e.textContent.trim()==='获取验证码').slice(-5).map(e=>({tag:e.tagName,disabled:!!e.disabled,aria_disabled:e.getAttribute('aria-disabled'),pointer_events:getComputedStyle(e).pointerEvents,cursor:getComputedStyle(e).cursor,hit_tag:document.elementFromPoint(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2,e.getBoundingClientRect().y+e.getBoundingClientRect().height/2)?.tagName,hit_is_control:!!e.contains(document.elementFromPoint(e.getBoundingClientRect().x+e.getBoundingClientRect().width/2,e.getBoundingClientRect().y+e.getBoundingClientRect().height/2)),rect:JSON.parse(JSON.stringify(e.getBoundingClientRect()))})),visual:visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null}))});}
 if(action==='screen'){return new Response(await page.screenshot({type:'png'}),{headers:{...xhsHeaders,'Content-Type':'image/png'}});}
 if(action==='input'){const text=await page.evaluate(()=>document.body.innerText);if(/抖音号[：:]?\s*([A-Za-z0-9_.-]+)/.test(text))return xjson({error:'已进入账号后台，登录输入已停止，请返回同步区查看采集结果'},409);if(input.kind==='sms'){let button;for(const frame of page.frames()){let host;try{host=new URL(frame.url()).hostname;}catch{continue;}if(host!=='creator.douyin.com'&&!host.endsWith('.douyin.com'))continue;const handle=await frame.evaluateHandle(()=>Array.from(document.querySelectorAll('button,span,a,div')).filter(e=>e.textContent.trim()==='获取验证码'&&e.getBoundingClientRect().width>0).pop()||null);const element=handle.asElement();if(element){button=element;break;}await handle.dispose();}if(!button)return xjson({error:'当前官方页面没有可用的获取验证码按钮，请查看画面提示'},409);await button.click();return xjson({ok:true,message:'已点击官方获取验证码按钮，请查看官方提示；尚未确认短信发送成功'});}if(input.kind==='click'){const viewport=await page.evaluate(()=>({width:window.innerWidth,height:window.innerHeight}));await page.mouse.click(input.x*viewport.width,input.y*viewport.height);}else if(input.kind==='digits'){if(!['phone','code'].includes(input.field))return xjson({error:'请选择填写手机号或验证码'},400);let field;for(const frame of page.frames()){let host;try{host=new URL(frame.url()).hostname;}catch{continue;}if(host!=='creator.douyin.com'&&!host.endsWith('.douyin.com'))continue;const candidate=await frame.$(input.field==='phone'?'input[placeholder="请输入手机号"]':'input[placeholder="请输入验证码"]');if(candidate&&await candidate.boundingBox()){field=candidate;break;}}if(!field)return xjson({error:'当前官方页面未显示该输入框，请先完成身份验证或返回验证码登录'},409);await field.click({clickCount:3});await field.press('Backspace');await field.type(input.text);let filled=await field.evaluate((el,value)=>el.value.replace(/\s/g,'')===value,input.text);if(!filled){await field.evaluate((el,value)=>{if(el.readOnly||el.disabled)return;const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(set)set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},input.text);filled=await field.evaluate((el,value)=>el.value.replace(/\s/g,'')===value,input.text);}if(!filled)return xjson({error:'官方输入框未接受填写，本次未发送验证码'},409);return xjson({ok:true,message:input.field==='phone'?'已核实手机号填入官方输入框':'已核实验证码填入官方输入框'});}else await page.keyboard.press(input.key);return xjson({ok:true});}
 if(action==='live'){await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});await page.evaluate(()=>{document.documentElement.style.zoom='0.65';window.scrollTo(0,0);});const cdp=await page.createCDPSession(),view=await cdp.send('Cloudflare.getLiveView',{mode:'tab',expiresInMs:Math.min(600000,login.expires-Date.now())}),u=new URL(view.devtoolsFrontendUrl);if(u.origin!=='https://live.browser.run')throw Error('invalid_live_host');return new Response(null,{status:303,headers:{...xhsHeaders,Location:u.href}});}
 if(target.key&&page.url().includes('/data-center/'))await page.goto(target.url,{waitUntil:'networkidle2',timeout:30000});
 const text=await page.evaluate(()=>document.body.innerText);
 if(id==='wechat-video'){const message=/扫码|扫描二维码|微信登录/.test(text)?'请先扫码并在微信确认。':'已打开视频号后台；账号身份和报表读取尚待核实，暂未标为采集成功。';await xput(key('failure'),{at:Date.now(),message},env);return xjson({ok:false,message,collection_ready:false});}
 const actual=text.match(/抖音号[：:]?\s*([A-Za-z0-9_.-]+)/)?.[1],bound=await xget(key('profile'),env),normalize=v=>String(v||'').replace(/\s+/g,'').toLowerCase();
 if(!actual){
  await env.BUCKET.put('private/ops-scan/'+id+'.png',await page.screenshot({type:'png'}),{httpMetadata:{contentType:'image/png'}});
  if(/二维码.{0,8}(失效|过期)|扫码.{0,8}过期/.test(text))return xjson({error:'官方二维码已失效，请重新生成二维码后扫码；本次尚未登录。',preview_updated:true},410);
  const message=/扫码成功|扫描成功|手机.{0,10}确认/.test(text)?'已扫码，等待手机确认或网页完成登录…':/身份验证|验证码|安全验证/.test(text)?'需要在官方登录窗口完成安全验证，完成后会自动继续。':'云端尚未完成登录，请扫描当前二维码并在手机确认。';
  return xjson({ok:false,pending:true,message,preview_updated:true},202);
 }
 if((target.identity&&actual!==target.identity)||(bound?.account_id&&actual!==bound.account_id)||!normalize(text).includes(normalize(target.name))){const message='当前账号与'+target.label+'不匹配，请切换对应账号；没有覆盖数据。';await xput(key('failure'),{at:Date.now(),message},env);return xjson({ok:false,message,collection_ready:false},409);}
 for(const [otherId,other] of Object.entries(opsSyncTargets)){if(!other.key||otherId===id)continue;const otherProfile=await xget(opsScanKey(otherId,'profile'),env);if(other.identity===actual||otherProfile?.account_id===actual)return xjson({error:'该抖音账号已属于'+other.label+'，不能重复绑定到'+target.label},409);}
 await xput(key('profile'),{account_id:actual,name:target.name,verified_at:Date.now()},env);
 await xput(key('state'),{cookies:await page.cookies(target.origin),storage:await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage))),saved_at:Date.now()},env);
 await page.goto('https://creator.douyin.com/creator-micro/data-center/operation',{waitUntil:'networkidle2',timeout:35000});
 await page.waitForFunction(()=>{const m=document.body.innerText.match(/总粉丝量\s*([\d,]+)/);return m&&Number(m[1].replaceAll(',',''))>0;},{timeout:12000});
 const body=await page.evaluate(()=>document.body.innerText),match=body.match(/总粉丝量\s*([\d,]+)/),fans=Number(match?.[1]?.replaceAll(',',''));if(!Number.isSafeInteger(fans)||fans<=0)throw Error('fans_not_verified');
 const result={status:'partial',at:Date.now(),fans,account_id:actual,name:target.name,message:target.label+'身份及总粉丝已读取；增粉、发布逐日报表仍待验证，不会填入演示数据。'};
 await xput(key('collection'),result,env);await xput(key('failure'),null,env);await xput('dy:creator:'+target.key,result,env);return xjson({ok:true,message:result.message,collection_ready:false,fans});
 }catch(e){const message='平台登录或报表读取未完成，请打开登录窗口检查；原数据保留。';await xput(key('failure'),{at:Date.now(),message,detail:cloudSafeError(e)},env);return xjson({error:message},502);}
 finally{if(browser)browser.disconnect();}
}

function opsValidInput(v){return !!v&&((v.kind==='sms')||(v.kind==='click'&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<1&&v.y>=0&&v.y<1)||(v.kind==='digits'&&typeof v.text==='string'&&/^\d{1,16}$/.test(v.text))||(v.kind==='key'&&['Tab','Backspace','Enter','ArrowLeft','ArrowRight'].includes(v.key)));}

function opsControlPage(id,label){
 return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>抖音${label} · 登录验证</title>
 <style>
 body{margin:0;background:#f4f7fb;color:#19375f;font:16px/1.5 system-ui}
 main{min-height:100dvh;display:flex;flex-direction:column}
 header,.tools{display:flex;gap:8px 12px;align-items:center;flex-wrap:wrap;padding:8px 16px}
 header h1{font-size:20px;margin:0}
 button,input{font:inherit;padding:6px 10px;border:1px solid #cbd7e5;border-radius:8px}
 button{cursor:pointer;background:#204a7a;color:white}
 button:disabled{cursor:default;opacity:.55}
 input{max-width:260px}
 #stage{position:relative;flex:1;min-height:240px;background:#17202c;display:flex}
 #stage.fullscreen{position:fixed;inset:0;z-index:1}
 #fullscreen{position:absolute;top:8px;right:8px;z-index:1}
 #screen{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;cursor:pointer}
 #status{min-height:24px;margin:0;padding:4px 16px;overflow-wrap:anywhere}
 #stage.fullscreen+#status{position:fixed;z-index:2;bottom:8px;left:8px;margin-right:8px;border-radius:8px;color:white;background:#17202c;pointer-events:none}
 a{color:#204a7a}
 </style>
 <main>
 <header><h1>抖音 · ${label} 登录验证</h1><a href="/#ops-sync" target="_blank" rel="noopener noreferrer">返回同步区</a></header>
 <div class="tools"><input id="digits" type="password" inputmode="numeric" autocomplete="off" aria-label="手机号或验证码" placeholder="手机号或验证码"><button id="phone">填写手机号</button><button id="code">填写验证码</button><button id="sms">获取短信验证码</button><button data-key="Backspace">退格</button><button data-key="Tab">下一个输入框</button><button id="refresh">刷新画面</button></div>
 <div id="stage"><button id="fullscreen" type="button" aria-pressed="false">全屏显示</button><img id="screen" alt="可点击的抖音官方登录画面" hidden></div>
 <p id="status" role="status">正在连接官方登录画面…</p>
 </main><script src="/ops-control.js"></script></html>`,{headers:{...xhsHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"}});
}

async function opsConnectBrowser(pp,env,sessionId){const [{WorkersWebSocketTransport},{connectToCDPBrowser}]=await Promise.all([import('@cloudflare/puppeteer/internal/cloudflare/WorkersWebSocketTransport.js'),import('@cloudflare/puppeteer/internal/cloudflare/utils.js')]);const transport=await WorkersWebSocketTransport.create(env.BROWSER,sessionId);return connectToCDPBrowser(transport,{sessionId,defaultViewport:null});}

// Only retain public script loading metadata and error categories, never request bodies or login values.
async function opsLoginHealth(page){
 const logs=[];let session;
 try{session=await page.createCDPSession();session.on('Log.entryAdded',({entry})=>{if(entry.level!=='error'&&entry.level!=='warning')return;const t=String(entry.text||'');const network=t.match(/net::(ERR_[A-Z_]+)/)?.[1];logs.push({source:entry.source,level:entry.level,category:network||(/Content Security Policy|CSP/i.test(t)?'content_security_policy':/CORS|cross.origin/i.test(t)?'cross_origin':/ReferenceError/.test(t)?'reference_error':/TypeError/.test(t)?'type_error':'other')});});await session.send('Log.enable');await session.send('Runtime.enable');}catch{return {available:false};}finally{if(session)await session.detach().catch(()=>{});}
 const scripts=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.initiatorType==='script').map(e=>{const u=new URL(e.name);return {host:u.hostname,file:u.pathname.split('/').pop(),status:e.responseStatus||0,duration_ms:Math.round(e.duration)};}).slice(-40));
 return {available:true,logs:logs.slice(-30),scripts};
}
