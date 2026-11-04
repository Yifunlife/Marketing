export function opsXmlText(value){
 return value.replace(/<[^>]*>/g,'').replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/gi,(_,hex,decimal,named)=>hex||decimal?String.fromCodePoint(parseInt(hex||decimal,hex?16:10)):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[named]));
}
export async function opsWorkbookRows(buffer,extension){
 if(extension==='xls')throw Error('旧版XLS暂不能自动读取，请从官方导出XLSX或CSV。');
 if(extension==='csv'){
  let text;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{text=new TextDecoder('gb18030').decode(buffer);}
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
   const char=text[i];
   if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
   else if(!quoted&&(char===','||char==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(char==='\n'){rows.push(row);row=[];}}
   else cell+=char;
  }
  if(quoted)throw Error('CSV引号不完整，请重新导出。');
  row.push(cell.replace(/\r$/,''));rows.push(row);
  return rows;
 }
 const {unzipSync,strFromU8}=await import('fflate');
 let expanded=0;
 const files=unzipSync(new Uint8Array(buffer),{filter:file=>{
  const needed=/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(file.name);
  if(needed){expanded+=file.originalSize;if(expanded>30*1024*1024)throw Error('报表展开后过大，请缩短统计日期再导出。');}
  return needed;
 }});
 const strings=[];
 if(files['xl/sharedStrings.xml']){
  const xml=strFromU8(files['xl/sharedStrings.xml']);
  for(const item of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g))strings.push(opsXmlText(item[1]));
 }
 const sheets=Object.keys(files).filter(name=>name.startsWith('xl/worksheets/'));
 if(sheets.length!==1)throw Error('请上传单个数据页的官方报表，多页文件需要另行核对。');
 const xml=strFromU8(files[sheets[0]]),rows=[];
 for(const match of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
  const row=[];
  for(const cell of match[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
   const ref=cell[1].match(/\br="([A-Z]+)\d+"/)?.[1];if(!ref)throw Error('报表单元格位置无效。');
   let col=0;for(const char of ref)col=col*26+char.charCodeAt(0)-64;
   if(col>256)throw Error('报表列数超过读取范围。');
   const value=cell[2]?.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1]||'';
   row[col-1]=/\bt="s"/.test(cell[1])?strings[Number(value)]||'':/\bt="inlineStr"/.test(cell[1])?opsXmlText(cell[2]||''):opsXmlText(value);
  }
  rows.push(row);
 }
 return rows;
}
export function opsParseDaily(rows,kind,today){
 const aliases={投稿量:'posts',总播放量:'plays',总点赞量:'likes',总评论量:'comments',总分享量:'shares',净增粉丝:'net_followers',粉丝净增:'net_followers',新增粉丝:'new_followers',取消关注:'lost_followers',流失粉丝:'lost_followers'};
 const headerIndex=rows.findIndex(row=>String(row[0]||'').replace(/^\uFEFF/,'').trim()==='日期');
 if(headerIndex<0)throw Error('未找到逐日“日期”表头，请上传数据中心导出的原始报表。');
 const header=rows[headerIndex].map(value=>String(value).trim()),columns=[];
 for(let i=0;i<header.length;i++)if(aliases[header[i]])columns.push([i,aliases[header[i]]]);
 if(!columns.length)throw Error('这份报表的指标表头尚未适配，原件已保留待核对。');
 const content=columns.some(([,metric])=>metric==='plays'||metric==='posts');
 if(kind==='fans'&&content||kind!=='fans'&&!content)throw Error('所选报表类型与文件指标不符，请选择正确类型。');
 const result=[],seen=new Set();
 for(const row of rows.slice(headerIndex+1)){
  if(row.every(value=>value===undefined||String(value).trim()===''))continue;
  const date=String(row[0]||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>=today)throw Error('报表日期无效或包含今日未完整数据，请导出截至昨日的逐日报表。');
  if(seen.has(date))throw Error('报表包含重复日期，请重新导出。');
  seen.add(date);
  const metrics={};
  for(const [index,key] of columns){
   const raw=String(row[index]??'').replace(/,/g,'').trim(),value=Number(raw);
   if(!raw||!Number.isSafeInteger(value)||(key!=='net_followers'&&value<0))throw Error(date+' 的指标为空或格式异常，未覆盖已有数据。');
   metrics[key]=value;
  }
  if(metrics.net_followers===undefined&&metrics.new_followers!==undefined&&metrics.lost_followers!==undefined)metrics.net_followers=metrics.new_followers-metrics.lost_followers;
  result.push({date,metrics});
 }
 if(!result.length||result.length>1100)throw Error('报表应包含1至1100天的数据。');
 return result.sort((a,b)=>a.date.localeCompare(b.date));
}
