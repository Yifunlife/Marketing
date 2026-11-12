import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('src/app.js','utf8');
function render(name,data=null,report=null){const c={manualPlatformReports:{},creatorFor:()=>null,douyinCreators:{},adEfficiency:()=>'',contentRanking:()=>'',accountManagement:()=>'',douyinInsights:()=>'',douyinDailyTable:()=>'',accountAdReport:()=>report,douyinCreator:data,douyinData:a=>['乐园号','SUPER TADA'].includes(a[1])?data:null,xhsStyle:()=>'',accountOwner:()=> '负责人',cards:rows=>JSON.stringify(rows)};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function tadaMoney('),source.indexOf('function douyinList(')),c);vm.runInContext(source.slice(source.indexOf('function douyinAccountDetail('),source.indexOf('function verifiedAccount(')),c);return c.douyinAccountDetail(['抖音',name]);}
test('Douyin detail includes growth, content, advertising, works and CRM without fabricated zero counts',()=>{const html=render('玩具号');for(const label of ['账号增长与产出','账号内容表现','广告投放','客户与成交','单条作品明细','该账号尚无已匹配的广告报表'])assert(html.includes(label));assert(html.includes('["本月发布","—"]'));assert(!html.includes('9月'));});
test('garden snapshot is never shown for another Douyin account',()=>{assert(render('乐园号',{fans:1234,at:1}).includes('1,234'));assert(!render('玩具号',{fans:1234,at:1}).includes('1,234'));});
test('a verified zero advertising fee is retained',()=>{const html=render('乐园号',null,{periods:{yesterday:{status:'ok',metrics:{fee:0}}},checked_at:1,data_end:'2026-11-01'});assert(html.includes('¥0.00'));});

test('SUPER TADA prioritizes commerce, with missing amounts and verified period comparisons',()=>{
 const empty=render('SUPER TADA',{fans:150});
 for(const label of ['支付金额','核销金额','金额核销比','交易报表待接入','创作数据与作品表现'])assert(empty.includes(label));
 assert(!empty.includes('¥0.00'));
 const html=render('SUPER TADA',{commerce:{current:{start:'2026-11-01',end:'2026-11-08',sales:20000,redeemed:15000,ratio:75},previous:{start:'2026-10-01',end:'2026-10-08',sales:10000,redeemed:8000,ratio:80},trend:[{date:'2026-11-01',sales:20000,redeemed:15000,ratio:75}]}});
 assert(html.includes('↑ 100.0%'));
 assert(html.includes('↓ 5.0 个百分点'));
 assert(html.includes('2026-10-01 至 2026-10-08'));
 assert(html.includes('aria-label="逐日支付金额与核销金额走势图"'));
});
