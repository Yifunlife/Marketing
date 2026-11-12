import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({});
for(const file of ['worker/ops-report-parser.mjs','worker/ops-report-import.mjs']){
 vm.runInContext(fs.readFileSync(file,'utf8').replaceAll('export ',''),context);
}
const json=value=>JSON.parse(JSON.stringify(value));
const header=['日期','支付金额（元）','核销金额（元）'];
const report=(date,sales,redeemed)=>[
 {metric_date:date,metric_key:'commerce_sales_cents',metric_value:sales,report_uploaded_at:1},
 {metric_date:date,metric_key:'commerce_redeemed_cents',metric_value:redeemed,report_uploaded_at:1}
];

test('commerce import parses yuan as cents, validates dates and rejects order detail',()=>{
 const parsed=context.opsParseCommerceDaily([header,['2026/11/01','¥1,234.05','1200.2'],['2026-11-02','0','0'],['合计','1234.05','1200.20']],'2026-11-03');
 assert.deepEqual(json(parsed),[
  {date:'2026-11-01',metrics:{commerce_sales_cents:123405,commerce_redeemed_cents:120020}},
  {date:'2026-11-02',metrics:{commerce_sales_cents:0,commerce_redeemed_cents:0}}
 ]);
 for(const rows of [
  [header,['2026-11-03','1','2']],
  [header,['2026-11-02','','2']],
  [header,['2026-11-02','1','2'],['2026-11-02','1','2']],
  [[...header,'订单号'],['2026-11-02','1','2','123']],
  [[...header,'抖音号'],['2026-11-02','1','2','shanghaiyiwan']]
 ])assert.throws(()=>context.opsParseCommerceDaily(rows,'2026-11-03'));
});

test('monthly comparison matches days, uses aggregated amount ratio and keeps gaps unknown',()=>{
 const now=Date.parse('2026-11-04T11:00:00+08:00');
 const rows=[
  ...report('2026-10-01',100,30),...report('2026-10-02',200,60),...report('2026-10-03',200,60),
  ...report('2026-11-01',100,300),...report('2026-11-02',0,50),...report('2026-11-03',400,200)
 ];
 const data=context.opsCommerceSnapshot(rows,now);
 assert.deepEqual(json({...data.current,ratio:Math.round(data.current.ratio)}),{start:'2026-11-01',end:'2026-11-03',sales:500,redeemed:550,ratio:110});
 assert.equal(data.previous.sales,500);
 assert.equal(data.previous.ratio,30);
 assert.equal(data.trend.find(d=>d.date==='2026-11-02').ratio,null);
 const gaps=context.opsCommerceSnapshot(rows.filter(d=>d.metric_date!=='2026-11-02'),now);
 assert.equal(gaps.current,null);
 assert.equal(gaps.previous,null);
 assert.equal(gaps.trend.find(d=>d.date==='2026-11-02').sales,null);
 assert.equal(context.opsCommerceSnapshot(rows,now+86400000).stale,true);
});

test('commerce does not change content dates or expose amounts to other accounts or restricted viewers',async()=>{
 const rows=[
  ...report('2026-11-01',100,200),
  {metric_date:'2026-10-31',metric_key:'fans',metric_value:150,report_uploaded_at:1}
 ];
 const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:rows})})})}};
 context.opsContentSummary=async()=>null;
 const data=await context.opsReportSnapshot('supertada',env,null);
 assert.equal(data.data_end,'2026-10-31');
 assert.equal(data.commerce.data_end,'2026-11-01');
 assert.equal((await context.opsReportSnapshot('supertada',env,null,false)).commerce,undefined);
 assert.equal((await context.opsReportSnapshot('garden',env,null)).commerce,undefined);
});
