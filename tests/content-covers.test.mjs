import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(){
 const hash='a'.repeat(64),queries=[];
 const env={DB:{prepare(query){queries.push(query);return {bind(...values){return {
  first:async()=>query.includes('creator_content_covers')?(values[0]==='factory'&&values[1]===hash?{object_key:'private/covers/a',content_type:'image/webp'}:null):{id:'new-report',uploaded_at:100,review_message:'最新报表'},
  all:async()=>({results:[{title:'精确匹配的作品',cover_sha256:hash,cover_observed_at:80}]}),
 };}};}},BUCKET:{get:async()=>({body:'image bytes'})}};
 const c={URL,Response,encodeURIComponent,xhsHeaders:{},xjson:(value,status=200)=>Response.json(value,{status})};
 vm.createContext(c);vm.runInContext(fs.readFileSync('worker/ops-content.mjs','utf8'),c);
 return {c,env,hash,queries};
}
test('R2 covers are account scoped and reject invalid identifiers',async()=>{
 const {c,env,hash}=setup();
 const request=new Request('https://site/api/ops-sync/douyin-factory/covers?sha='+hash);
 const response=await c.opsContentCover(request,env,{key:'factory'});
 assert.equal(response.status,200);assert.equal(await response.text(),'image bytes');
 assert.equal(response.headers.get('Content-Type'),'image/webp');
 assert.match(response.headers.get('Cache-Control'),/^private/);
 assert.equal((await c.opsContentCover(request,env,{key:'toy'})).status,404);
 assert.equal((await c.opsContentCover(new Request('https://site/covers?sha=../x'),env,{key:'factory'})).status,404);
});
test('new works reports reuse covers through the account and exact content key',async()=>{
 const {c,env,hash,queries}=setup(),summary=await c.opsContentSummary('factory',env);
 assert.equal(summary.at,100);
 assert.equal(summary.items[0].cover_url,'/api/ops-sync/douyin-factory/covers?sha='+hash);
 assert(queries.some(q=>q.includes('c.account_key=i.account_key AND c.item_key=i.item_key')));
 assert(queries.some(q=>q.includes('i.report_id=?')));
});
