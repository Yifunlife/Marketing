import fs from 'node:fs';
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist/public',{recursive:true});
for(const name of ['editing.js','acquisition.js','allocation.js','crm.js','accounts.js','brand-ui.js','brand.css','files.html'])fs.copyFileSync('src/'+name,'dist/public/'+name);
const html=fs.readFileSync('src/index.html','utf8').replace('<script src="app.js"></script>','<script src="/editing.js"></script><script src="/acquisition.js"></script><script src="/allocation.js"></script><script src="/crm.js"></script><script src="/accounts.js"></script><script src="/brand-ui.js"></script>');fs.writeFileSync('dist/public/index.html',html);
const source=['worker/auth.mjs','worker/xhs-callback.mjs','worker/xhs-bindings.mjs','worker/files.mjs','worker/douyin.mjs','worker/oceanengine.mjs','worker/crm.mjs','worker/acquisition.mjs','worker/allocation.mjs','worker/scheduled.mjs','worker/creator-config.mjs','worker/creator.mjs','worker/creator-cloud.mjs','worker/creator-collect.mjs'].map(p=>fs.readFileSync(p,'utf8').replaceAll('export async function ','async function ').replaceAll('export function ','function ')).join('\n');
const app=fs.readFileSync('src/app.js','utf8');
const entry=`
export default {async scheduled(event,env,ctx){if(['0 23 * * *','30 3 * * *','30 6 * * *'].includes(event.cron))ctx.waitUntil(scheduledCreatorsSync(env));else ctx.waitUntil(scheduledSync(env));},async fetch(req,env){try{const url=new URL(req.url),p=url.pathname;
if(p==='/integrations/oceanengine/callback')return await oeCallback(req,env);
if(p==='/integrations/oceanengine')return oeSetup();
if(p==='/integrations/douyin/callback')return await dyCallback(req,env);
if(p==='/integrations/douyin')return dySetup();
if(p==='/health')return json({ok:true,service:'yifun-marketing',database:!!env.DB,files:!!env.BUCKET});
if(p==='/integrations/xiaohongshu/callback')return await xhsCallback(req,env);
if(p==='/integrations/xiaohongshu/creator-cloud')return creatorCloudSetup(url.searchParams.get('account')||'garden');
if(p==='/integrations/xiaohongshu')return xhsSetup();
if(p.startsWith('/api/'))return await api(req,env);
if(p==='/brand-logo.png'){const object=await env.BUCKET.get('branding/brand-logo.png');if(!object)return new Response('Logo not available',{status:404});return new Response(object.body,{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff'}});}
if(p==='/app.js'){const check=await api(new Request(new URL('/api/me',req.url),{headers:req.headers}),env);if(check.status!==200)return check;const record=await env.DB.prepare('SELECT payload FROM marketing_snapshot WHERE id=?').bind('xhs-factory').first();const snapshot=record?JSON.parse(record.payload):{};const last=await xget('reports',env);const adBindings=await xget('advertiser_bindings',env)||{},factoryAd=Object.prototype.hasOwnProperty.call(adBindings,'factory')?adBindings.factory:'332719';const report=(last?.accounts||[]).find(a=>a.id===factoryAd)||null;if(report?.periods?.month?.status==='ok')snapshot.adFee=Number(report.periods.month.metrics.fee).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});const text=APP_SOURCE.replace('__CREATOR_REPORTS__',JSON.stringify(await creatorReports(env))).replace('__LIVE_XHS_REPORTS__',JSON.stringify({...last,accounts:last?.accounts||[],bindings:await xget('advertiser_bindings',env)||{}})).replace('__LIVE_XHS_REPORT__',JSON.stringify(report)).replace('__MARKETING_NOTES__',JSON.stringify(snapshot.notes||[])).replaceAll('__XHS_FANS__',snapshot.fans||'—').replaceAll('__XHS_AD_FEE__',snapshot.adFee||'—');return new Response(text,{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});}
return env.ASSETS.fetch(req);
}catch{return json({error:'服务暂时不可用'},500);}}};`;
fs.writeFileSync('dist/worker.mjs',source+'\nconst APP_SOURCE='+JSON.stringify(app)+';\n'+entry);
