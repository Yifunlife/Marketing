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
  const snapshot=await opsReportSnapshot(target.key,env,null);
  return xjson({reports:rows.results||[],day,today:today.results||[],last_at:snapshot?.at||null,data_end:snapshot?.data_end||null});
 }
 if(req.method!=='POST')return xjson({error:'方法不支持'},405);
 if(req.headers.get('Origin')!==url.origin)return xjson({error:'请从运营看板上传报表'},403);
 const length=Number(req.headers.get('Content-Length'));
 if(!Number.isSafeInteger(length)||length<=0||length>20*1024*1024)return xjson({error:'单份报表应小于20MB'},413);
 const kind=url.searchParams.get('kind');
 if(!['account','fans','works'].includes(kind))return xjson({error:'请选择报表类型'},400);
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
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),value=>value.toString(16).padStart(2,'0')).join('');
 const existing=await env.DB.prepare('SELECT * FROM creator_report_uploads WHERE account_key=? AND report_kind=? AND sha256=?').bind(target.key,kind,sha256).first();
 if(existing){const result=await opsImportReport(existing,buffer,env);return xjson({id:existing.id,duplicate:true,...result});}
 const id=crypto.randomUUID(),key='private/creator-reports/douyin/'+target.key+'/'+kind+'/'+sha256;
 await env.BUCKET.put(key,buffer,{httpMetadata:{contentType:types[ext]}});
 await env.DB.prepare('INSERT OR IGNORE INTO creator_report_uploads (id,account_key,report_kind,sha256,object_key,original_name,content_type,size_bytes,uploaded_by,uploaded_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,target.key,kind,sha256,key,name,types[ext],length,user.id,Date.now(),'pending').run();
 const stored=await env.DB.prepare('SELECT * FROM creator_report_uploads WHERE account_key=? AND report_kind=? AND sha256=?').bind(target.key,kind,sha256).first();
 const result=await opsImportReport(stored,buffer,env);
 return xjson({id:stored.id,...result},201);
}
