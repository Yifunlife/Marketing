// Import exports obtained through the official browser UI, using the same
// validation/import functions as the upload page. No browser profile is read.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {opsWorkbookRows,opsParseDaily} from '../worker/ops-report-parser.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),apply=args.includes('--apply');
const option=name=>{const i=args.indexOf('--'+name);return i<0?null:args[i+1];};
const account=option('account'),identity=option('identity');
const identities={factory:'shanghaiyiwan',garden:'f09530',toy:'85639035334'};
if(!identities[account]||identity!==identities[account])throw Error('Provide the account identity verified in the official browser UI');
const now=Date.now(),today=new Date(now+28800000).toISOString().slice(0,10),yesterday=new Date(Date.parse(today)-86400000).toISOString().slice(0,10);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const files=[];
for(const kind of ['account','fans','works']){
 const filename=option(kind+'-report');if(!filename)throw Error('Missing '+kind+' report');
 const bytes=fs.readFileSync(filename),stat=fs.statSync(filename),rows=await opsWorkbookRows(bytes,path.extname(filename).slice(1));
 if(Math.abs(now-stat.mtimeMs)>7200000)throw Error('Export must be downloaded freshly through the official UI');
 if(kind!=='works'){
  const days=opsParseDaily(rows,kind,today);
  if(days.length!==30||days.at(-1).date!==yesterday||days.some((d,i)=>Date.parse(d.date)!==Date.parse(yesterday)-(29-i)*86400000))throw Error('Expected the latest 30 daily records through yesterday');
 }
 const hash=sha(bytes);
 files.push({kind,filename,bytes,hash,rows,at:Math.floor(stat.mtimeMs),object_key:`private/creator-reports/douyin/${account}/${kind}/${hash}`});
}
const workRows=files.find(f=>f.kind==='works').rows,hi=workRows.findIndex(r=>r.includes('作品名称')&&r.includes('发布时间'));
if(hi<0)throw Error('Missing works headers');
const columns=Object.fromEntries(workRows[hi].map((name,i)=>[name,i]));
const works=workRows.slice(hi+1).filter(r=>r[columns['作品名称']]).map(r=>({title:String(r[columns['作品名称']]).trim(),date:String(r[columns['发布时间']]).trim(),plays:Number(r[columns['播放量']])}));
const covers=option('covers')?JSON.parse(fs.readFileSync(option('covers'),'utf8')):[];
for(const c of covers){
 if(works.filter(w=>w.date+'|'+w.title===c.item_key&&w.title===c.title&&w.date===c.published_at).length!==1)throw Error('Cover does not match exactly one exported work');
 const bytes=fs.readFileSync(c.path);
 const valid=(c.content_type==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')||(c.content_type==='image/png'&&bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))||(c.content_type==='image/jpeg'&&bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')));
 if(!valid||bytes.length>2*1024*1024||sha(bytes)!==c.sha256||c.source!=='https://creator.douyin.com/creator-micro/content/manage')throw Error('Invalid cover asset');
 c.object_key=`private/creator-covers/douyin/${account}/${c.sha256}`;
}
const wrangler=process.env.WRANGLER_BIN||'/Applications/Yifun Workplace.app/Contents/Resources/dependencies/procurement/.pnpm/wrangler@4.131.0_@cloudflare+workers-types@5.20260910.1/node_modules/wrangler/bin/wrangler.js';
const run=(...params)=>execFileSync(process.execPath,[wrangler,...params],{cwd:root,env:process.env,encoding:'utf8',maxBuffer:8*1024*1024});
const query=sql=>JSON.parse(run('d1','execute','DB','--remote','--command',sql,'--json'))[0].results;
const quote=value=>value===null?'NULL':typeof value==='number'?(Number.isFinite(value)?String(value):(()=>{throw Error('Invalid number');})()):"'"+String(value).replaceAll("'","''")+"'";
const sql=[];
const statements={prepare:query=>({bind(...values){return {query,values,first:async()=>({account_key:account}),run:async()=>{sql.push({query,values});}};}}),batch:async list=>sql.push(...list)};
const context={Date,URL,Number,opsWorkbookRows,opsParseDaily,opsSyncTargets:{},DB:statements};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'worker/ops-content.mjs'),'utf8')+'\n'+fs.readFileSync(path.join(root,'worker/ops-report-import.mjs'),'utf8'),context);
const existing=apply?query('SELECT id,report_kind,sha256,uploaded_at FROM creator_report_uploads WHERE account_key='+quote(account)):[];
const sources=apply?query('SELECT sha256,account_key FROM creator_report_sources'):[];
for(const f of files){
 if(sources.some(s=>s.sha256===f.hash&&s.account_key!==account))throw Error('This file was verified as belonging to a different account');
 const old=existing.find(r=>r.report_kind===f.kind&&r.sha256===f.hash);
 const row={id:old?.id||`douyin-${account}-${f.kind}-${f.hash}`,account_key:account,report_kind:f.kind,original_name:path.basename(f.filename),sha256:f.hash,uploaded_at:old?.uploaded_at||f.at};
 sql.push({query:'INSERT OR IGNORE INTO creator_report_uploads(id,account_key,report_kind,sha256,object_key,original_name,content_type,size_bytes,uploaded_by,uploaded_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',values:[row.id,account,f.kind,f.hash,f.object_key,row.original_name,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',f.bytes.length,'master',row.uploaded_at,'pending']});
 sql.push({query:'INSERT OR IGNORE INTO creator_report_sources(sha256,account_key,evidence) VALUES(?,?,?)',values:[f.hash,account,`${today} Safari official UI export; verified Douyin identity ${identity}`]});
 const result=await context.opsImportReport(row,f.bytes,{DB:statements});
 if(result.status!=='imported')throw Error(result.message);
}
for(const c of covers)sql.push({query:'INSERT INTO creator_content_covers(account_key,item_key,object_key,content_type,sha256,observed_at,source) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_key,item_key) DO UPDATE SET object_key=excluded.object_key,content_type=excluded.content_type,sha256=excluded.sha256,observed_at=excluded.observed_at,source=excluded.source WHERE excluded.observed_at>=creator_content_covers.observed_at',values:[account,c.item_key,c.object_key,c.content_type,c.sha256,c.observed_at,c.source]});
const summary={account,identity,data_end:yesterday,works:works.length,covers:covers.length,mode:apply?'applied':'validated only'};
if(apply){
 for(const f of files)run('r2','object','put','yifun-marketing-files/'+f.object_key,'--file',f.filename,'--content-type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','--remote');
 for(const c of covers)run('r2','object','put','yifun-marketing-files/'+c.object_key,'--file',c.path,'--content-type',c.content_type,'--remote');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'douyin-import-')),file=path.join(temp,'import.sql');
 try{fs.writeFileSync(file,sql.map(({query,values})=>{let i=0;const statement=query.replace(/\?/g,()=>quote(values[i++]));if(i!==values.length)throw Error('SQL binding mismatch');return statement+';';}).join('\n'));run('d1','execute','DB','--remote','--file',file);}
 finally{fs.rmSync(temp,{recursive:true,force:true});}
}
console.log(JSON.stringify(summary));
