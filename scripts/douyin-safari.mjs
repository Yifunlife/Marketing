// Invoke only from the supported Computer Use node_repl with its sky client.
// Browser actions use native UI; filesystem access only observes downloaded files.
import fs from 'node:fs/promises';
const app='com.apple.Safari',downloads='/Users/markfang/Downloads';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const state=sky=>sky.get_app_state({app,disableDiff:true});
export function factoryIdentityMatches(text){return text.includes('亦玩游乐设备工厂')&&/抖音号[：:]\s*shanghaiyiwan(?:\s|$)/.test(text);}
async function until(sky,predicate,label,timeout=20000){
 const end=Date.now()+timeout;
 do{const s=await state(sky);if(predicate(s.text))return s;await pause(700);}while(Date.now()<end);
 throw Error(label+'未就绪，保留已有数据');
}
function index(text,re){const m=text.match(re);if(!m)throw Error('官方页面控件未找到');return Number(m[1]);}
async function newlyDownloaded(prefix,since){
 const end=Date.now()+12000;
 do{
  const matches=[];
  for(const name of (await fs.readdir(downloads)).filter(n=>n.startsWith(prefix)&&n.endsWith('.xlsx'))){const stat=await fs.stat(downloads+'/'+name);if(stat.mtimeMs>=since&&stat.size>0)matches.push({path:downloads+'/'+name,at:stat.mtimeMs});}
  if(matches.length)return matches.sort((a,b)=>b.at-a.at)[0].path;
  await pause(700);
 }while(Date.now()<end);
 throw Error('未取得刚导出的'+prefix+'报表');
}
export async function collectFactoryExports(sky){
 await state(sky);await sky.press_key({app,key:'super+t'});
 let s=await state(sky);
 await sky.set_value({app,element_index:index(s.text,/(\d+) 文本栏[^\n]*ID: WEB_BROWSER_ADDRESS_AND_SEARCH_FIELD/),value:'https://creator.douyin.com/creator-micro/home'});
 await sky.press_key({app,key:'Return'});
 s=await until(sky,t=>t.includes('抖音号')||t.includes('扫码登录')||t.includes('验证码登录'),'官方账号首页');
 if(!factoryIdentityMatches(s.text))throw Error('工厂号身份未核实：需要登录或当前为其他账号。不会导出或覆盖数据');
 const today=new Date(Date.now()+28800000).toISOString().slice(0,10),end=new Date(Date.parse(today)-86400000).toISOString().slice(0,10),start=new Date(Date.parse(end)-29*86400000).toISOString().slice(0,10);
 await sky.click({app,element_index:index(s.text,/(\d+) (?:\(selected\) )?数据中心\n/)});
 s=await until(sky,t=>[...t.matchAll(/\d+ 单选按钮 近30天/g)].length===2,'账号及粉丝日报');
 const files={account_key:'factory',identity:'shanghaiyiwan',data_end:end};
 for(const [kind,position,prefix] of [['account',0,'数据表现_短视频全量指标'],['fans',1,'数据表现_粉丝全量指标']]){
  s=await state(sky);const choices=[...s.text.matchAll(/(\d+) 单选按钮 近30天/g)];
  await sky.click({app,element_index:Number(choices[position][1])});
  s=await until(sky,t=>(t.match(new RegExp(start+' 至 '+end,'g'))||[]).length>=position+1,'截至昨日的近30天报表');
  // Selection changes can precede data. Re-read after the render settles.
  await pause(1200);s=await state(sky);
  const buttons=[...s.text.matchAll(/(\d+) 按钮 download_stroked 导出数据/g)];
  if(buttons.length!==2)throw Error('日报导出按钮格式变化');
  const before=Date.now();await sky.click({app,element_index:Number(buttons[position][1])});await state(sky);
  files[kind]=await newlyDownloaded(prefix,before);
 }
 s=await state(sky);await sky.click({app,element_index:index(s.text,/(\d+) (?:\(selected\) )?内容管理\n/)});
 s=await until(sky,t=>/按钮 作品 \(\d+\)/.test(t)&&/按钮 导出数据/.test(t),'作品列表');
 if(!s.text.includes('Value: 发布日期')||!s.text.includes('Value: 最新发布')||/文本栏[^\n]*Value:[^\n]*Placeholder: 搜索作品/.test(s.text))throw Error('作品列表存在筛选条件，停止导出，需核实范围');
 const before=Date.now();await sky.click({app,element_index:index(s.text,/(\d+) 按钮 导出数据\n/)});await state(sky);
 files.works=await newlyDownloaded('作品列表导出',before);
 return files;
}

export async function saveFactoryWorkCovers(sky,works){
 if(!Array.isArray(works)||works.length>10||!works.length)throw Error('只采集已核实排行榜前10名');
 const result=[];
 for(let i=0;i<works.length;i++){
  const work=works[i];let s=await state(sky);
  if(!s.text.includes('URL: creator.douyin.com/creator-micro/content/manage'))throw Error('不在官方作品列表');
  await sky.set_value({app,element_index:index(s.text,/(\d+) 文本栏 \(settable\)[^\n]*搜索作品/),value:work.title.slice(0,22)});
  await sky.press_key({app,key:'Return'});
  const minute=work.date.slice(0,16).replace('-','年').replace('-','月').replace(' ','日 ');
  await until(sky,t=>t.includes(work.title.trim())&&t.includes(minute),'标题与发布时间匹配');
  await pause(700);await sky.press_key({app,key:'super+s'});
  s=await state(sky);
  if(!s.text.includes('网页归档')||!s.text.includes('Value: 下载'))throw Error('请将 Safari 保存格式设为网页归档、位置设为下载；未保存错误格式');
  const name='douyin-factory-collection-'+String(i+1).padStart(2,'0')+'.webarchive';
  await sky.set_value({app,element_index:index(s.text,/(\d+) 文本栏[^\n]*ID: saveAsNameTextField/),value:name});
  await sky.click({app,element_index:index(s.text,/(\d+) 按钮 保存, ID: OKButton/)});await state(sky);
  result.push(downloads+'/'+name);
 }
 return result;
}
