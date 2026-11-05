import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/app.js','utf8');
function setup(report=null){const c={Date,accountOwner:()=> '潘家庆',accountAdReport:()=>report};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function displayText('),source.indexOf('function platformManagement('))+source.slice(source.indexOf('function contentRanking('),source.indexOf('function douyinAccountDetail(')),c);return c;}
const period=(start,end,metrics)=>({status:'ok',start,end,metrics});
test('cost decrease has a down arrow and correct delta, spend is neutral',()=>{const c=setup();assert.match(c.metricChange(1.76,2,{money:true,cost:true}),/improved.*↓ 12.0% · 减少 ¥0.24/);assert(!c.metricChange(80,100,{money:true}).includes('improved'));assert.match(c.metricChange(2.2,2,{money:true,cost:true}),/worsened.*↑ 10.0%/);});
test('zero and missing baselines never generate misleading percentages',()=>{const c=setup();assert.match(c.metricChange(10,0),/上期为0/);assert(!c.metricChange(10,0).includes('Infinity'));assert.match(c.metricChange(null,1),/暂无同口径对比/);assert.match(c.metricChange(0,0),/持平/);});
test('monthly cost comparison rejects stale, unequal days and wrong months',()=>{const c=setup(),r={periods:{month:period('2026-11-01','2026-11-03',{fee:80,click:50}),previous:period('2026-10-01','2026-10-03',{fee:100,click:50})}};assert(c.comparableAdPeriods(r));assert.match(c.adEfficiency(r),/↓ 20.0%/);r.periods.previous.end='2026-10-31';assert.equal(c.comparableAdPeriods(r),null);r.periods.previous.end='2026-10-03';r.periods.month.stale=true;assert.equal(c.comparableAdPeriods(r),null);assert(!c.adEfficiency(r).includes('↓ 20.0%'));});
test('click cost and rate remain unknown when denominator is zero',()=>{const c=setup(),html=c.adEfficiency({periods:{month:period('2026-11-01','2026-11-03',{fee:10,click:0,impression:0})}});assert(!html.includes('Infinity'));assert(!html.includes('NaN'));assert.equal((html.match(/<strong>—<\/strong>/g)||[]).length,2);});
test('ranking shortens only display text, escapes full copy and preserves missing covers',()=>{const c=setup(),title='😀这是很长的完整作品标题用于验证显示可以截断但不能丢失原始文案<script>';const html=c.contentRanking({top:{at:1,scope:'本文件累计',items:[{title,plays:123}]}});assert(html.includes(c.shortWorkTitle(title).replace('<','&#60;')));assert(html.includes('完整文案'));assert(!html.includes('<script>'));assert(html.includes('&#60;script&#62;'));assert(html.includes('封面<br>待补'));assert(!html.includes('<img'));});
test('management actions show evidence and owner, without attributing causes or customers',()=>{const c=setup(),html=c.accountManagement(['抖音','工厂号'],{data_end:'2026-11-03',month:{posts:2,net_followers:-3},top:{items:[{title:'医院场景',plays:100}]}});assert(html.includes('检查粉丝流失'));assert(html.includes('本月净增 -3'));assert(html.includes('潘家庆'));assert(html.includes('历史累计领先不代表昨日领先'));assert(html.includes('归因'));assert(!html.includes('自动增加预算'));});

test('daily decline alert needs consecutive days and states observation without causation',()=>{const c=setup(),data={daily:[{date:'2026-11-02',plays:457},{date:'2026-11-03',plays:244}]};assert.match(c.accountManagement(['抖音','工厂号'],data),/244，较前一日 ↓46.6%/);data.daily[0].date='2026-11-01';assert(!c.accountManagement(['抖音','工厂号'],data).includes('244，较前一日'));});

test('CTR absolute change is labelled in percentage points',()=>{const c=setup();assert.match(c.metricChange(8,4,{unit:'个百分点'}),/↑ 100.0% · 增加 4个百分点/);});

test('interval ranking uses increments and can switch to cumulative without mixing time scopes',()=>{
 const c=setup(),item={title:'CT机',published_at:'2024-09-13 16:46:40',plays:112556,delta_plays:52,likes:731,cover_url:'/api/cover'};
 const data={top:{at:2000,scope:'累计快照',items:[item],interval:{status:'ok',start:1000,end:2000,compared:1000,missing:0,corrected:0,items:[item]}}};
 let html=c.contentRanking(data);assert(html.includes('新增播放前10名 · 两次采集之间'));assert(html.includes('<td>52</td>'));assert(html.includes('其他指标为本次累计值'));assert(html.includes('不是官方昨日自然日排名'));assert(html.includes('真实封面 1/1'));
 c.douyinRankingMode='cumulative';html=c.contentRanking(data);assert(html.includes('<td>112,556</td>'));assert(html.includes('<th>累计播放</th>'));assert(!html.includes('新增播放前10名 · 两次采集之间'));
});
