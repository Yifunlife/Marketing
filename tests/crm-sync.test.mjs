import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('worker/crm-sync.mjs','utf8');
const noon = Date.parse('2026-11-06T12:00:00+08:00');
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
 assert.equal((await ctx.crmSummaryApi(new Request(request,{method:'POST'}),{},owner)).status,405);
});

test('an old report stays visible while the current slot is waiting or missed',async()=>{
 const prior = {version:2,at:noon-4*3600000};
 const priorRun = {id:'morning',status:'succeeded',started_at:prior.at};
 for (const [time,status] of [[noon+60_000,'waiting'],[noon+15*60000,'stale']]) {
  const result=await (await runtime(time).crmSummaryApi(request,summaryEnv(prior,priorRun),owner)).json();
  assert.equal(result.status,status);
  assert.equal(result.expected_at,noon);
  assert.equal(result.report.written_at,prior.at+10);
 }
 assert.equal(vm.runInContext('crmExpectedSlot(Date.now())',runtime(noon-5*3600000)),noon-14*3600000);
});

test('report and success are written in one batch, and a failed write preserves the prior report',async()=>{
 for(const fail of [false,true]){
  const log=[];
  const db={
   prepare:sql=>({bind:(...args)=>({sql,args,run:async()=>log.push(args)})}),
   batch:async statements=>{log.push(statements);if(fail)throw Error('database offline');}
  };
  const crmDb={prepare:db.prepare,batch:async()=>Array.from({length:8},(_,i)=>({results:i===2?[{quotes:0}]:[]}))};
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
