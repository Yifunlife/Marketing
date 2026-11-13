import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

test('platform performance deduplicates converted customers, excludes cancelled orders and retains unknown amounts',async()=>{
 const context={Date,crmSalesReportDay:field=>'date('+field+')',crmReportCustomers:"l.channel<>'模拟流程演练' AND COALESCE(l.grade,'') NOT IN ('Yifun Staff','同事')",json:(value,status=200)=>Response.json(value,{status}),opsSyncAllowed:(user,write=false,permission=2)=>user.permissions.includes(permission)};
 vm.createContext(context);
 vm.runInContext(fs.readFileSync('worker/crm-platform-performance.mjs','utf8'),context);
 const day=new Date(Date.now()+28800000).toISOString().slice(0,10);
 const env={CRM_DB:{
  prepare:sql=>({bind:(...values)=>({sql,values})}),
  batch:async statements=>JSON.parse(execFileSync('python3',['-c',String.raw`
import sys,json,sqlite3
j=json.load(sys.stdin)
db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
db.executescript("""
CREATE TABLE crm_users(id TEXT,active INTEGER);
CREATE TABLE crm_leads(id TEXT,owner_id TEXT,entered TEXT,created TEXT,source TEXT,channel TEXT,grade TEXT);
CREATE TABLE crm_attribution_leads(lead_id TEXT,source_kind TEXT,campaign_id TEXT);
CREATE TABLE crm_attribution_campaigns(id TEXT,platform TEXT,account_id TEXT);
CREATE TABLE crm_operation_accounts(id TEXT,platform TEXT,account_ref TEXT,active INTEGER);
INSERT INTO crm_operation_accounts VALUES('fb','Facebook','facebook-factory',1);
CREATE TABLE crm_deals(id TEXT,lead_id TEXT,cancelled INTEGER,deal_date TEXT);
CREATE TABLE crm_workflow_contracts(deal_id TEXT,currency TEXT,total_minor INTEGER);
INSERT INTO crm_users VALUES('u',1);
""")
day=j['day']
for id,source in [('a','独立站'),('b','独立站'),('c','Meta'),('d','Instagram')]:
 db.execute("INSERT INTO crm_leads VALUES(?,?,?,? ,?,'正式','A')",(id,'u',day,day,source))
db.execute("INSERT INTO crm_attribution_leads VALUES('c','广告活动','x')")
db.execute("INSERT INTO crm_attribution_campaigns VALUES('x','Facebook','fb')")
for id,lead,cancelled in [('one','a',0),('two','a',0),('cancelled','b',1),('meta','c',0),('unknown','d',0)]:
 db.execute("INSERT INTO crm_deals VALUES(?,?,?,?)",(id,lead,cancelled,day))
for id,amount in [('one',10000),('two',5000),('meta',20000)]:
 db.execute("INSERT INTO crm_workflow_contracts VALUES(?,'USD',?)",(id,amount))
print(json.dumps([{'results':[dict(r) for r in db.execute(q['sql'],q['values'])]} for q in j['statements']]))
`],{input:JSON.stringify({day,statements}),encoding:'utf8'}))
 }};
 const response=await context.crmPlatformPerformanceApi(new Request('https://site/api/crm/platform-performance'),env,{permissions:[1]});
 const data=await response.json();
 assert.equal(data.platforms['独立站'].month.customers,2);
 assert.equal(data.platforms['独立站'].month.converted,1);
 assert.equal(data.platforms['独立站'].month.conversion,50);
 assert.equal(data.platforms['独立站'].year.amounts[0].amount_minor,15000);
 assert.equal(data.platforms.Facebook.month.orders,1);
 assert.equal(data.accounts[0].account_ref,'facebook-factory');
 assert.equal(data.accounts[0].month.amounts[0].amount_minor,20000);
 assert.equal(data.accounts[0].month.conversion,100);
 assert.equal(data.platforms.Instagram.month.unpriced,1);
 assert(!data.platforms['抖音']);
 assert.equal((await context.crmPlatformPerformanceApi(new Request('https://site/api/crm/platform-performance'),{}, {permissions:[]})).status,403);
});
