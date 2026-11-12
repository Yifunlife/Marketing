const opsManualTargets={
 'instagram-garden':{platform:'Instagram',label:'乐园号',profile:'social'},
 'instagram-toy':{platform:'Instagram',label:'玩具号',profile:'social'},
 'instagram-factory':{platform:'Instagram',label:'工厂号',profile:'social'},
 'facebook-garden':{platform:'Facebook',label:'乐园号',profile:'social'},
 'facebook-toy':{platform:'Facebook',label:'玩具号',profile:'social'},
 'facebook-factory':{platform:'Facebook',label:'工厂号',profile:'social'},
 'youtube-play':{platform:'YouTube',label:'Yifunlife_play',profile:'social'},
 'youtube-technical':{platform:'YouTube',label:'Yifunlife_Technicalsupport',profile:'social'},
 'tiktok-garden':{platform:'TikTok',label:'乐园号',profile:'social'},
 'alibaba-channel':{platform:'阿里巴巴',label:'渠道汇总',profile:'alibaba'},
 'website-channel':{platform:'独立站',label:'渠道汇总',profile:'website'},
 'whatsapp-channel':{platform:'WhatsApp',label:'渠道汇总',profile:'whatsapp'}
};
const opsManualColumns={
 xhs:{总粉丝:'fans',发布量:'posts',曝光量:'impressions',观看量:'views',互动量:'interactions',收藏量:'collects',平台咨询数:'inquiries'},
 social:{总粉丝:'fans',发布量:'posts',曝光量:'impressions',播放量:'views',互动量:'interactions',链接点击:'clicks',平台咨询数:'inquiries'},
 alibaba:{访客数:'visitors',商品曝光量:'impressions',商品点击量:'clicks',询盘数:'inquiries'},
 website:{访客数:'visitors',访问次数:'visits',表单提交数:'submissions',WhatsApp点击数:'whatsapp_clicks'},
 whatsapp:{新增对话数:'conversations',已回复对话数:'replies',平台咨询数:'inquiries'},
 ads:{币种:'currency',广告花费:'spend',展现量:'impressions',点击量:'clicks',平台留资数:'leads'}
};
const opsManualCurrencies=['CNY','USD','EUR','GBP','CAD','AUD','HKD','SGD','JPY','AED','SAR','MYR','THB','IDR','PHP','VND','KRW','TWD','NZD','INR','MXN','BRL','ZAR','TRY','CHF','SEK','NOK','DKK','PLN','ILS','QAR','KWD'];
const opsReportTemplateInfo={
 account:{label:'账号概览',columns:['日期','总播放量','总点赞量','总评论量','总分享量','投稿量']},
 fans:{label:'粉丝数据',columns:['日期','总粉丝量','吸粉量','脱粉量']},
 works:{label:'作品数据',columns:['作品名称','作品ID','发布时间','播放量','点赞量','评论量','分享量','收藏量','封面链接','作品链接']},
 commerce:{label:'来客交易与核销日报',columns:['日期','支付金额（元）','核销金额（元）']},
 'platform-daily':{label:'平台经营日报'},
 advertising:{label:'广告效果日报',columns:['日期',...Object.keys(opsManualColumns.ads)]}
};
function opsReportTypes(target){
 if(target.xhs)return ['platform-daily','advertising'];
 if(target.profile)return target.profile==='social'?['platform-daily','advertising']:['platform-daily'];
 if(target.reportKey==='wechat-video')return ['account','works'];
 if(target.key==='supertada')return ['account','fans','works','commerce','advertising'];
 return ['account','fans','works','advertising'];
}
function opsReportTemplate(target,kind){
 if(!opsReportTypes(target).includes(kind))return null;
 if(target.reportKey==='wechat-video'){
  if(kind==='account')return {label:'每日视频趋势',columns:['时间','播放','评论','分享']};
  return {label:'视频动态明细',columns:['视频描述','视频ID','发布时间','播放量','点赞量','评论量','分享量','收藏量']};
 }
 const base=opsReportTemplateInfo[kind];
 return kind==='platform-daily'?{...base,columns:['日期',...Object.keys(opsManualColumns[target.xhs?'xhs':target.profile])]}:base;
}
function opsScopedTemplateRows(rows,id,kind){
 const i=rows.findIndex(row=>row.some(value=>String(value??'').trim()));
 const first=rows[i]||[];
 const marker=String(first[0]??'').replace(/^﻿/,'').trim();
 if(marker==='运营汇总模板')throw Error('这是一张汇总表，请使用「多个账号一起补报」上传。');
 if(marker!=='运营报表模板'){
  if(kind==='platform-daily'||kind==='advertising')throw Error('请使用该账号的下载模板，保留第一行账号和报表类型标识。');
  return rows;
 }
 if(String(first[1]??'').trim()!=='v1'||String(first[2]??'').trim()!==id||String(first[3]??'').trim()!==kind)throw Error('模板的平台、账号或报表类型与当前选择不符，请回到正确的账号上传。');
 const data=rows.slice(i+1);
 const header=data.findIndex(row=>row.some(value=>String(value??'').trim()));
 if(header<0)return data;
 const dateColumn=kind==='works'?data[header].indexOf('发布时间'):['日期','时间'].includes(String(data[header][0]).trim())?0:-1;
 if(dateColumn<0)return data;
 return data.map((row,index)=>{
  if(index<=header||!String(row[dateColumn]??'').trim())return row;
  const normalized=row.slice();
  normalized[dateColumn]=kind==='works'?opsNormalizeReportTime(row[dateColumn]):opsNormalizeReportDay(row[dateColumn]);
  return normalized;
 });
}
function opsNormalizeReportTime(raw){
 const value=String(raw??'').trim();
 if(/^\d{5}\.\d+$/.test(value)){
  const time=Date.UTC(1899,11,30)+Math.round(Number(value)*86400)*1000;
  return new Date(time).toISOString().slice(0,19).replace('T',' ');
 }
 const match=value.match(/^(.*?)\s+(\d{1,2}:\d{2})(:\d{2})?$/);
 return match?opsNormalizeReportDay(match[1])+' '+match[2].padStart(5,'0')+(match[3]||':00'):value;
}
function opsNormalizeReportDay(raw){
 const value=String(raw??'').trim();
 let day=value.replace(/[年月/.]/g,'-').replace(/日$/,'').replace(/-(\d)(?=-|$)/g,'-0$1');
 if(/^\d{5}$/.test(value))day=new Date(Date.UTC(1899,11,30)+Number(value)*86400000).toISOString().slice(0,10);
 return day;
}
function opsManualDay(raw,today){
 const day=opsNormalizeReportDay(raw);
 const time=Date.parse(day);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==day||day>=today)throw Error('请填写截至昨日的完整自然日，日期格式为 YYYY-MM-DD。');
 return day;
}
function opsParseManualDaily(rows,kind,target,today){
 const ads=kind==='advertising', fields=opsManualColumns[ads?'ads':target.xhs?'xhs':target.profile],prefix=ads?'manual_ad_':'manual_daily_';
 const first=rows.findIndex(row=>row.some(cell=>String(cell??'').trim()));
 if(first<0)throw Error('请填写日报后上传。');
 const header=Array.from(rows[first],value=>String(value??'').replace(/^\uFEFF/,'').trim());
 if(header[0]!=='日期'||header.some((field,i)=>i>0&&!Object.hasOwn(fields,field))||new Set(header).size!==header.length)throw Error('表头不符，请下载对应账号及报表类型的模板。');
 if(ads&&(!header.includes('币种')||!header.includes('广告花费')))throw Error('广告日报需要币种和广告花费两列。');
 const days=[],seen=new Set();
 for(const row of rows.slice(first+1)){
  if(!row.some(cell=>String(cell??'').trim()))continue;
  if(row.slice(header.length).some(cell=>String(cell??'').trim()))throw Error('报表含模板之外的数据列。');
  const date=opsManualDay(row[0],today);
  if(seen.has(date))throw Error(date+' 重复，请按账号逐日汇总。');
  seen.add(date);
  const metrics={};
  for(let i=1;i<header.length;i++){
   const key=fields[header[i]],raw=String(row[i]??'').trim();
   if(!raw)continue;
   let value;
   if(key==='currency'){
    value=opsManualCurrencies.indexOf(raw.toUpperCase());
    if(value<0)throw Error(date+' 的币种无法识别，请填写三字母币种代码。');
   }else{
    const pattern=key==='spend'?/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/:/^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
    if(!pattern.test(raw))throw Error(date+' 的'+header[i]+'格式有误。');
    const [whole,decimal='']=raw.replace(/,/g,'').split('.');
    value=key==='spend'?Number(whole)*100+Number(decimal.padEnd(2,'0')):Number(whole);
    if(!Number.isSafeInteger(value))throw Error(date+' 的'+header[i]+'超出读取范围。');
   }
   metrics[prefix+key]=value;
  }
  if(ads&&(metrics.manual_ad_currency===undefined||metrics.manual_ad_spend===undefined))throw Error(date+' 的币种或花费为空；实际零消耗才填 0。');
  if(!Object.keys(metrics).length)throw Error(date+' 没有填写任何实际指标。');
  days.push({date,metrics});
 }
 if(!days.length||days.length>1100)throw Error('请填写 1 至 1100 天数据。');
 return days.sort((a,b)=>a.date.localeCompare(b.date));
}
function opsManualSummary(rows){
 const days=new Map();
 for(const row of rows){
  const match=row.metric_key.match(/^manual_(daily|ad)_(.+)$/);
  if(!match)continue;
  const day=days.get(row.metric_date)||{date:row.metric_date,daily:{},ad:{}};
  const [,kind,key]=match;
  day.uploaded_at=Math.max(day.uploaded_at||0,row.report_uploaded_at||0);
  day[kind][key]=key==='currency'?opsManualCurrencies[row.metric_value]:row.metric_value;
  days.set(row.metric_date,day);
 }
 return [...days.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
async function opsManualSnapshots(env,user){
 const {results=[]}=await env.DB.prepare("SELECT account_key,metric_date,metric_key,metric_value,report_uploaded_at FROM douyin_daily_metrics WHERE metric_key GLOB 'manual_*' AND metric_date>=date('now','+8 hours','-60 days')").all();
 const groups=new Map();
 for(const row of results){
  if(!opsSyncAllowed(user,false,Object.hasOwn(opsManualTargets,row.account_key)?1:2))continue;
  if(!groups.has(row.account_key))groups.set(row.account_key,[]);
  groups.get(row.account_key).push(row);
 }
 return Object.fromEntries([...groups].map(([key,rows])=>[key,opsManualSummary(rows)]));
}

function opsReportCsv(rows){
 return rows.map(row=>Array.from(row,value=>{const cell=String(value??'');return /[,"\r\n]/.test(cell)?'"'+cell.replaceAll('"','""')+'"':cell;}).join(',')).join('\r\n')+'\r\n';
}
function opsDownloadReportCsv(name,rows){
 return new Response('\uFEFF'+opsReportCsv(rows),{headers:{...xhsHeaders,'Content-Type':'text/csv; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(name)}});
}
