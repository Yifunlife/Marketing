import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
test('scheduler skips successful same-day sources independently and retries failures at Shanghai midnight',async()=>{
 const now=Date.parse('2026-11-13T13:00:00+08:00'),start=Date.parse('2026-11-13T00:00:00+08:00');
 const records=[{source:'crm',status:'succeeded',at:start},{source:'xiaohongshu_creator_factory',status:'succeeded',at:start+1},{source:'xiaohongshu_creator_toy',status:'failed',at:start+1}];
 const c={Date,creatorTargets:{factory:{key:'factory'},toy:{key:'toy'}},scheduledCreatorSync:async(_,t)=>called.push(t.key)},called=[];
 vm.createContext(c);vm.runInContext(fs.readFileSync('worker/scheduled-once.mjs','utf8'),c);
 const env={DB:{prepare:()=>({bind:(source,a,b)=>({first:async()=>records.find(r=>r.source===source&&r.status==='succeeded'&&r.at>=a&&r.at<=b)})})}};
 assert.equal(await c.runScheduledSourceOnce(env,'crm',()=>called.push('crm'),now),false);
 assert.equal(await c.runScheduledSourceOnce(env,'xiaohongshu_creator_toy',()=>called.push('toy'),now),true);
 assert.equal(await c.runScheduledSourceOnce(env,'crm',()=>called.push('next-day'),start+86400000),true);
 assert.deepEqual(called,['toy','next-day']);
});
