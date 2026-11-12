(()=>{
 const cards=document.querySelector('#cards'),global=document.querySelector('#global');
 const refreshers=[];
 const platformFilter=document.querySelector('#platform-filter'),accountFilter=document.querySelector('#account-filter');
 const stamp=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'尚未采集';
 function el(tag,text,cls){
  const element=document.createElement(tag);
  if(text!==undefined)element.textContent=text;
  if(cls)element.className=cls;
  return element;
 }
 async function request(url,options){
  const response=await fetch(url,options),data=await response.json();
  if(!response.ok)throw Error(data.error||'操作未完成');
  return data;
 }
 const reportStatus=status=>({pending:'已上传，待核对',imported:'读取成功',failed:'读取失败',rejected:'核对未通过'}[status]||'处理状态待确认');
 async function reports(id,list,daily,kinds,preview,applyCloud){
  const data=await request('/api/ops-sync/'+id+'/reports');
  const cloud=data.cloud_reports||{};
  applyCloud(cloud);
  const details=daily.previousElementSibling;
  const imported=(data.reports||[]).find(report=>report.status==='imported');
  if(data.last_at||(data.manual?.length&&imported)){details.querySelectorAll('dd')[0].textContent=stamp(data.last_at||imported.uploaded_at);details.querySelectorAll('dd')[1].textContent=data.data_end||data.manual?.[0]?.date||'尚未核实';}
  if(id==='douyin-supertada'){
   const info=details.querySelectorAll('dd')[2];
   info.textContent=data.commerce?data.commerce.data_end+' · 入库于 '+stamp(data.commerce.updated_at):'等待来客日报';
  }
  daily.replaceChildren();
  const current=(data.today||[]).filter(report=>Object.hasOwn(kinds,report.report_kind)&&!cloud[report.report_kind]);
  daily.append(el('strong',(data.day||'今日')+' · 已同步 '+(Object.keys(cloud).length+current.filter(report=>report.status==='imported').length)+'/'+Object.keys(kinds).length));
  const badges=el('div',undefined,'daily-badges');
  for(const [kind,label] of Object.entries(kinds)){
   const report=current.find(value=>value.report_kind===kind);
   const badge=el('span',label+' · '+(cloud[kind]?'云端已同步':report?reportStatus(report.status):'可补报'),'daily-badge');
   badge.dataset.state=cloud[kind]?'imported':report?.status||'missing';
   if(cloud[kind])badge.title='数据截至 '+cloud[kind];
   if(report)badge.title='上传于 '+stamp(report.uploaded_at)+(report.review_message?' · '+report.review_message:'');
   badges.append(badge);
  }
  daily.append(badges);
  for(const report of current.filter(value=>value.review_message&&value.status!=='imported'))daily.append(el('p',report.review_message,'review-message'));
  list.replaceChildren();
  for(const report of data.reports){
   const item=el('li'),link=el('a',report.original_name);
   link.href='/api/ops-sync/'+id+'/reports?file='+encodeURIComponent(report.id);
   item.append(link,el('div',(kinds[report.report_kind]||'报表')+' · '+stamp(report.uploaded_at)+' · '+reportStatus(report.status),'muted'));
   if(report.review_message)item.append(el('div',report.review_message,report.status==='imported'?'muted':'review-message'));
   list.append(item);
  }
  if(!data.reports.length)list.append(el('li','尚未上传报表','muted'));
  preview.replaceChildren();
  const labels={fans:'总粉丝',posts:'发布',views:'播放',impressions:'曝光',interactions:'互动',collects:'收藏',clicks:'点击',inquiries:'咨询／询盘',visitors:'访客',visits:'访问',submissions:'表单提交',whatsapp_clicks:'WhatsApp 点击',conversations:'新增对话',replies:'已回复对话',leads:'平台留资'};
  for(const day of (data.manual||[]).slice(0,3)){
   const metrics=Object.entries(day.daily).map(([key,n])=>(labels[key]||key)+' '+n.toLocaleString('zh-CN'));
   const ads=Object.entries(day.ad).filter(([key])=>!['spend','currency'].includes(key)).map(([key,n])=>(labels[key]||key)+' '+n.toLocaleString('zh-CN'));
   if(Number.isFinite(day.ad.spend))ads.unshift('花费 '+day.ad.currency+' '+(day.ad.spend/100).toFixed(2));
   preview.append(el('li',[day.date,metrics.join(' · '),ads.length?'广告 '+ads.join(' · '):''].filter(Boolean).join('　')));
  }
 }
 function notifyUpdate(){
  if(window.parent!==window)window.parent.postMessage({type:'douyin-reports-updated'},location.origin);
 }
 function setupBatch(accounts){
  if(!accounts.some(account=>account.can_upload))return;
  document.querySelector('#batch').hidden=false;
  const form=document.querySelector('#batch-form'),file=document.querySelector('#batch-file'),button=document.querySelector('#batch-upload');
  const status=document.querySelector('#batch-status'),list=document.querySelector('#batch-results');
  form.onsubmit=async event=>{
   event.preventDefault();
   const selected=file.files[0];
   if(!selected)return;
   if(!selected.size||selected.size>20*1024*1024){status.textContent='请选择小于20MB的汇总报表。';return;}
   button.disabled=true;status.textContent='正在检查各账号并导入…';list.replaceChildren();
   try{
    const format=selected.name.split('.').at(-1).toLowerCase();
    const data=await request('/api/ops-sync/batch/reports?format='+encodeURIComponent(format),{method:'POST',body:selected});
    const imported=data.results.filter(row=>row.status==='imported').length;
    const skipped=data.results.filter(row=>row.status==='skipped').length;
    const duplicates=data.results.filter(row=>row.status==='duplicate').length;
    const pending=data.results.length-imported-skipped-duplicates;
    status.textContent='已入库 '+imported+' 份 · 云端已同步，跳过 '+skipped+' 份'+(duplicates?' · 沿用原记录 '+duplicates+' 份':'')+(pending?' · 待处理 '+pending+' 份':'');
    for(const row of data.results)list.append(el('li',row.label+' · '+row.message,row.status==='failed'||row.status==='rejected'?'review-message':'muted'));
    if(!pending)file.value='';
    if(imported)notifyUpdate();
    for(const card of refreshers.filter(card=>!card.box.hidden))void card.update();
   }catch(error){status.textContent=error.message;}
   finally{button.disabled=false;}
  };
 }
 const availableMessage=count=>count?'请保留模板第一行的账号和报表类型标识。':'当前账号没有可查看的补报平台。';
 async function load(){
  try{
   const data=await request('/api/ops-sync');
   global.textContent=availableMessage(data.cards.length);
   const available=data.cards.filter(account=>account.report_types);
   setupBatch(available);
   const selectedId=location.hash.slice(1);
   const focused=available.find(account=>account.id===selectedId);
   for(const name of new Set(available.map(account=>account.platform))){
    const option=el('option',name);option.value=name;platformFilter.append(option);
   }
   if(focused)platformFilter.value=focused.platform;
   document.querySelector('#ads').textContent='每天上海时间 10:30、13:00、22:00 检查。云端已同步至昨日的报表会自动锁定。';
   for(const account of available){
    const kinds=account.report_types;
    const box=el('section',undefined,'card');
    box.id=account.id;box.hidden=true;
    const heading=el('div',undefined,'account-head');
    heading.append(el('h2',account.platform+' · '+account.label));
    box.append(heading);
    const details=el('dl');
    for(const [label,value] of [['最近采集',stamp(account.last_at)],['数据截至',account.data_end||'尚未核实']])details.append(el('dt',label),el('dd',value));
    if(account.identity)details.append(el('dt','抖音号'),el('dd',account.identity));
    if(account.id==='douyin-supertada')details.append(el('dt','交易数据截至'),el('dd','正在核对…'));
    const daily=el('div',undefined,'daily-status');
    daily.setAttribute('role','status');daily.textContent='正在检查今日上传…';
    box.append(details,daily);
    const open=el('a','打开官方后台 ↗','button');
    open.href=account.id==='wechat-video'?'https://channels.weixin.qq.com/':account.platform==='小红书'?'https://creator.xiaohongshu.com/':'https://creator.douyin.com/creator-micro/home';
    open.target='_blank';open.rel='noopener noreferrer';
    if(account.automatic)heading.append(el('span','云端采集 · 缺数据时补报','account-state'));
    if(!account.manual)heading.append(open);
    if(account.id==='douyin-supertada'){
     const commerce=el('a','打开抖音来客 ↗','button');
     commerce.href='https://life.douyin.com/';commerce.target='_blank';commerce.rel='noopener noreferrer';
     heading.append(commerce);
     box.append(el('p','交易报表请上传本账号或已核对门店范围的逐日汇总，包含日期、支付金额和核销金额（元）。','muted'));
    }
    const form=el('form'),kind=el('select'),file=el('input');
    kind.setAttribute('aria-label',account.label+'报表类型');
    if(account.id==='douyin-supertada'&&location.hash==='#douyin-supertada')kind.dataset.preferred='commerce';
    const templateBox=el('div',undefined,'template-actions'),template=el('a','下载所选模板 ↓','button'),hint=el('small',undefined,'muted template-hint');
    function selectTemplate(){
     template.href='/api/ops-sync/'+account.id+'/template?kind='+encodeURIComponent(kind.value);
     hint.textContent=kind.value==='advertising'?'按原币填，币种用 CNY、USD 等代码。':
      kind.value==='works'?'一行一条作品；视频 ID 列请设为文本。':
      kind.value==='commerce'?'一行一天，金额填元；不要填合计或订单明细。':
      kind.value==='platform-daily'?'一行一天，无法取得的指标留空。':'一行一天，保留实际日期。';
    }
    templateBox.append(template);
    file.type='file';file.accept='.csv,.xlsx';file.required=true;
    file.setAttribute('aria-label',account.label+'报表文件');
    const confirm=el('input');confirm.type='checkbox';confirm.required=true;
    const label=el('label',undefined,'confirm'),confirmation=document.createTextNode('');
    label.append(confirm,confirmation);
    function resetUpload(){
     file.value='';confirm.checked=false;
     confirmation.textContent='确认上传至 '+account.platform+' / '+account.label+' / '+kinds[kind.value];
    }
    kind.addEventListener('change',()=>{selectTemplate();resetUpload();});
    const button=el('button','上传报表');button.type='submit';button.disabled=!account.can_upload;
    const message=el('p',undefined,'message');message.setAttribute('role','status');
    const list=el('ul',undefined,'reports'),preview=el('ul',undefined,'preview');
    form.append(kind,templateBox,file,button,label,hint,message);
    const complete=el('p','云端已同步，今天无需补传。','account-state');
    let currentOptions;
    function applyCloud(cloud){
     const entries=Object.entries(kinds).filter(([value])=>!cloud[value]);
     const signature=entries.map(([value])=>value).join(',');
     if(signature===currentOptions)return;
     currentOptions=signature;
     const previous=kind.value||kind.dataset.preferred;
     kind.replaceChildren();
     for(const [value,label] of entries){
      const option=el('option',label);option.value=value;kind.append(option);
     }
     if(entries.some(([value])=>value===previous))kind.value=previous;
     form.hidden=!entries.length;
     complete.hidden=!!entries.length;
     selectTemplate();resetUpload();
    }
    applyCloud(account.cloud_reports||{});
    form.onsubmit=async event=>{
     event.preventDefault();
     const selected=file.files[0];
     if(!selected||!confirm.checked)return;
     if(selected.size===0||selected.size>20*1024*1024){message.textContent='请选择小于20MB的报表。';return;}
     button.disabled=true;message.textContent='正在保存报表…';
     try{
      const result=await request('/api/ops-sync/'+account.id+'/reports?kind='+kind.value,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(selected.name)},body:selected});
      message.textContent=result.message;file.value='';confirm.checked=false;
      if(result.status==='imported')notifyUpdate();
      await update();
     }catch(error){message.textContent=error.message;await update();}
     finally{button.disabled=!account.can_upload;}
    };
    const history=el('details');
    history.append(el('summary','上传记录'),list);
    box.append(form,complete,preview,el('p','CSV / XLSX · 单份小于20MB · 上传后自动读取','file-hint'),history);
    cards.append(box);
    if(!account.can_upload)form.querySelectorAll('input').forEach(input=>input.disabled=true);
    const update=()=>reports(account.id,list,daily,kinds,preview,applyCloud).catch(error=>{daily.textContent='今日上传状态暂不可用';list.textContent=error.message;});
    refreshers.push({box,update,resetUpload});
   }
   function showAccount(){
    for(const card of refreshers){
     const hidden=card.box.id!==accountFilter.value;
     if(hidden&&!card.box.hidden)card.resetUpload();
     card.box.hidden=hidden;
     if(!hidden)void card.update();
    }
   }
   function showPlatform(accountId){
    accountFilter.replaceChildren();
    for(const account of available.filter(account=>account.platform===platformFilter.value)){
     const option=el('option',account.label);option.value=account.id;accountFilter.append(option);
    }
    if(accountId)accountFilter.value=accountId;
    document.querySelector('#export-guide').hidden=platformFilter.value!=='抖音';
    showAccount();
   }
   platformFilter.addEventListener('change',()=>showPlatform());
   accountFilter.addEventListener('change',showAccount);
   showPlatform(focused?.id);
  }catch(error){global.textContent=error.message+'，请返回运营看板检查登录。';}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshers.filter(card=>!card.box.hidden).forEach(card=>card.update());});
 setInterval(()=>{if(!document.hidden)refreshers.filter(card=>!card.box.hidden).forEach(card=>card.update());},60000);
 load();
})();
