async function opsImportReport(row,buffer,env){
 const source=await env.DB.prepare('SELECT account_key FROM creator_report_sources WHERE sha256=?').bind(row.sha256).first();
 if(source&&source.account_key!==row.account_key){
  const message='账号不符：已核实此文件来自'+(Object.values(opsSyncTargets).find(target=>target.key===source.account_key)?.label||source.account_key)+'，请上传至对应账号。';
  await env.DB.prepare('UPDATE creator_report_uploads SET status=?,review_message=? WHERE id=?').bind('rejected',message,row.id).run();
  return {status:'rejected',message};
 }
 let daily;
 try{
  const rows=await opsWorkbookRows(buffer,row.original_name.split('.').pop().toLowerCase());
  daily=opsParseDaily(rows,row.report_kind,new Date(Date.now()+28800000).toISOString().slice(0,10));
 }catch(error){
  const message=String(error.message||'报表读取失败').slice(0,250);
  await env.DB.prepare('UPDATE creator_report_uploads SET status=?,review_message=? WHERE id=?').bind('failed',message,row.id).run();
  return {status:'failed',message};
 }
 const statements=[],values=[];
 for(const day of daily)for(const [metric,value] of Object.entries(day.metrics))values.push([row.account_key,day.date,metric,value,row.id,row.uploaded_at]);
 for(let offset=0;offset<values.length;offset+=15){
  const group=values.slice(offset,offset+15);
  statements.push(env.DB.prepare('INSERT INTO douyin_daily_metrics(account_key,metric_date,metric_key,metric_value,report_id,report_uploaded_at) VALUES '+group.map(()=>'(?,?,?,?,?,?)').join(',')+' ON CONFLICT(account_key,metric_date,metric_key) DO UPDATE SET metric_value=excluded.metric_value,report_id=excluded.report_id,report_uploaded_at=excluded.report_uploaded_at WHERE excluded.report_uploaded_at>douyin_daily_metrics.report_uploaded_at OR (excluded.report_uploaded_at=douyin_daily_metrics.report_uploaded_at AND excluded.report_id>=douyin_daily_metrics.report_id)').bind(...group.flat()));
 }
 const message='已读取 '+daily[0].date+' 至 '+daily.at(-1).date+'，共'+daily.length+'天。'+(source?'账号已核实。':'文件未含账号标识，归属按上传时确认的账号记录。');
 // D1 batches are transactional, so status and metrics commit together.
 statements.push(env.DB.prepare('UPDATE creator_report_uploads SET status=?,review_message=? WHERE id=?').bind('imported',message,row.id));
 await env.DB.batch(statements);
 return {status:'imported',message};
}
async function opsReportSnapshot(key,env,legacy){
 const rows=(await env.DB.prepare('SELECT metric_date,metric_key,metric_value,report_uploaded_at FROM douyin_daily_metrics WHERE account_key=? ORDER BY metric_date').bind(key).all()).results||[];
 if(!rows.length)return legacy;
 const data={...legacy},dates=new Map();
 for(const row of rows){if(!dates.has(row.metric_date))dates.set(row.metric_date,{});dates.get(row.metric_date)[row.metric_key]=row.metric_value;}
 const end=rows.at(-1).metric_date,today=new Date(Date.now()+28800000).toISOString().slice(0,10),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10),start=today.slice(0,7)+'-01';
 data.at=Math.max(...rows.map(row=>row.report_uploaded_at));data.data_end=end;
 data.daily=Array.from(dates,([date,metrics])=>({date,...metrics}));
 const fanDay=data.daily.filter(day=>day.fans!==undefined).at(-1);
 if(fanDay){data.fans=fanDay.fans;data.fans_date=fanDay.date;}
 data.month={};data.yesterday=dates.get(yesterday)||{};
 const last=yesterday>=start?yesterday:null;
 if(last)for(const metric of ['posts','plays','likes','comments','shares','net_followers']){
  let complete=true,total=0;
  for(let time=Date.parse(start);time<=Date.parse(last);time+=86400000){
   const day=dates.get(new Date(time).toISOString().slice(0,10));
   if(day?.[metric]===undefined){complete=false;break;}
   total+=day[metric];
  }
  if(complete)data.month[metric]=total;
 }
 data.content={start:data.daily[0].date,end,metrics:{}};
 for(const metric of ['plays','likes','comments','shares'])if(data.daily.every(day=>day[metric]!==undefined))data.content.metrics[metric]=data.daily.reduce((sum,day)=>sum+day[metric],0);
 return data;
}
