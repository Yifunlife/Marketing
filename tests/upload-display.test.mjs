import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/app.js','utf8');
function frontend(){
 const c={Date,Intl,manualPlatformReports:{},accountRows:[['Instagram','工厂号'],['Facebook','工厂号']],foreignPlatforms:['Instagram','Facebook','YouTube','TikTok','阿里巴巴','独立站','WhatsApp'],accountAdReport:()=>null,douyinData:()=>null,creatorFor:()=>null,displayText:String};
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('const manualMetricLabels='),source.indexOf('function verifiedAccount(')),c);
 vm.runInContext(source.slice(source.indexOf('function creatorValue('),source.indexOf('function creatorAccount(')),c);
 vm.runInContext(source.slice(source.indexOf('function accountAdFee('),source.indexOf('function domesticAnnualTotal(')),c);
 return c;
}
test('uploaded foreign reports feed account cards and the ledger without summing follower snapshots or currencies',()=>{
 const c=frontend(),month=c.reportToday().slice(0,7);
 c.manualPlatformReports['instagram-factory']=[
  {date:month+'-02',daily:{fans:125,posts:3},ad:{currency:'USD',spend:230}},
  {date:month+'-01',daily:{fans:120,posts:2},ad:{currency:'CNY',spend:400}}
 ];
 assert.equal(c.creatorValue(['Instagram','工厂号'],'fans'),125);
 assert.equal(c.creatorValue(['Instagram','工厂号'],'posts'),5);
 assert.equal(c.creatorValue(['Facebook','工厂号'],'posts'),null);
 assert.match(c.uploadedAccountSummary(['Instagram','工厂号']),/125/);
 assert.match(c.accountAdFee(['Instagram','工厂号']),/USD 2.30/);
 assert.match(c.uploadedAdTotal(true),/CNY 4.00/);
 assert.match(c.accountCoverage(['Instagram','工厂号']),/2 天/);
});

test('partial-month native and commerce reports remain visible while full-month totals stay incomplete',async()=>{
 const now=Date.parse('2026-11-12T00:00:00+08:00');
 const rows=[
  {metric_date:'2026-11-09',metric_key:'posts',metric_value:2,report_uploaded_at:1},
  {metric_date:'2026-11-10',metric_key:'posts',metric_value:3,report_uploaded_at:2},
  {metric_date:'2026-11-10',metric_key:'fans',metric_value:200,report_uploaded_at:2}
 ];
 const c={Date:class extends Date{static now(){return now;}},opsContentSummary:async()=>null};
 vm.createContext(c);
 vm.runInContext(fs.readFileSync('worker/ops-report-import.mjs','utf8'),c);
 const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:rows})})})}};
 const native=await c.opsReportSnapshot('factory',env,null);
 assert.equal(native.month.posts,undefined);
 assert.equal(native.month_partial.posts,5);
 assert.equal(native.month_coverage.posts.days,2);
 assert.equal(native.month_coverage.posts.complete,false);
 const commerce=c.opsCommerceSnapshot([
  {metric_date:'2026-11-09',metric_key:'commerce_sales_cents',metric_value:10000},
  {metric_date:'2026-11-09',metric_key:'commerce_redeemed_cents',metric_value:6000}
 ],now);
 assert.equal(commerce.current,null);
 assert.equal(commerce.partial_current.sales,10000);
 assert.equal(commerce.partial_current.ratio,60);
 assert.equal(commerce.previous,null);
});

test('successful uploads refresh every account source across tabs, and a later upload queues a fresh read',async()=>{
 const listeners=new Map(),reads=[];
 let renders=0;
 const c={
  douyinCreators:{},manualPlatformReports:{},creatorData:{},state:{tab:0},location:{origin:'https://site'},
  AbortSignal,document:{hidden:false,addEventListener(){}},setInterval(){},
  window:{addEventListener:(name,listener)=>listeners.set(name,listener)},
  root:{addEventListener(){},querySelector:()=>null},render:()=>renders++,
  fetch:(url,options)=>new Promise(resolve=>{assert.equal(options.cache,'no-store');reads.push(resolve);})
 };
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('let reportRefreshPromise='),source.indexOf("window.addEventListener('ops:open'")),c);
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 listeners.get('storage')({key:'ops:reports-updated',newValue:'1'});
 listeners.get('storage')({key:'ops:reports-updated',newValue:'2'});
 assert.equal(reads.length,1);
 reads[0]({ok:true,json:async()=>({accounts:{factory:{fans:100}},manual:{'instagram-garden':[{date:'2026-11-09'}]},creators:{factory:{fans:200}}})});
 await flush();
 assert.equal(reads.length,2);
 reads[1]({ok:true,json:async()=>({accounts:{factory:{fans:101}},manual:{'instagram-garden':[{date:'2026-11-10'}]},creators:{factory:{fans:201}}})});
 await flush();
 assert.equal(c.douyinCreators.factory.fans,101);
 assert.equal(c.manualPlatformReports['instagram-garden'][0].date,'2026-11-10');
 assert.equal(c.creatorData.factory.fans,201);
 assert.equal(renders,2);
});

