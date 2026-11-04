// Optional, public page DOM only. A note failure must not erase account reports.
async function creatorCollectNotes(page,env,target,accountId,now){
 try{
  await page.goto('https://creator.xiaohongshu.com/statistics/data-analysis',{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>document.querySelectorAll('table tbody tr').length>0,{timeout:10000});
  const raw=await page.evaluate(()=>Array.from(document.querySelectorAll('table')).map(table=>({headers:Array.from(table.querySelectorAll('thead th')).map(e=>e.innerText.trim()),rows:Array.from(table.querySelectorAll('tbody tr')).map(tr=>({cells:Array.from(tr.querySelectorAll('td')).map(td=>td.innerText.trim()),cover:(()=>{const cell=tr.querySelector('td');if(!cell)return null;const img=cell.querySelector('img');const direct=img?.currentSrc||img?.getAttribute('data-src')||img?.src;if(direct&&!direct.startsWith('data:'))return direct;for(const e of [cell,...cell.querySelectorAll('*')]){const bg=getComputedStyle(e).backgroundImage;const m=bg.match(/^url\(["']?(.*?)["']?\)$/);if(m&&m[1])return m[1];}return null;})(),url:Array.from(tr.querySelectorAll('a[href]')).map(a=>a.href).find(h=>h.includes('/explore/'))||null}))})));
  const snapshot=creatorNotesSnapshot(raw,now);
  const range=await page.evaluate(()=>Array.from(document.querySelectorAll('input')).map(e=>e.value).filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)).slice(0,2));
  snapshot.scope='内容分析页；'+(range.length===2?'笔记发布时间筛选 '+range.join(' 至 ')+'；':'')+'本页已读取'+snapshot.count+'条，按累计观看量排序。仅覆盖当前页与筛选范围，不代表全账号或每日新增排名。';
  const object='creator/'+accountId+'/notes/'+now+'.json';
  await env.BUCKET.put(object,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}});
  await xput('creator:notes:'+accountId,{...snapshot,source_object:object,account_id:accountId},env);
  await xput('creator:notes-status:'+accountId,{at:now,status:'ok'},env);
 }catch{await xput('creator:notes-status:'+accountId,{at:now,status:'pending',message:'笔记明细尚未完成读取，保留原有快照；账号汇总继续同步。'},env);}
}
function creatorNotesSnapshot(tables,now){
 const table=tables.find(t=>(t.headers.includes('笔记')||t.headers.includes('笔记基础信息'))&&(t.headers.includes('观看')||t.headers.includes('观看量')));
 if(!table)throw Error('notes_schema_unrecognized');
 const at=name=>table.headers.indexOf(name),number=value=>{const s=String(value??'').replaceAll(',','').trim();return /^\d+$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s):null;};
 const items=table.rows.map(row=>{const base=row.cells[at('笔记基础信息')>=0?at('笔记基础信息'):at('笔记')]||'',title=base.split(/\n?发布于/)[0].trim();if(!title)throw Error('notes_title_missing');const item={title,published_at:row.cells[at('发布时间')]||base.match(/发布于\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/)?.[1]||null};for(const [key,names] of Object.entries({views:['观看','观看量'],impressions:['曝光','曝光量'],likes:['点赞','点赞量'],comments:['评论','评论量'],collects:['收藏','收藏量'],shares:['分享','分享量'],followers:['涨粉','涨粉量']})){const name=names.find(n=>at(n)>=0);item[key]=name?number(row.cells[at(name)]):null;}const allowed=(value,hosts)=>{try{const u=new URL(value);return u.protocol==='https:'&&hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))?u.href:null;}catch{return null;}};item.cover_url=allowed(row.cover,['xhscdn.com','xiaohongshu.com']);item.item_url=allowed(row.url,['xiaohongshu.com']);return item;}).filter(item=>Number.isFinite(item.views));
 if(!items.length)throw Error('notes_metrics_unavailable');
 return {at:now,items:items.sort((a,b)=>b.views-a.views).slice(0,10),count:items.length,scope:'仅覆盖采集时笔记数据页当前表格，共'+items.length+'条；按页面显示观看量排序，非全账号或每日新增排名。'};
}
