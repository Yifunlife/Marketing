import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
function context(expired=false){
 const calls=[],saved={};
 const c={Response,Request,URL,crypto,btoa,atob,TextEncoder,TextDecoder,AbortSignal,fetch:async(url,options)=>{const b=JSON.parse(options.body);calls.push({url,body:b});if(url.includes('refresh_token'))return Response.json({code:401});return Response.json({code:0,data:{aggregation_data:{fee:b.advertiser_id===332719?10:20,impression:100,click:4,interaction:2}}});}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('worker/xhs-callback.mjs','utf8').replaceAll('export ',''),c);
 c.xhsTokens=async()=>[{key:'tokens:factory',token:{access_token:'factory',refresh_token:'f',received_at:expired?0:Date.now(),access_token_expires_in:86400,approval_advertisers:[{advertiser_id:332719,advertiser_name:'工厂'}]}},{key:'tokens:garden',token:{access_token:'garden',refresh_token:'g',received_at:Date.now(),access_token_expires_in:86400,approval_advertisers:[{advertiser_id:136547,advertiser_name:'乐园'}]}}];
 c.xget=async()=>({app_id:14895,secret:'test-secret'});c.xput=async(k,v)=>{saved[k]=v;};return {c,calls,saved};
}
test('sync keeps separately authorized factory and garden reports',async()=>{const {c,calls}=context();const r=await c.xhsSync({DB:{}});assert.equal(r.accounts.length,2);assert.equal(r.accounts.find(a=>a.id==='332719').periods.yesterday.metrics.fee,10);assert.equal(r.accounts.find(a=>a.id==='136547').periods.yesterday.metrics.fee,20);assert(calls.some(x=>x.body.advertiser_id===332719));assert(calls.some(x=>x.body.advertiser_id===136547));});
test('expired authorization does not prevent another brand syncing or turn failures into zero',async()=>{const {c}=context(true);const r=await c.xhsSync({DB:{}});const factory=r.accounts.find(a=>a.id==='332719');assert.equal(factory.periods.yesterday.status,'error');assert.equal(factory.periods.yesterday.metrics,undefined);assert.equal(r.accounts.find(a=>a.id==='136547').periods.yesterday.metrics.fee,20);});
