(function opsControlClient(){
 const root=document.querySelector('main'),stage=document.querySelector('#stage');
 const image=document.querySelector('#screen'),status=document.querySelector('#status');
 const digits=document.querySelector('#digits'),fullscreen=document.querySelector('#fullscreen');
 const base=location.pathname.replace(/\/control$/,'');
 let busy=false,expired=false,pendingRefresh;

 function message(text){status.textContent=text;}

 function expire(text){
  expired=true;
  if(image.src.startsWith('blob:'))URL.revokeObjectURL(image.src);
  image.removeAttribute('src');
  image.hidden=true;
  digits.value='';
  for(const control of document.querySelectorAll('.tools input,.tools button'))control.disabled=true;
  message(text);
 }

 async function loadScreen(){
  try{
   const response=await fetch(base+'/screen');
   if(!response.ok){
    const data=await response.json();
    if(response.status===410){expire(data.error);return;}
    message(data.error||'窗口暂不可用');
    return;
   }
   const blob=await response.blob(),previous=image.src;
   image.src=URL.createObjectURL(blob);
   image.hidden=false;
   if(previous.startsWith('blob:'))URL.revokeObjectURL(previous);
   if(!previous)message('请在下方官方画面完成登录验证。');
  }catch{message('窗口暂时连接不上，请稍后刷新。');}
 }

 function refresh(){
  if(busy||expired||document.hidden||pendingRefresh)return;
  pendingRefresh=loadScreen().finally(()=>{pendingRefresh=null;});
  return pendingRefresh;
 }

 async function send(value){
  if(busy||expired)return;
  busy=true;
  root.setAttribute('aria-busy','true');
  message('正在操作官方登录页面…');
  try{
   await pendingRefresh;
   if(expired)return;
   const response=await fetch(base+'/input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
   const data=await response.json();
   if(response.status===410){expire(data.error);return;}
   if(!response.ok)throw Error(data.error||'操作未完成');
   if(value.kind==='digits')digits.value='';
   message(data.message||'操作已发送，请查看下方官方页面是否已更新。');
  }catch(error){message(error.message);}
  finally{busy=false;root.removeAttribute('aria-busy');await refresh();}
 }

 image.onclick=event=>{
  if(!image.complete||!image.naturalWidth)return;
  const rect=image.getBoundingClientRect();
  const scale=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
  const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  const x=(event.clientX-rect.left-(rect.width-width)/2)/width;
  const y=(event.clientY-rect.top-(rect.height-height)/2)/height;
  if(x>=0&&x<1&&y>=0&&y<1)void send({kind:'click',x,y});
 };

 function setFullscreen(active){
  stage.classList.toggle('fullscreen',active);
  fullscreen.setAttribute('aria-pressed',String(active));
  fullscreen.textContent=active?'退出全屏':'全屏显示';
 }
 fullscreen.onclick=()=>setFullscreen(!stage.classList.contains('fullscreen'));
 document.addEventListener('keydown',event=>{if(event.key==='Escape')setFullscreen(false);});

 for(const field of ['phone','code'])document.querySelector('#'+field).onclick=()=>{
  if(!/^\d{1,16}$/.test(digits.value)){message('请输入手机号或数字验证码。');return;}
  void send({kind:'digits',field,text:digits.value});
 };
 document.querySelector('#sms').onclick=()=>send({kind:'sms'});
 document.querySelectorAll('[data-key]').forEach(button=>{button.onclick=()=>send({kind:'key',key:button.dataset.key});});
 document.querySelector('#refresh').onclick=refresh;
 document.addEventListener('visibilitychange',refresh);
 window.addEventListener('pageshow',refresh);
 refresh();
 const timer=setInterval(refresh,4000);
 window.addEventListener('pagehide',event=>{if(!event.persisted)clearInterval(timer);});
})();
