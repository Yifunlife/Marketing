async function opsReportsApi(req,env,user,target){
 const url=new URL(req.url),fileId=url.searchParams.get('file');
 if(req.method==='GET'){
  if(fileId){
   const row=await env.DB.prepare('SELECT * FROM creator_report_uploads WHERE id=? AND account_key=?').bind(fileId,target.key).first();
   if(!row)return xjson({error:'报表不存在'},404);
   const object=await env.BUCKET.get(row.object_key);
   if(!object)return xjson({error:'报表原件暂不可用'},404);
   return new Response(object.body,{headers:{...xhsHeaders,'Content-Type':row.content_type,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(row.original_name),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
  }
  const rows=await env.DB.prepare('SELECT id,report_kind,original_name,size_bytes,uploaded_at,status,review_message FROM creator_report_uploads WHERE account_key=? ORDER BY uploaded_at DESC LIMIT 30').bind(target.key).all();
  const now=Date.now(),day=new Date(now+8*3600000).toISOString().slice(0,10);
  const start=Date.parse(day+'T00:00:00+08:00');
  const today=await env.DB.prepare('SELECT report_kind,status,uploaded_at,review_message FROM (SELECT report_kind,status,uploaded_at,review_message,ROW_NUMBER() OVER (PARTITION BY report_kind ORDER BY uploaded_at DESC,id DESC) AS position FROM creator_report_uploads WHERE account_key=? AND uploaded_at>=? AND uploaded_at<?) WHERE position=1').bind(target.key,start,start+86400000).all();
  const snapshot=target.profile||target.xhs?null:await opsReportSnapshot(target.key,env,null);
  const manualRows=await env.DB.prepare("SELECT metric_date,metric_key,metric_value,report_uploaded_at FROM douyin_daily_metrics WHERE account_key=? AND metric_key GLOB 'manual_*' AND metric_date>=date('now','+8 hours','-60 days')").bind(target.key).all();
  const manual=opsManualSummary(manualRows.results||[]);
  const cloud={};
  for(const kind of opsReportTypes(target)){
   const end=await opsCloudReportStatus(env,target,kind,day);
   if(end)cloud[kind]=end;
  }
  return xjson({reports:rows.results||[],cloud_reports:cloud,day,today:today.results||[],manual,last_at:snapshot?.at||null,data_end:snapshot?.data_end||null,commerce:snapshot?.commerce?{data_end:snapshot.commerce.data_end,updated_at:snapshot.commerce.updated_at}:null});
 }
 if(req.method!=='POST')return xjson({error:'方法不支持'},405);
 if(req.headers.get('Origin')!==url.origin)return xjson({error:'请从运营看板上传报表'},403);
 const length=Number(req.headers.get('Content-Length'));
 if(!Number.isSafeInteger(length)||length<=0||length>20*1024*1024)return xjson({error:'单份报表应小于20MB'},413);
 const kind=url.searchParams.get('kind');
 if(!opsReportTypes(target).includes(kind))return xjson({error:'请选择报表类型'},400);
 if(await opsCloudReportStatus(env,target,kind))return xjson({error:'云端已同步该报表，今天无需补传。'},409);
 let name;
 try{name=decodeURIComponent(req.headers.get('X-File-Name')||'');}catch{return xjson({error:'文件名无效'},400);}
 name=name.replace(/[\r\n\x00-\x1f]/g,'').slice(0,200);
 const ext=name.split('.').pop()?.toLowerCase();
 const types={csv:'text/csv',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel'};
 if(!types[ext])return xjson({error:'请上传官方导出的CSV、XLSX或XLS报表'},415);
 const buffer=await req.arrayBuffer(),bytes=new Uint8Array(buffer);
 if(bytes.length!==length)return xjson({error:'文件传输不完整，请重新上传'},400);
 if(ext==='xlsx'&&(bytes[0]!==80||bytes[1]!==75))return xjson({error:'Excel文件格式不正确'},415);
 if(ext==='xls'&&![208,207,17,224,161,177,26,225].every((value,index)=>bytes[index]===value))return xjson({error:'XLS文件格式不正确，请优先导出XLSX或CSV'},415);
 if(ext==='csv'&&bytes.includes(0))return xjson({error:'请上传UTF-8或GBK编码的CSV文件'},415);
 let data;
 try{
  data=opsValidateUpload(await opsWorkbookRows(buffer,ext),target,kind,opsShanghaiReportDay());
 }catch(error){return xjson({error:String(error.message||'报表校验失败').slice(0,250)},400);}
 if(await opsCloudReportStatus(env,target,kind))return xjson({error:'云端已同步该报表，今天无需补传。'},409);
 const result=await opsStoreReport(env,user,target,kind,name,types[ext],buffer,data);
 return xjson(result,result.duplicate?200:201);
}
function opsValidateUpload(rows,target,kind,today,strict=false){
 const rowsForImport=opsScopedTemplateRows(rows,target.uploadId||target.key,kind);
 let verifiedDaily,verifiedWorks;
 if(kind==='commerce')verifiedDaily=opsParseCommerceDaily(rowsForImport,today);
 if(kind==='platform-daily'||kind==='advertising')verifiedDaily=opsParseManualDaily(rowsForImport,kind,target,today);
 if(strict&&!verifiedDaily){
  const data=target.reportKey==='wechat-video'?opsWechatReportRows(rowsForImport,kind):rowsForImport;
  if(kind==='works')verifiedWorks=opsParseContent(data);
  else verifiedDaily=opsParseDaily(data,kind,today);
 }
 return {rowsForImport,verifiedDaily,verifiedWorks};
}
async function opsStoreReport(env,user,target,kind,name,contentType,buffer,{rowsForImport,verifiedDaily,verifiedWorks}){
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),value=>value.toString(16).padStart(2,'0')).join('');
 const existing=await env.DB.prepare('SELECT * FROM creator_report_uploads WHERE account_key=? AND report_kind=? AND sha256=?').bind(target.key,kind,sha256).first();
 if(existing?.status==='imported')return {id:existing.id,duplicate:true,already_imported:true,status:'imported',message:'相同报表已入库，已沿用原记录。'};
 if(existing){const result=await opsImportReport(existing,buffer,env,verifiedDaily,rowsForImport,verifiedWorks);return {id:existing.id,duplicate:true,...result};}
 const id=crypto.randomUUID(),key='private/creator-reports/'+(target.profile||target.xhs?'manual':target.reportKey?'wechat':'douyin')+'/'+target.key+'/'+kind+'/'+sha256;
 await env.BUCKET.put(key,buffer,{httpMetadata:{contentType}});
 await env.DB.prepare('INSERT OR IGNORE INTO creator_report_uploads (id,account_key,report_kind,sha256,object_key,original_name,content_type,size_bytes,uploaded_by,uploaded_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,target.key,kind,sha256,key,name,contentType,buffer.byteLength,user.id,Date.now(),'pending').run();
 const stored=await env.DB.prepare('SELECT * FROM creator_report_uploads WHERE account_key=? AND report_kind=? AND sha256=?').bind(target.key,kind,sha256).first();
 const result=await opsImportReport(stored,buffer,env,verifiedDaily,rowsForImport,verifiedWorks);
 return {id:stored.id,...result};
}

function opsBatchTarget(user,id){
 const foreign=Object.hasOwn(opsManualTargets,id);
 const targets=foreign?opsManualTargets:opsSyncTargets;
 return Object.hasOwn(targets,id)&&opsSyncAllowed(user,true,foreign?1:2)?opsResolveReportTarget(targets[id],id):null;
}
async function opsBatchReportsApi(req,env,user,action){
 const day=opsShanghaiReportDay();
 if(req.method==='GET'&&action==='template'){
  const ids=[...Object.keys(opsSyncTargets),...Object.keys(opsManualTargets)];
  const blocks=await Promise.all(ids.map(async id=>{
   const target=opsBatchTarget(user,id);
   if(!target)return [];
   const kinds=await Promise.all(opsReportTypes(target).map(async kind=>{
    if(await opsCloudReportStatus(env,target,kind,day))return [];
    const template=opsReportTemplate(target,kind);
    return [['运营报表模板','v1',id,kind,target.platform,target.label,template.label],template.columns,[]];
   }));
   return kinds.flat();
  }));
  const rows=blocks.flat();
  if(!rows.length)return xjson({error:'当前没有需要上传的报表。'},409);
  return opsDownloadReportCsv('运营数据汇总补报-'+day+'.csv',[['运营汇总模板','v1'],...rows]);
 }
 if(req.method!=='POST'||action!=='reports')return xjson({error:'操作不支持'},405);
 const url=new URL(req.url),length=Number(req.headers.get('Content-Length')),ext=url.searchParams.get('format');
 if(req.headers.get('Origin')!==url.origin)return xjson({error:'请从运营看板上传报表'},403);
 if(!Number.isSafeInteger(length)||length<=0||length>20*1024*1024)return xjson({error:'单份报表应小于20MB'},413);
 if(!['csv','xlsx'].includes(ext))return xjson({error:'请上传填好的汇总 CSV 或 XLSX'},415);
 const buffer=await req.arrayBuffer();
 if(buffer.byteLength!==length)return xjson({error:'文件传输不完整，请重新上传'},400);
 const sections=[];
 try{
  const rows=(await opsWorkbookRows(buffer,ext)).filter(row=>row.some(value=>String(value??'').trim()));
  const start=rows.shift();
  if(start?.[0]!=='运营汇总模板'||start[1]!=='v1')throw Error('请使用本页下载的汇总模板，保留第一行。');
  const seen=new Set();
  let section;
  for(const row of rows){
   if(row[0]==='运营报表模板'){
    const [,version,id,kind,platform,label,type]=row;
    const target=opsBatchTarget(user,id),template=target&&opsReportTemplate(target,kind),key=id+'/'+kind;
    if(version!=='v1'||!template||platform!==target.platform||label!==target.label||type!==template.label||seen.has(key))throw Error('账号、报表类型或权限不符，或同一报表区域重复。请重新下载汇总模板。');
    seen.add(key);
    section={target,kind,template,rows:[row],label:[platform,label,type].join(' / ')};
    sections.push(section);
   }else{
    if(!section)throw Error('数据必须填在对应账号的表头下方。');
    section.rows.push(row);
   }
  }
 }catch(error){return xjson({error:String(error.message||'汇总报表无法读取').slice(0,250)},400);}
 const ready=[],results=[],errors=[];
 for(const section of sections){
  const {target,kind,template,rows,label}=section;
  if(rows.length>2&&await opsCloudReportStatus(env,target,kind,day)){
   results.push({label,status:'skipped',message:'云端已同步，已跳过'});
   continue;
  }
  try{
   const header=Array.from(rows[1]||[],value=>String(value??'').trim()).filter(Boolean);
   if(!header.length||header.some(name=>!template.columns.includes(name))||new Set(header).size!==header.length)throw Error('表头与模板不符。');
   if(rows.length===2)continue;
   if(rows.slice(2).some(row=>row.some((cell,index)=>!rows[1][index]&&String(cell??'').trim())))throw Error('存在无表头的数据列。');
   ready.push({...section,data:opsValidateUpload(rows,target,kind,day,true)});
  }catch(error){errors.push(label+' · '+error.message);}
 }
 if(errors.length)return xjson({error:'校验未通过，本次未入库。\n'+errors.join('\n')},422);
 if(!ready.length&&!results.length)return xjson({error:'汇总表没有填写数据。'},400);
 for(const {target,kind,template,rows,label,data} of ready){
  try{
   if(await opsCloudReportStatus(env,target,kind)){
    results.push({label,status:'skipped',message:'云端已同步，已跳过'});
    continue;
   }
   const csv=new TextEncoder().encode('\uFEFF'+opsReportCsv(rows));
   const result=await opsStoreReport(env,user,target,kind,target.platform+'-'+target.label+'-'+template.label+'（汇总拆分）.csv','text/csv; charset=utf-8',csv,data);
   results.push({label,...result,status:result.already_imported?'duplicate':result.status});
  }catch{results.push({label,status:'failed',message:'保存未完成，可再次提交此汇总表。'});}
 }
 return xjson({results});
}
