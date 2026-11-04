import test from 'node:test';
import assert from 'node:assert/strict';
import {opsWorkbookRows,opsParseDaily} from '../worker/ops-report-parser.mjs';
test('daily content validates dates and preserves real zeroes',()=>{
 const rows=[['日期','投稿量','总播放量','总点赞量'],['2026-11-03','0','261','0']];
 assert.deepEqual(opsParseDaily(rows,'account','2026-11-04'),[{date:'2026-11-03',metrics:{posts:0,plays:261,likes:0}}]);
 for(const bad of [[['日期','总播放量'],['2026-11-04','3']],[['日期','总播放量'],['2026-02-30','3']],[['日期','总播放量'],['2026-11-03','']],[...rows,...rows.slice(1)]])assert.throws(()=>opsParseDaily(bad,'account','2026-11-04'));
 assert.throws(()=>opsParseDaily(rows,'fans','2026-11-04'));
});
test('new followers alone do not become net growth',()=>{
 const rows=[['日期','新增粉丝'],['2026-11-03','3']];
 assert.equal(opsParseDaily(rows,'fans','2026-11-04')[0].metrics.net_followers,undefined);
});
test('CSV handles quoted commas and rejects incomplete quoting',async()=>{
 const rows=await opsWorkbookRows(new TextEncoder().encode('日期,总播放量\n2026-11-03,"1,234"'),'csv');
 assert.equal(opsParseDaily(rows,'account','2026-11-04')[0].metrics.plays,1234);
 await assert.rejects(()=>opsWorkbookRows(new TextEncoder().encode('"broken'),'csv'));
});
