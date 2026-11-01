import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const c={URL,xjson:(data,status=200)=>Response.json(data,{status})};vm.createContext(c);vm.runInContext(fs.readFileSync('worker/creator-cloud.mjs','utf8'),c);
test('cloud login and preview remain owner-only',async()=>{for(const role of ['viewer','operator','manager']){const r=await c.creatorCloudApi(new Request('https://site/api/creator-cloud/probe',{method:'POST'}),{}, {role});assert.equal(r.status,403);}});
test('missing cloud binding never claims a working collector',async()=>{const r=await c.creatorCloudApi(new Request('https://site/api/creator-cloud/status'),{}, {role:'owner'});assert.equal(r.status,503);});
