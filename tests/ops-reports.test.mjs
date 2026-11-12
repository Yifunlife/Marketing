import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
function setup(){
 const rows=[],objects=new Map();
 const context={URL,Response,Date,TextEncoder,creatorTarget:key=>({key}),creatorSetting:(target,kind)=>target.key+':'+kind,xget:async()=>null,crypto:webcrypto,Uint8Array,TextDecoder,opsReportSnapshot:async()=>null,opsImportReport:async()=>({status:'pending',message:'待核对'}),xhsHeaders:{},xjson:(value,status=200)=>Response.json(value,{status})};
 vm.createContext(context);vm.runInContext(fs.readFileSync('worker/ops-report-parser.mjs','utf8').replaceAll('export ',''),context);vm.runInContext(fs.readFileSync('worker/ops-manual-reports.mjs','utf8'),context);for(const file of ['ops-sync','ops-content','ops-report-import','ops-reports'])vm.runInContext(fs.readFileSync('worker/'+file+'.mjs','utf8'),context);
 context.opsImportReport=async()=>({status:'pending',message:'待核对'});
 const env={BUCKET:{put:async(key,value)=>objects.set(key,value),get:async key=>objects.has(key)?{body:objects.get(key)}:null},DB:{prepare:query=>({bind(...args){return {first:async()=>query.includes('sha256=?')?rows.find(row=>row.account_key===args[0]&&row.report_kind===args[1]&&row.sha256===args[2]):rows.find(row=>row.id===args[0]&&row.account_key===args[1]),all:async()=>({results:rows.filter(row=>row.account_key===args[0])}),run:async()=>{const keys=['id','account_key','report_kind','sha256','object_key','original_name','content_type','size_bytes','uploaded_by','uploaded_at','status'];rows.push(Object.fromEntries(keys.map((key,index)=>[key,args[index]])));}};}})}};
 return {context,env,rows,objects};
}
test('report upload stores originals separately, deduplicates and scopes downloads to account',async()=>{
 const {context,env,rows,objects}=setup(),body='日期,播放量\n2026-11-03,25';
 const make=()=>new Request('https://site/api/ops-sync/douyin-factory/reports?kind=account',{method:'POST',headers:{Origin:'https://site','Content-Length':String(Buffer.byteLength(body)),'X-File-Name':encodeURIComponent('工厂.csv')},body});
 let response=await context.opsReportsApi(make(),env,{id:'operator'},{key:'factory'});
 assert.equal(response.status,201);const result=await response.json();
 assert.equal(rows[0].status,'pending');assert.equal(objects.size,1);
 response=await context.opsReportsApi(make(),env,{id:'operator'},{key:'factory'});
 assert.equal((await response.json()).duplicate,true);assert.equal(rows.length,1);
 response=await context.opsReportsApi(new Request('https://site/reports?file='+result.id),env,{},{key:'toy'});
 assert.equal(response.status,404);
 response=await context.opsReportsApi(new Request('https://site/reports?file='+result.id),env,{},{key:'factory'});
 assert.equal(await response.text(),body);
});
test('invalid report payloads and cross-origin uploads never write originals',async()=>{
 const {context,env,objects}=setup();
 for(const headers of [{Origin:'https://other','Content-Length':'2','X-File-Name':'x.csv'},{Origin:'https://site','Content-Length':'2','X-File-Name':'x.xlsx'}]){
  const response=await context.opsReportsApi(new Request('https://site/reports?kind=fans',{method:'POST',headers,body:'hi'}),env,{id:'operator'},{key:'factory'});
  assert(response.status>=400);
 }
 assert.equal(objects.size,0);
});

test('template scope prevents wrong account and report type uploads before storing the file',async()=>{
 const {context,env,rows,objects}=setup();
 const target={key:'instagram-garden',profile:'social'};
 const make=(marker)=>{const body=marker+'\n日期,播放量\n2025/1/9,21';
  return new Request('https://site/reports?kind=platform-daily',{method:'POST',headers:{Origin:'https://site','Content-Length':String(Buffer.byteLength(body)),'X-File-Name':'daily.csv'},body});
 };
 for(const marker of ['运营报表模板,v1,facebook-garden,platform-daily','运营报表模板,v1,instagram-toy,platform-daily','运营报表模板,v1,instagram-garden,advertising','账号汇总']){
  const response=await context.opsReportsApi(make(marker),env,{id:'operator'},target);
  assert.equal(response.status,400);
 }
 assert.equal(objects.size,0);
 context.opsImportReport=async(row,buffer,env,daily)=>{assert.equal(daily[0].date,'2025-01-09');assert.equal(daily[0].metrics.manual_daily_views,21);return {status:'imported'};};
 const response=await context.opsReportsApi(make('运营报表模板,v1,instagram-garden,platform-daily'),env,{id:'operator'},target);
 assert.equal(response.status,201);
 assert.equal(rows.length,1);
 assert.equal(objects.size,1);
});

