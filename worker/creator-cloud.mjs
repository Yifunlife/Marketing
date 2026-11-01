// Cloud login feasibility check. No local browser state is copied or exported.
async function cloudPuppeteer(){return (await import('@cloudflare/puppeteer')).default;}
function cloudSafeError(e){return String(e?.message||'cloud_browser_failed').replace(/https?:[^\s]+/g,'[url]').slice(0,180);}
async function creatorCloudApi(req,env,user){
 if(user.role!=='owner'||user.must_change)return xjson({error:'仅主管理员可操作云端采集'},403);
 const path=new URL(req.url).pathname;
 if(!env.BROWSER)return xjson({error:'云端浏览器尚未绑定'},503);
 if(path==='/api/creator-cloud/status'&&req.method==='GET'){const session=await xget('creator_cloud_login',env);return xjson({stage:session&&session.expires>Date.now()?'login_ready':'not_started',enabled:false,expires:session?.expires||null});}
 if(path==='/api/creator-cloud/screenshot'&&req.method==='GET'){const session=await xget('creator_cloud_login',env);if(!session||session.expires<Date.now())return xjson({error:'预览已过期，请重新检查'},410);const object=await env.BUCKET.get('private/creator-cloud/login-preview.png');if(!object)return xjson({error:'暂无预览'},404);return new Response(object.body,{headers:{...xhsHeaders,'Content-Type':'image/png'}});}
 if(path==='/api/creator-cloud/probe'&&req.method==='POST'){
  let browser;try{const existing=await xget('creator_cloud_login',env);if(existing?.expires>Date.now())return xjson({ok:true,stage:'login_ready',message:'云端登录页已打开，预览尚在有效期；尚未启用定时采集。'});const pp=await cloudPuppeteer();browser=await pp.launch(env.BROWSER,{keep_alive:90000});const page=await browser.newPage();await page.setViewport({width:1280,height:900});const response=await page.goto('https://creator.xiaohongshu.com/login',{waitUntil:'networkidle2',timeout:35000});const text=await page.evaluate(()=>document.body.innerText);const ready=/APP扫一扫登录|扫码登录/.test(text);const status=response?.status()||0;
   await env.BUCKET.put('private/creator-cloud/login-preview.png',await page.screenshot({type:'png'}),{httpMetadata:{contentType:'image/png'}});
   if(!ready){await browser.close();browser=null;return xjson({ok:false,status,stage:'blocked',message:'云端尚未成功显示小红书扫码登录入口，未启用采集。'},422);}
   await xput('creator_cloud_login',{session_id:browser.sessionId(),expires:Date.now()+90000,created_at:Date.now()},env);browser.disconnect();browser=null;
   return xjson({ok:true,status,stage:'login_ready',message:'云端已显示扫码登录页，尚未登录、未启用定时采集。预览90秒有效。'});
  }catch(e){return xjson({error:'云端浏览器检查失败',detail:cloudSafeError(e)},502);}finally{if(browser)await browser.close().catch(()=>{});}
 }
 return xjson({error:'接口不存在'},404);
}
function creatorCloudSetup(){const response=xpage('<h1>乐园号 · 云端采集检查</h1><p>目标：上海亦玩游乐设备集团。云端方案尚未启用，现有数据保留。</p><p>先检查云端能否打开小红书。每次最多保留浏览器90秒。扫码登录、保存登录状态及定时采集将在验证后单独完成。</p><button id="probe">检查云端登录页</button><p id="out">等待检查</p><img id="preview" style="max-width:100%;display:none" alt="云端小红书登录页预览"><p><a href="/">返回运营看板</a></p>',`document.querySelector('#probe').onclick=async()=>{const button=document.querySelector('#probe'),out=document.querySelector('#out');button.disabled=true;out.textContent='正在检查云端浏览器…';try{const r=await fetch('/api/creator-cloud/probe',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const d=await r.json();out.textContent=d.message||[d.error,d.detail].filter(Boolean).join('：');if(d.ok){const image=document.querySelector('#preview');image.src='/api/creator-cloud/screenshot?t='+Date.now();image.style.display='block';}}catch{out.textContent='请求未成功，请稍后重试。';}finally{button.disabled=false;}};`);const headers=new Headers(response.headers);headers.set('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");return new Response(response.body,{headers});}
