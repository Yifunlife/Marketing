(function opsControlClient(){
 const root=document.querySelector('main'),image=document.querySelector('#screen'),status=document.querySelector('#status'),digits=document.querySelector('#digits');const base=location.pathname.replace(/\/control$/,'');let busy=false,timer;
 function message(text){status.textContent=text;}
 async function refresh(){if(busy)return;try{const r=await fetch(base+'/screen');if(!r.ok){const d=await r.json();message(d.error||'窗口暂不可用');return;}const blob=await r.blob(),old=image.src;image.src=URL.createObjectURL(blob);if(old.startsWith('blob:'))URL.revokeObjectURL(old);}catch{message('窗口暂时连接不上，请稍后刷新。');}}
 async function send(value){if(busy)return;busy=true;root.setAttribute('aria-busy','true');message('正在操作官方登录页面…');try{const r=await fetch(base+'/input',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}),d=await r.json();if(!r.ok)throw Error(d.error||'操作未完成');if(value.kind==='digits')digits.value='';message('操作已发送，请查看下方官方页面是否已更新。');}catch(e){message(e.message);}finally{busy=false;root.removeAttribute('aria-busy');await refresh();}}
 image.onclick=e=>{const rect=image.getBoundingClientRect();send({kind:'click',x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height});};
 document.querySelector('#type').onclick=()=>{if(!/^\d{1,16}$/.test(digits.value)){message('请输入手机号或数字验证码。');return;}send({kind:'digits',text:digits.value});};
 document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>send({kind:'key',key:b.dataset.key}));document.querySelector('#refresh').onclick=refresh;
 refresh();timer=setInterval(refresh,4000);window.addEventListener('pagehide',()=>clearInterval(timer));
})();
