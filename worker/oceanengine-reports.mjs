const oeGardenId='1870123154441292';
function oeRanges(now=Date.now()){
 const today=new Date(now+8*3600000).toISOString().slice(0,10),end=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10),year=today.slice(0,4),month=today.slice(0,7);
 const ranges={yesterday:{start:end,end},month:{start:month+'-01',end},year:{start:year+'-01-01',end}};
 const priorMonth=new Date(Date.parse(today+'T00:00:00Z'));priorMonth.setUTCDate(1);priorMonth.setUTCMonth(priorMonth.getUTCMonth()-1);const priorStart=priorMonth.toISOString().slice(0,10),priorLast=new Date(Date.UTC(priorMonth.getUTCFullYear(),priorMonth.getUTCMonth()+1,0)).getUTCDate(),days=Number(today.slice(8))-1;
 ranges.previous={start:priorStart,end:new Date(Date.UTC(priorMonth.getUTCFullYear(),priorMonth.getUTCMonth(),Math.min(days,priorLast))).toISOString().slice(0,10)};
 const history=[];for(let m=1;m<=Number(today.slice(5,7));m++){const start=year+'-'+String(m).padStart(2,'0')+'-01',last=new Date(Date.UTC(Number(year),m,0)).toISOString().slice(0,10);if(start<=end)history.push({month:start.slice(0,7),start,end:last<end?last:end});}
 return {today,end,year,month,ranges,history};
}
function oePeriod(data,id,start,end){
 if(!Array.isArray(data?.data_list)||data.data_list.length!==1||Number(data.page_info?.total_page||1)!==1)throw Error('报表未完整返回，保留旧数据');
 const row=data.data_list[0];if(String(row.local_account_id)!==id||typeof row.stat_cost!=='number'||!Number.isFinite(row.stat_cost)||row.stat_cost<0)throw Error('报表账号或金额异常，保留旧数据');
 return {status:'ok',start,end,metrics:{fee:Math.round((row.stat_cost+Number.EPSILON)*100)/100,impression:typeof row.show_cnt==='number'?row.show_cnt:null,click:typeof row.click_cnt==='number'?row.click_cnt:null,convert:typeof row.convert_cnt==='number'?row.convert_cnt:null},checked_at:Date.now()};
}
async function oeFreshToken(env){
 const token=await xget('oe:token',env);if(!token?.access_token)throw Error('尚未完成广告授权');if(token.expires_at>Date.now()+600000)return token;
 const cfg=await xget('oe:config',env);if(!cfg?.secret||!token.refresh_token)throw Error('授权需要重新确认，原数据保留');
 const d=await oeRequest('oauth2/refresh_token/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app_id:Number(oeAppId),secret:cfg.secret,refresh_token:token.refresh_token})});
 if(typeof d.access_token!=='string'||!d.access_token||typeof d.refresh_token!=='string'||!d.refresh_token||!Number.isFinite(Number(d.expires_in))||Number(d.expires_in)<=0)throw Error('凭证刷新失败，原凭证保留');
 const next={...token,access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Date.now()+Number(d.expires_in)*1000,refreshed_at:Date.now()};await xput('oe:token',next,env);return next;
}
async function oeSyncGarden(env,enable=false){
 const lease=crypto.randomUUID(),now=Date.now();
 const lock=await env.DB.prepare('INSERT INTO oceanengine_sync_lock(id,lease,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET lease=excluded.lease,expires=excluded.expires WHERE oceanengine_sync_lock.expires<? RETURNING lease').bind('garden',lease,now+600000,now).first();
 if(!lock)return {busy:true,message:'已有广告同步正在运行，请稍后查看'};
 try{
 const token=await oeFreshToken(env),probe=await xget('oe:local-probe',env),candidate=probe?.accounts?.find(a=>a.id===oeGardenId);
 if(!candidate||!Array.isArray(candidate.info)||!candidate.info.some(a=>String(a.id)===oeGardenId&&a.name==='本地推_乐园号'))throw Error('乐园号投放账户尚未核实');
 const identity=await oeLocalGet('2/advertiser/info/',{advertiser_ids:JSON.stringify([Number(oeGardenId)]),fields:JSON.stringify(['id','name'])},token);
 if(!Array.isArray(identity)||!identity.some(a=>String(a.id)===oeGardenId&&a.name==='本地推_乐园号'))throw Error('官方账号归属校验失败，未改动报表');
 const dates=oeRanges(),old=await xget('oe:reports',env),last=old?.accounts?.find(a=>a.local_account_id===oeGardenId),results=new Map(),raw=[];
 const work=[...Object.values(dates.ranges),...dates.history].filter(r=>r.start<=r.end),uniqueAll=[...new Map(work.map(r=>[r.start+'/'+r.end,r])).values()],cutoff=new Date(Date.now()+8*3600000-30*86400000).toISOString().slice(0,10);const unique=uniqueAll.filter(r=>{const prior=last?.history?.find(h=>h.start===r.start&&h.end===r.end&&h.status==='ok');if(prior&&r.end<cutoff){results.set(r.start+'/'+r.end,prior);return false;}return true;});
 for(let i=0;i<unique.length;i+=2){await Promise.all(unique.slice(i,i+2).map(async r=>{const key=r.start+'/'+r.end;try{
 let d,p;for(let attempt=0;attempt<3;attempt++){try{d=await oeLocalGet('v3.0/local/report/account/get/',{local_account_id:oeGardenId,start_date:r.start,end_date:r.end,metrics:JSON.stringify(['stat_cost','show_cnt','click_cnt','convert_cnt']),time_granularity:'TIME_GRANULARITY_TOTAL',page:'1',page_size:'100'},token);p=oePeriod(d,oeGardenId,r.start,r.end);break;}catch(e){if(attempt===2||['40002','40102'].includes(e.oeCode))throw e;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}}results.set(key,p);raw.push({start:r.start,end:r.end,response:d});
 }catch(e){results.set(key,{status:'error',start:r.start,end:r.end,metrics:{fee:null},error:oeSafeError(e),code:e.oeCode||null});}}));if(i+2<unique.length)await new Promise(resolve=>setTimeout(resolve,500));}
 const period=(r,previous)=>{if(r.start>r.end)return {status:'waiting',...r,metrics:{fee:null}};const p=results.get(r.start+'/'+r.end);if(p.status!=='ok'&&previous?.start===r.start&&previous?.end===r.end&&Number.isFinite(previous?.metrics?.fee))return {...previous,status:'ok',stale:true,last_error:{...p.error,code:p.code}};return p;};
 const periods=Object.fromEntries(Object.entries(dates.ranges).map(([key,r])=>[key,period(r,last?.periods?.[key])])),history=dates.history.map(r=>({...period(r,last?.history?.find(h=>h.month===r.month)),month:r.month}));
 const complete=Object.values(periods).every(p=>(p.status==='ok'&&!p.stale)||p.status==='waiting'),report={platform:'douyin',id:'douyin:'+oeGardenId,local_account_id:oeGardenId,name:'本地推_乐园号',target:'garden',currency:'CNY',periods,history,checked_at:Date.now(),data_end:dates.end};
 if(env.BUCKET&&raw.length)await env.BUCKET.put('oceanengine/garden/'+dates.end+'/'+lease+'.json',JSON.stringify({account_id:oeGardenId,collected_at:Date.now(),reports:raw}),{httpMetadata:{contentType:'application/json'}});
 const value={accounts:[report],checked_at:Date.now(),status:complete?'ok':'partial'};await xput('oe:reports',value,env);await xput('oe:binding:garden',{local_account_id:oeGardenId,name:report.name,verified_at:Date.now()},env);
 if(enable&&complete)await xput('oe:schedule',{enabled:true,account_id:oeGardenId,enabled_at:Date.now()},env);
 return value;
 }finally{await env.DB.prepare('DELETE FROM oceanengine_sync_lock WHERE id=? AND lease=?').bind('garden',lease).run();}
}
async function oeScheduledSync(env){
 if(!(await xget('oe:schedule',env))?.enabled)return;
 const id=crypto.randomUUID(),started=Date.now();await env.DB.prepare('INSERT INTO sync_runs(id,source,status,started_at) VALUES(?,?,?,?)').bind(id,'douyin_oceanengine_garden','running',started).run();
 try{const report=await oeSyncGarden(env);await env.DB.prepare('UPDATE sync_runs SET status=?,finished_at=? WHERE id=?').bind(report.busy?'skipped':report.status==='ok'?'succeeded':'partial',Date.now(),id).run();}
 catch(e){await xput('oe:sync-failure',{checked_at:Date.now(),error:oeSafeError(e)},env);await env.DB.prepare('UPDATE sync_runs SET status=?,finished_at=? WHERE id=?').bind('failed',Date.now(),id).run();}
}
