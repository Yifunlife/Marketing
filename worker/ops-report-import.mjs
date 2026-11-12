async function opsImportReport(row,buffer,env,verifiedDaily,rowsForImport,verifiedWorks){
 const source=await env.DB.prepare('SELECT account_key FROM creator_report_sources WHERE sha256=?').bind(row.sha256).first();
 if(source&&source.account_key!==row.account_key){
  const message='账号不符：已核实此文件来自'+(Object.values(opsSyncTargets).find(target=>target.key===source.account_key)?.label||source.account_key)+'，请上传至对应账号。';
  await env.DB.prepare('UPDATE creator_report_uploads SET status=?,review_message=? WHERE id=?').bind('rejected',message,row.id).run();
  return {status:'rejected',message};
 }
 let daily=verifiedDaily;
 if(!daily)try{
  let rows=rowsForImport||await opsWorkbookRows(buffer,row.original_name.split('.').pop().toLowerCase());
  if(row.account_key==='wechat-video')rows=opsWechatReportRows(rows,row.report_kind);
  if(row.report_kind==='works')return await opsImportContent(row,rows,env,verifiedWorks);
  const today=new Date(Date.now()+28800000).toISOString().slice(0,10);
  daily=row.report_kind==='commerce'?opsParseCommerceDaily(rows,today):opsParseDaily(rows,row.report_kind,today);
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
async function opsReportSnapshot(key,env,legacy,includeCommerce=true){
 const allRows=(await env.DB.prepare('SELECT metric_date,metric_key,metric_value,report_uploaded_at FROM douyin_daily_metrics WHERE account_key=? ORDER BY metric_date').bind(key).all()).results||[];
 const top=await opsContentSummary(key,env);
 const commerce=includeCommerce&&key==='supertada'?opsCommerceSnapshot(allRows):null;
 const rows=allRows.filter(row=>!row.metric_key.startsWith('commerce_')&&!row.metric_key.startsWith('manual_'));
 if(!rows.length)return top||commerce?{...legacy,top,...(commerce?{commerce}:{})}:legacy;
 const data={...legacy,top,...(commerce?{commerce}:{})},dates=new Map();
 for(const row of rows){if(!dates.has(row.metric_date))dates.set(row.metric_date,{});dates.get(row.metric_date)[row.metric_key]=row.metric_value;}
 const end=rows.at(-1).metric_date,today=new Date(Date.now()+28800000).toISOString().slice(0,10),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10),start=today.slice(0,7)+'-01';
 data.at=Math.max(...rows.map(row=>row.report_uploaded_at));data.data_end=end;
 data.daily=Array.from(dates,([date,metrics])=>({date,...metrics}));
 const fanDay=data.daily.filter(day=>day.fans!==undefined).at(-1);
 if(fanDay){data.fans=fanDay.fans;data.fans_date=fanDay.date;}
 data.month_partial={};data.month_coverage={};
 data.month={};data.yesterday=dates.get(yesterday)||{};
 const last=yesterday>=start?yesterday:null;
 if(last)for(const metric of ['posts','plays','likes','comments','shares','net_followers']){
  let complete=true,total=0;
  for(let time=Date.parse(start);time<=Date.parse(last);time+=86400000){
   const day=dates.get(new Date(time).toISOString().slice(0,10));
   if(day?.[metric]===undefined){complete=false;break;}
   total+=day[metric];
  }
  const available=data.daily.filter(day=>day.date>=start&&day.date<=last&&Number.isFinite(day[metric]));
  if(available.length){
   data.month_partial[metric]=available.reduce((sum,day)=>sum+day[metric],0);
   data.month_coverage[metric]={start:available[0].date,end:available.at(-1).date,days:available.length,expected:Number(last.slice(8)),complete};
  }
  if(complete)data.month[metric]=total;
 }
 data.content={start:data.daily[0].date,end,metrics:{}};
 data.content_partial={};
 for(const metric of ['plays','likes','comments','shares']){
  const values=data.daily.filter(day=>Number.isFinite(day[metric]));
  if(values.length)data.content_partial[metric]=values.reduce((sum,day)=>sum+day[metric],0);
 }
 data.content_date=data.daily.filter(day=>Number.isFinite(day.plays)||Number.isFinite(day.posts)).at(-1)?.date||null;
 for(const metric of ['plays','likes','comments','shares'])if(data.daily.every(day=>day[metric]!==undefined))data.content.metrics[metric]=data.daily.reduce((sum,day)=>sum+day[metric],0);
 return data;
}

function opsWechatReportRows(rows,kind){
 const works=kind==='works';
 const names=works?{'视频描述':'作品名称','视频ID':'作品ID','评论量':'评论量','分享量':'分享量'}:{'时间':'日期','播放':'总播放量','评论':'总评论量','分享':'总分享量','关注':'新增粉丝'};
 const required=works?['视频描述','视频ID','发布时间','播放量']:['时间','播放'];
 const index=rows.findIndex(row=>required.every(name=>row.includes(name)));
 if(index<0)throw Error('未找到视频号官方报表所需表头。');
 const header=rows[index],dateIndex=header.indexOf(works?'发布时间':'时间');
 return [header.map(name=>names[name]||name),...rows.slice(index+1).filter(row=>row.some(value=>String(value??'').trim())).map(row=>{
  if(works&&!String(row[header.indexOf('视频ID')]||'').trim())throw Error('视频ID缺失。');
  const values=row.slice(),date=String(values[dateIndex]||'').trim().replaceAll('/','-');
  values[dateIndex]=works&&/^\d{4}-\d{2}-\d{2}$/.test(date)?date+' 00:00:00':date;
  return values;
 })];
}

function opsCommerceSnapshot(rows,now=Date.now()){
 const today=new Date(now+28800000).toISOString().slice(0,10);
 const dates=new Map();
 let updated_at=0;
 for(const row of rows){
  const field={commerce_sales_cents:'sales',commerce_redeemed_cents:'redeemed'}[row.metric_key];
  if(!field||row.metric_date>=today)continue;
  if(!dates.has(row.metric_date))dates.set(row.metric_date,{date:row.metric_date});
  dates.get(row.metric_date)[field]=row.metric_value;
  updated_at=Math.max(updated_at,row.report_uploaded_at||0);
 }
 const daily=[...dates.values()].filter(day=>Number.isSafeInteger(day.sales)&&Number.isSafeInteger(day.redeemed))
  .sort((a,b)=>a.date.localeCompare(b.date));
 if(!daily.length)return null;
 const end=daily.at(-1).date,month=today.slice(0,7),dayMs=86400000;
 const iso=time=>new Date(time).toISOString().slice(0,10);
 const ratio=(sales,redeemed)=>sales>0?redeemed/sales*100:null;
 const period=(start,length)=>{
  const values=Array.from({length},(_,i)=>dates.get(iso(start+i*dayMs)));
  if(values.some(day=>!Number.isSafeInteger(day?.sales)||!Number.isSafeInteger(day?.redeemed)))return null;
  const sales=values.reduce((sum,day)=>sum+day.sales,0),redeemed=values.reduce((sum,day)=>sum+day.redeemed,0);
  if(!Number.isSafeInteger(sales)||!Number.isSafeInteger(redeemed))return null;
  return {start:iso(start),end:iso(start+(length-1)*dayMs),sales,redeemed,ratio:ratio(sales,redeemed)};
 };
 let current=null,previous=null;
 if(end.startsWith(month)){
  const start=Date.parse(month+'-01'),length=Number(end.slice(8));
  current=period(start,length);
  const [year,monthNumber]=month.split('-').map(Number);
  const previousStart=Date.UTC(year,monthNumber-2,1);
  if(current&&previousStart+length*dayMs<=start)previous=period(previousStart,length);
 }
 const last=Date.parse(end);
 const trendLength=Math.min(14,(last-Date.parse(daily[0].date))/dayMs+1);
 const trend=Array.from({length:trendLength},(_,i)=>{
  const date=iso(last-(trendLength-1-i)*dayMs),row=dates.get(date);
  return {date,sales:row?.sales??null,redeemed:row?.redeemed??null,ratio:ratio(row?.sales,row?.redeemed)};
 });
 const available=daily.filter(day=>day.date.startsWith(month));
 const partial_current=available.length?{
  start:available[0].date,end:available.at(-1).date,days:available.length,
  sales:available.reduce((sum,day)=>sum+day.sales,0),
  redeemed:available.reduce((sum,day)=>sum+day.redeemed,0)
 }:null;
 if(partial_current)partial_current.ratio=ratio(partial_current.sales,partial_current.redeemed);
 return {data_end:end,updated_at,current,partial_current,previous,trend,stale:last<Date.parse(today)-dayMs};
}
