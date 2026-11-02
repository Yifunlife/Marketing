import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';
const c={Date,JSON,Number};vm.createContext(c);vm.runInContext(fs.readFileSync('worker/creator.mjs','utf8'),c);
const metrics=Object.fromEntries(['posts','video_posts','image_posts','net_followers','new_followers','lost_followers','impressions','views','likes','comments','collects','shares','profile_visits'].map(k=>[k,0]));
test('partial month is not presented as a complete month',()=>{assert.equal(c.creatorPeriod([{date:'2026-10-30',metrics}], '2026-10-01','2026-10-30'),null);});
test('a real zero remains zero and dates stay explicit',()=>{const r=c.creatorPeriod([{date:'2026-10-30',metrics}],'2026-10-30','2026-10-30');assert.equal(r.posts,0);assert.equal(r.start,'2026-10-30');});
test('missing metric is not coerced to zero',()=>{assert.equal(c.creatorPeriod([{date:'2026-10-30',metrics:{posts:0}}], '2026-10-30','2026-10-30'),null);});

test('growth is independent of missing content metrics and preserves negative and zero',()=>{const rows=[{date:'2026-11-01',metrics:{posts:0,net_followers:-2}}];assert.equal(c.creatorMetric(rows,'2026-11-01','2026-11-01','posts'),0);assert.equal(c.creatorMetric(rows,'2026-11-01','2026-11-01','net_followers'),-2);assert.equal(c.creatorMetric(rows,'2026-11-01','2026-11-02','posts'),null);assert.equal(c.creatorMetric(rows,'2026-11-01','2026-10-31','posts'),0);});
