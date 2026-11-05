async function opsImportContent(row,rows,env){
 const index=rows.findIndex(cells=>cells.includes('作品名称')&&cells.includes('发布时间'));
 if(index<0)throw Error('未找到作品名称和发布时间，当前支持官方“作品列表导出”报表。');
 const header=rows[index],column=Object.fromEntries(header.map((name,i)=>[name,i])),items=[],seen=new Set();
 for(const cells of rows.slice(index+1)){
  const title=String(cells[column['作品名称']]||'').trim(),date=String(cells[column['发布时间']]||'').trim();
  if(!title&&!date)continue;
  if(!title||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date))throw Error('作品标题或发布时间不完整，未更新排行榜。');
  const key=String(cells[column['作品ID']]||date+'|'+title);
  if(seen.has(key))throw Error('作品标题与发布时间重复，需要作品ID才能区分。');
  seen.add(key);
  const allowed=(value,hosts)=>{try{const url=new URL(value);return url.protocol==='https:'&&hosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host))?url.href:null;}catch{return null;}};
  const item={key,title,date,cover:allowed(cells[column['封面链接']],['douyinpic.com','xhscdn.com','xiaohongshu.com']),url:allowed(cells[column['作品链接']],['douyin.com','xiaohongshu.com'])};
  for(const [name,metric] of [['播放量','plays'],['点赞量','likes'],['评论量','comments'],['分享量','shares'],['收藏量','collects'],['粉丝增量','followers']]){
   const raw=cells[column[name]];
   if(raw===undefined||raw==='-'||raw==='')item[metric]=null;
   else {const value=Number(raw);if(!Number.isSafeInteger(value)||value<0)throw Error('作品指标格式异常。');item[metric]=value;}
  }
  const completion=Number(cells[column['完播率']]);
  item.completion=Number.isFinite(completion)&&completion>=0&&completion<=1?completion:null;
  items.push(item);
 }
 if(!items.length||items.length>5000)throw Error('作品明细应包含1至5000条记录。');
 const statements=[];
 for(let i=0;i<items.length;i+=5){
  const chunk=items.slice(i,i+5);
  statements.push(env.DB.prepare('INSERT OR REPLACE INTO creator_content_items(report_id,account_key,item_key,title,published_at,plays,likes,comments,shares,collects,followers,completion,cover_url,item_url) VALUES '+chunk.map(()=>'(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',')).bind(...chunk.flatMap(item=>[row.id,row.account_key,item.key,item.title,item.date,item.plays,item.likes,item.comments,item.shares,item.collects,item.followers,item.completion,item.cover,item.url])));
 }
 const message='已读取'+items.length+'条作品累计表现，排名仅覆盖本文件；不是每日新增排名。';
 statements.push(env.DB.prepare('UPDATE creator_report_uploads SET status=?,review_message=? WHERE id=?').bind('imported',message,row.id));
 await env.DB.batch(statements);
 return {status:'imported',message};
}
async function opsContentSummary(key,env){
 const latest=await env.DB.prepare("SELECT id,uploaded_at,review_message FROM creator_report_uploads WHERE account_key=? AND report_kind='works' AND status='imported' ORDER BY uploaded_at DESC LIMIT 1").bind(key).first();
 if(!latest)return null;
 const items=(await env.DB.prepare('SELECT i.title,i.published_at,i.plays,i.likes,i.comments,i.shares,i.collects,i.followers,i.completion,i.cover_url,i.item_url,c.sha256 AS cover_sha256,c.observed_at AS cover_observed_at FROM creator_content_items i LEFT JOIN creator_content_covers c ON c.account_key=i.account_key AND c.item_key=i.item_key WHERE i.account_key=? AND i.report_id=? ORDER BY i.plays DESC,i.published_at DESC LIMIT 10').bind(key,latest.id).all()).results||[];
 for(const item of items)if(item.cover_sha256)item.cover_url='/api/ops-sync/douyin-'+encodeURIComponent(key)+'/covers?sha='+item.cover_sha256;
 return {at:latest.uploaded_at,scope:latest.review_message,items};
}

async function opsContentCover(req,env,target){
 if(req.method!=='GET')return xjson({error:'方法不支持'},405);
 const sha=new URL(req.url).searchParams.get('sha');
 if(!/^[a-f0-9]{64}$/.test(sha||''))return xjson({error:'封面不存在'},404);
 const row=await env.DB.prepare('SELECT object_key,content_type FROM creator_content_covers WHERE account_key=? AND sha256=? LIMIT 1').bind(target.key,sha).first();
 if(!row)return xjson({error:'封面不存在'},404);
 const object=await env.BUCKET.get(row.object_key);
 if(!object)return xjson({error:'封面暂不可用'},404);
 return new Response(object.body,{headers:{...xhsHeaders,'Content-Type':row.content_type,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
