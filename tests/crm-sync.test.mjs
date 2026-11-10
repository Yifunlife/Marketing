import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = ['worker/crm-sales-summary.mjs','worker/crm-sync.mjs'].map(file=>fs.readFileSync(file,'utf8')).join('\n');
const noon = Date.parse('2026-11-06T13:00:00+08:00');
const owner = {role:'owner',must_change:false};
const request = new Request('https://site/api/crm/summary');

function runtime(now) {
 const ctx = vm.createContext({
  Date:class extends Date { static now(){ return now; } },
  crypto:{randomUUID:()=> 'new-report'},
  xopen:async value=>JSON.parse(value),
  xseal:async value=>JSON.stringify(value),
  json:(value,status=200)=>Response.json(value,{status})
 });
 vm.runInContext(source,ctx);
 return ctx;
}

function summaryEnv(report, run) {
 return {DB:{
  prepare:()=>({bind:()=>({})}),
  batch:async()=>[
   {results:report?[{payload:JSON.stringify(report),updated_at:report.at+10}]:[]},
   {results:run?[run]:[]}
  ]
 }};
}

test('a scheduled run is only current when it actually wrote the displayed report',async()=>{
 const report = {version:2,run_id:'noon',at:noon+10,written_at:noon+20};
 const run = {id:'noon',status:'succeeded',started_at:report.at};
 const ctx=runtime(noon+16*60000);
 assert.equal((await (await ctx.crmSummaryApi(request,summaryEnv(report,run),owner)).json()).status,'succeeded');
 for (const [latest, expected] of [[{...run,id:'another'},'stale'],[{...run,status:'failed'},'failed']]) {
  const result = await (await ctx.crmSummaryApi(request,summaryEnv(report,latest),owner)).json();
  assert.equal(result.status,expected);
  assert.equal(result.report.run_id,'noon');
 }
 assert.equal((await ctx.crmSummaryApi(request,{}, {role:'viewer'})).status,403);
 assert.equal((await ctx.crmSummaryApi(new Request(request,{method:'DELETE'}),{},owner)).status,405);
});

test('an old report stays visible while the current slot is waiting or missed',async()=>{
 const prior = {version:2,at:noon-150*60000};
 const priorRun = {id:'morning',status:'succeeded',started_at:prior.at};
 for (const [time,status] of [[noon+60_000,'waiting'],[noon+15*60000,'stale']]) {
  const result=await (await runtime(time).crmSummaryApi(request,summaryEnv(prior,priorRun),owner)).json();
  assert.equal(result.status,status);
  assert.equal(result.expected_at,noon);
  assert.equal(result.report.written_at,prior.at+10);
 }
 assert.equal(vm.runInContext('crmExpectedSlot(Date.now())',runtime(noon-5*3600000)),noon-15*3600000);
 const morning=noon-150*60000;
 assert.equal(runtime(morning-1).crmExpectedSlot(morning-1),noon-15*3600000);
 assert.equal(runtime(morning).crmExpectedSlot(morning),morning);
 assert.equal(runtime(noon-1).crmExpectedSlot(noon-1),morning);
});

test('report and success are written in one batch, and a failed write preserves the prior report',async()=>{
 for(const fail of [false,true]){
  const log=[];
  const db={
   prepare:sql=>({bind:(...args)=>({sql,args,run:async()=>{log.push(args);return {meta:{changes:1}};}})}),
   batch:async statements=>{log.push(statements);if(fail)throw Error('database offline');}
  };
  const crmDb={prepare:db.prepare,batch:async()=>Array.from({length:10},(_,i)=>({results:i===2?[{quotes:0}]:[]}))};
  const task=runtime(noon).crmScheduledSync({DB:db,CRM_DB:crmDb});
  if(fail)await assert.rejects(task,/database offline/);
  else await task;
  const [reportWrite,statusWrite]=log[1];
  assert.equal(JSON.parse(reportWrite.args[1]).run_id,'new-report');
  assert.match(statusWrite.sql,/THEN 'succeeded'/);
  assert.equal(statusWrite.args[2],reportWrite.args[1]);
  assert.equal(log[2]?.[0],fail?'failed':undefined);
 }
});


test('sales cards respect the CRM market classification and keep unknown deals out of amount totals',()=>{
 const c=runtime(noon);
 const lead={customers:1,new_customers:1,a_customers:1,contacted:0};
 const sales=c.crmSalesTotals([
  {...lead,source:'小红书',country:'Australia'},
  {...lead,source:'阿里巴巴',country:'中国',market_tag:'内贸'},
  {...lead,country:'中国',branch_owner:1},
  {...lead,source:'未登记'}
 ],[
  {country:'中国',currency:'CNY',orders:2,priced:1,amount_minor:1500},
  {country:'Australia',currency:'CNY',orders:1,priced:1,amount_minor:9000}
 ]);
 assert.equal(sales.domestic.a_customers,1);
 assert.equal(sales.foreign.a_customers,2);
 assert.equal(sales.unclassified.a_customers,1);
 assert.equal(sales.domestic.contracts[0].amount_minor,1500);
 assert.equal(sales.domestic.unverified_orders,1);
 assert.equal(sales.foreign.unverified_orders,1);
 assert.equal(sales.foreign.contracts.length,0);
});