test('foreign cards adapt to platform metrics and distinguish upload time, old dates, zero and missing values',()=>{
 const c=frontend();
 const month=c.reportToday().slice(0,7);
 c.manualPlatformReports['whatsapp-channel']=[{date:month+'-01',daily:{conversations:0},ad:{},uploaded_at:Date.parse(month+'-10T00:00:00Z')}];
 const a=['WhatsApp','渠道汇总'];
 const html=c.foreignAccountCard(a,20);
 assert.match(html,/新增对话/);
 assert.match(html,/<strong>0<\/strong>/);
 assert.match(html,/已回复对话/);
 assert.match(html,/待补充/);
 assert.doesNotMatch(html,/总粉丝|本月发布/);
 assert.match(html,/数据截至：/);
 assert.match(html,/最近入库：/);
 assert.match(html,new RegExp(month+'-01'));
 assert.match(c.uploadedAccountSummary(['阿里巴巴','渠道汇总']),/经营指标/);
 assert.match(c.uploadedAccountSummary(['阿里巴巴','渠道汇总']),/待上传报表/);
});

test('homepage specialist section uses imported platform fields and keeps all entry points',()=>{
 const c=frontend(),month=c.reportToday().slice(0,7);
 c.accountRows.push(['阿里巴巴','渠道汇总'],['独立站','渠道汇总'],['WhatsApp','渠道汇总']);
 c.manualPlatformReports['website-channel']=[{date:month+'-02',daily:{visitors:25,submissions:0,whatsapp_clicks:3},ad:{}}];
 c.manualPlatformReports['alibaba-channel']=[{date:month+'-01',daily:{inquiries:7},ad:{}}];
 const html=c.specialistHomepage();
 for(const name of ['店铺曝光与询盘','网站访问与转化','对话承接与留资'])assert.match(html,new RegExp(name));
 assert.match(html,/<strong>25<\/strong>/);
 assert.match(html,/<strong>0<\/strong>/);
 assert.match(html,/<strong>7<\/strong>/);
 for(const key of ['alibaba-channel','website-channel','whatsapp-channel'])assert.match(html,new RegExp('/ops-sync\\?embedded=1#'+key));
 assert.doesNotMatch(html,/总粉丝|本月发布/);
 assert.match(source,/specialistHomepage\(\)\+ledger/);
});

test('account sales require a verified account reference and never reuse platform totals',()=>{
 const c=frontend();
 vm.runInContext(`platformPerformance={platforms:{Facebook:{month:{orders:9}}},accounts:[{platform:'Facebook',account_ref:'facebook-factory',month:{orders:1,amounts:[{currency:'USD',amount_minor:12500}],conversion:25},year:{orders:1,amounts:[{currency:'USD',amount_minor:12500}],conversion:10}}]}`,c);
 assert.match(c.accountSalesCells(['Facebook','工厂号']),/USD 125/);
 assert.match(c.accountSalesCells(['Facebook','工厂号']),/25.0%/);
 assert.match(c.accountSalesCells(['Facebook','玩具号']),/待归属/);
 assert.doesNotMatch(c.accountSalesCells(['Facebook','玩具号']),/USD 125/);
 assert.match(c.accountSalesCells(['Instagram','工厂号']),/待归属/);
});

test('month comparison requires matched complete dates and handles zero baselines honestly',()=>{
 const c=frontend(),month=c.reportToday().slice(0,7),[y,m]=month.split('-').map(Number),prior=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7),a=['阿里巴巴','渠道汇总'];
 const row=(date,value)=>({date,daily:{clicks:value},ad:{}});
 c.manualPlatformReports['alibaba-channel']=[row(month+'-01',20),row(month+'-02',40),row(prior+'-01',10),row(prior+'-02',20)];
 assert.match(c.manualMetricChange(a,'clicks'),/↑ 100.0%/);
 c.manualPlatformReports['alibaba-channel'].pop();
 assert.match(c.manualMetricChange(a,'clicks'),/暂无对比/);
 c.manualPlatformReports['alibaba-channel']=[row(month+'-01',20),row(prior+'-01',0)];
 assert.match(c.manualMetricChange(a,'clicks'),/↑ 新增/);
 assert.doesNotMatch(c.manualMetricChange(a,'clicks'),/Infinity/);
 c.manualPlatformReports['alibaba-channel']=[row(month+'-01',0),row(prior+'-01',0)];
 assert.match(c.manualMetricChange(a,'clicks'),/→ 0.0%/);
});

test('ledger respects comparable native months and treats lower costs as improvement',()=>{
 const c=frontend(),month=c.reportToday().slice(0,7),[y,m]=month.split('-').map(Number),previous=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
 const data={fans:100,month:{start:month+'-01',end:month+'-02',posts:6},previous:{start:previous+'-01',end:previous+'-02',posts:4}};
 c.douyinData=()=>data;
 assert.match(c.ledgerMetric(['抖音','工厂号'],'posts'),/↑ 50.0%/);
 data.previous.end=previous+'-01';
 assert.match(c.ledgerMetric(['抖音','工厂号'],'posts'),/暂无对比/);
 assert.match(c.ledgerDelta(50,100,true),/class="period-delta up"[^>]*>↓ 50.0%/);
 assert.match(c.ledgerDelta(10,0),/↑ 新增/);
});
