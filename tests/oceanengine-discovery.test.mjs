import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(){
 const saved=new Map([['oe:discovery',{accounts:[{id:'1869959148397577',type:'PLATFORM_ROLE_ENTERPRISE_BP_ADMIN',valid:true}]}]]);
 const c={Date,Number,oeFreshToken:async()=>({access_token:'private'}),xget:async key=>saved.get(key),xput:async(key,value)=>saved.set(key,value),oeSafeError:()=>({detail:'official_error'})};
 vm.createContext(c);vm.runInContext(fs.readFileSync('worker/oceanengine-discovery.mjs','utf8'),c);return {c,saved};
}
test('enterprise discovery reads both business types and all pages without binding candidates',async()=>{
 const {c,saved}=setup(),calls=[];
 c.oeLocalGet=async(route,p)=>{calls.push([route,p]);return {account_list:[{account_id:p.account_source+ p.page==='AD1'?'1870000000000001':'1870000000000002',account_name:p.account_source+'账户',account_type:p.account_source}],page_info:{total_page:p.account_source==='AD'?2:1}};};
 const result=await c.oeEnterpriseProbe({});
 assert.equal(calls.length,3);assert.equal(result.status,'ok');assert(calls.every(([r,p])=>r==='2/ebp/advertiser/list/'&&p.enterprise_organization_id==='1869959148397577'));
 assert.equal(result.binding_status,'unverified');assert(!saved.has('oe:binding:factory'));assert(!saved.has('oe:reports'));
});
test('enterprise query failures remain explicit and unsafe IDs cannot become account candidates',async()=>{
 const {c}=setup();c.oeLocalGet=async()=>({account_list:[{account_id:Number.MAX_SAFE_INTEGER+2,account_name:'工厂号'}]});
 const result=await c.oeEnterpriseProbe({});assert.equal(result.accounts.length,0);assert.equal(result.status,'partial');assert(result.checks.every(c=>c.status==='error'));
});
test('advertising identity probe never infers a factory binding from a workspace name',async()=>{
 const {c,saved}=setup();saved.set('oe:enterprise-probe',{accounts:[{id:'1728056104268814',name:'上海亦玩游乐设备集团',account_source:'AD'}]});
 c.oeLocalGet=async()=>({list:[{aweme_id:'other-account',aweme_name:'其他号',auth_status:'AUTHORIZED'}]});
 const result=await c.oeAdIdentityProbe({});assert.equal(result.accounts[0].awemes[0].id,'other-account');assert(!saved.has('oe:binding:factory'));
});
