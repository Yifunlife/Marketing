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
test('interval growth preserves true zero, excludes corrections and old works without baselines',async()=>{
 const {c}=setup(),start=Date.parse('2026-11-04T14:00:00+08:00'),end=Date.parse('2026-11-05T11:00:00+08:00');
 const rows=[
  {title:'旧视频',published_at:'2024-01-01 10:00:00',plays:120,previous_plays:100},
  {title:'本窗口发布',published_at:'2026-11-04 20:00:00',plays:30,previous_plays:null},
  {title:'旧作品无基线',published_at:'2023-01-01 10:00:00',plays:999,previous_plays:null},
  {title:'指标回调',published_at:'2024-01-01 10:00:00',plays:80,previous_plays:100},
  {title:'未增长',published_at:'2024-01-01 10:00:00',plays:100,previous_plays:100},
 ];
 const env={DB:{prepare:q=>({bind:()=>({all:async()=>({results:q.includes('ROW_NUMBER')?[{id:'current',uploaded_at:end},{id:'previous',uploaded_at:start}]:rows})})})}};
 const result=await c.opsContentInterval('factory',env);
 assert.equal(result.items[0].delta_plays,30);assert.equal(result.items[1].delta_plays,20);assert.equal(result.items[2].delta_plays,0);
 assert.equal(result.missing,1);assert.equal(result.corrected,1);assert.equal(result.start,start);assert.equal(result.end,end);
});
