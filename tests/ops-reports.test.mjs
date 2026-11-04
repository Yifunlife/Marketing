import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
function setup(){
 const rows=[],objects=new Map();
 const context={URL,Response,Date,crypto:webcrypto,Uint8Array,xhsHeaders:{},xjson:(value,status=200)=>Response.json(value,{status})};
 vm.createContext(context);vm.runInContext(fs.readFileSync('worker/ops-reports.mjs','utf8'),context);
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
