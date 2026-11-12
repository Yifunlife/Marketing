import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('src/app.js','utf8');
function frontend(){
 const c={Date,Intl,manualPlatformReports:{},accountRows:[['Instagram','工厂号'],['Facebook','工厂号']],foreignPlatforms:['Instagram','Facebook'],accountAdReport:()=>null,douyinData:()=>null,creatorFor:()=>null,displayText:String};
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