test('cloud success disables single-report downloads and writes without hiding other kinds',async()=>{
 const {context,env,objects}=setup();
 const day=context.opsShanghaiReportDay();
 context.xget=async key=>key==='garden:collection'?{ok:true,as_of:day}:null;
 const user={role:'owner',id:'operator'},path='https://site/api/ops-sync/xhs-garden';
 const cards=(await(await context.opsSyncApi(new Request('https://site/api/ops-sync'),env,user)).json()).cards;
 const card=cards.find(value=>value.id==='xhs-garden');
 assert(card.cloud_reports['platform-daily']);
 assert(!card.cloud_reports.advertising);
 assert.equal((await context.opsSyncApi(new Request(path+'/template?kind=platform-daily'),env,user)).status,409);
 const body='运营报表模板,v1,xhs-garden,platform-daily\n日期,观看量\n2025-01-09,21';
 const upload=()=>new Request(path+'/reports?kind=platform-daily',{method:'POST',headers:{Origin:'https://site','Content-Length':String(Buffer.byteLength(body)),'X-File-Name':'daily.csv'},body});
 assert.equal((await context.opsSyncApi(upload(),env,user)).status,409);
 assert.equal(objects.size,0);
 context.xget=async()=>({ok:true,as_of:'2025-01-09'});
 assert.equal((await context.opsSyncApi(upload(),env,user)).status,201);
});

test('a consolidated file cannot be imported as an individual official report',async()=>{
 const {context,env,objects}=setup();
 const body='运营汇总模板,v1\n运营报表模板,v1,douyin-toy,account,抖音,玩具号,账号概览\n日期,总播放量\n2025-01-09,21';
 const request=new Request('https://site/api/ops-sync/douyin-factory/reports?kind=account',{method:'POST',headers:{Origin:'https://site','Content-Length':String(Buffer.byteLength(body)),'X-File-Name':'combined.csv'},body});
 const result=await context.opsSyncApi(request,env,{role:'owner'});
 assert.equal(result.status,400);
 assert.match((await result.json()).error,/多个账号一起补报/);
 assert.equal(objects.size,0);
});

test('one batch validates each scope, skips cloud-covered blocks and stores others separately',async()=>{
 const {context,env,objects,rows}=setup(),day=context.opsShanghaiReportDay();
 const user={role:'owner',id:'operator'},url='https://site/api/ops-sync/batch';
 const foreignTemplate=await context.opsSyncApi(new Request(url+'/template'),env,{role:'operator',permissions:[1]});
 const contents=await foreignTemplate.text();
 assert.match(contents,/运营报表模板,v1,instagram-garden,platform-daily/);
 assert.doesNotMatch(contents,/xhs-garden|douyin-garden/);
 context.xget=async key=>key==='garden:collection'?{ok:true,as_of:day}:null;
 const fullTemplate=await context.opsSyncApi(new Request(url+'/template'),env,user);
 assert.doesNotMatch(await fullTemplate.text(),/运营报表模板,v1,xhs-garden,platform-daily/);
 const submit=(body,operator=user)=>context.opsSyncApi(new Request(url+'/reports?format=csv',{method:'POST',headers:{Origin:'https://site','Content-Length':String(Buffer.byteLength(body))},body}),env,operator);
 const sections=[
  '运营汇总模板,v1',
  '运营报表模板,v1,xhs-garden,platform-daily,小红书,乐园号,平台经营日报\n日期,观看量\n2025-01-09,31',
  '运营报表模板,v1,instagram-garden,platform-daily,Instagram,乐园号,平台经营日报\n日期,播放量\n2025-01-09,21',
  '运营报表模板,v1,facebook-toy,advertising,Facebook,玩具号,广告效果日报\n日期,币种,广告花费\n2025-01-09,USD,3.50'
 ];
 context.opsImportReport=async()=>({status:'imported',message:'已读取'});
 assert.equal((await submit(sections.join('\n'),{role:'operator',permissions:[1]})).status,400);
 assert.equal((await submit(sections.join('\n').replace('USD,3.50','USD,wrong'))).status,422);
 assert.equal(objects.size,0);
 const response=await submit(sections.join('\n'));
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).results.map(row=>row.status),['skipped','imported','imported']);
 assert.deepEqual(rows.map(row=>row.account_key),['instagram-garden','facebook-toy']);
 assert.equal(objects.size,2);
});
