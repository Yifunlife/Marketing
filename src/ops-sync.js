(()=>{
 const cards=document.querySelector('#cards'),global=document.querySelector('#global');
 const kinds={account:'账号概览',fans:'粉丝数据',works:'作品数据'};
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
 async function reports(id,list){
  const data=await request('/api/ops-sync/'+id+'/reports');
  list.replaceChildren();
  for(const report of data.reports){
   const item=el('li'),link=el('a',report.original_name);
   link.href='/api/ops-sync/'+id+'/reports?file='+encodeURIComponent(report.id);
   item.append(link,el('div',(kinds[report.report_kind]||'报表')+' · '+stamp(report.uploaded_at)+' · '+(report.status==='pending'?'已上传，待核对':'已处理'),'muted'));
   list.append(item);
  }
  if(!data.reports.length)list.append(el('li','尚未上传报表','muted'));
 }
 async function load(){
  try{
   const data=await request('/api/ops-sync');
   global.textContent='请先核对官方后台的账号名称，再选择对应账号卡片上传。';
   document.querySelector('#ads').textContent=data.ad_automatic?'广告费用继续通过已配置的广告API同步。':'广告费用使用独立的广告API接入。';
   for(const account of data.cards.filter(value=>value.platform==='抖音')){
    const box=el('section',undefined,'card');
    const heading=el('div',undefined,'account-head');
    heading.append(el('h2','抖音 · '+account.label));
    box.append(heading);
    const details=el('dl');
    for(const [label,value] of [['最近采集',stamp(account.last_at)],['数据截至',account.data_end||'尚未核实']])details.append(el('dt',label),el('dd',value));
    box.append(details);
    const open=el('a','打开官方后台 ↗','button');
    open.href='https://creator.douyin.com/creator-micro/home';
    open.target='_blank';open.rel='noopener noreferrer';
    heading.append(open);
    const form=el('form'),kind=el('select'),file=el('input');
    kind.setAttribute('aria-label',account.label+'报表类型');
    for(const [value,label] of Object.entries(kinds)){
     const option=el('option',label);option.value=value;kind.append(option);
    }
    file.type='file';file.accept='.csv,.xlsx,.xls';file.required=true;
    file.setAttribute('aria-label',account.label+'报表文件');
    const confirm=el('input');confirm.type='checkbox';confirm.required=true;
    const label=el('label',undefined,'confirm');label.append(confirm,document.createTextNode('我已确认文件来自'+account.label));
    const button=el('button','上传报表');button.type='submit';button.disabled=!data.can_operate;
    const message=el('p',undefined,'message');message.setAttribute('role','status');
    const list=el('ul',undefined,'reports');
    form.append(kind,file,label,button,message);
    form.onsubmit=async event=>{
     event.preventDefault();
     const selected=file.files[0];
     if(!selected||!confirm.checked)return;
     if(selected.size===0||selected.size>20*1024*1024){message.textContent='请选择小于20MB的报表。';return;}
     button.disabled=true;message.textContent='正在保存报表…';
     try{
      const result=await request('/api/ops-sync/'+account.id+'/reports?kind='+kind.value,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(selected.name)},body:selected});
      message.textContent=result.message;file.value='';confirm.checked=false;
      await reports(account.id,list);
     }catch(error){message.textContent=error.message;}
     finally{button.disabled=!data.can_operate;}
    };
    const history=el('details');
    history.append(el('summary','上传记录'),list);
    box.append(form,el('p','CSV / XLSX / XLS · 单份小于20MB · 上传后待核对','file-hint'),history);
    cards.append(box);
    reports(account.id,list).catch(error=>{list.textContent=error.message;});
   }
  }catch(error){global.textContent=error.message+'，请返回运营看板检查登录。';}
 }
 load();
})();
