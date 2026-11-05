// Read-only preparation of missing cover work. Uses project Cloudflare CLI auth,
// never browser cookies or passwords. Does not modify D1 or R2.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const option=name=>{const i=args.indexOf('--'+name);return i<0?null:args[i+1];};
const account=option('account'),output=option('output');
if(!['factory','garden','toy','supertada'].includes(account)||!output)throw Error('Provide account and output path');
const wrangler=process.env.WRANGLER_BIN||'/Applications/Yifun Workplace.app/Contents/Resources/dependencies/procurement/.pnpm/wrangler@4.131.0_@cloudflare+workers-types@5.20260910.1/node_modules/wrangler/bin/wrangler.js';
const quote=value=>typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const query=(sql,values)=>{
 if(!sql.startsWith('SELECT '))throw Error('Read-only queries required');
 let i=0;const statement=sql.replace(/\?/g,()=>quote(values[i++]));if(i!==values.length)throw Error('Binding mismatch');
 const result=execFileSync(process.execPath,[wrangler,'d1','execute','DB','--remote','--command',statement,'--json'],{cwd:root,env:process.env,encoding:'utf8',maxBuffer:8*1024*1024});
 return JSON.parse(result)[0].results;
};
const env={DB:{prepare:sql=>({bind:(...values)=>({first:async()=>query(sql,values)[0]||null,all:async()=>({results:query(sql,values)})})})}};
const c={Date,URL,Number,encodeURIComponent};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'worker/ops-content.mjs'),'utf8'),c);
const top=await c.opsContentSummary(account,env),missing=new Map();
for(const item of [...(top?.interval?.items||[]),...(top?.items||[])])if(!item.cover_url)missing.set(item.published_at+'|'+item.title,{title:item.title,date:item.published_at,plays:item.plays});
fs.writeFileSync(output,JSON.stringify([...missing.values()],null,2));
console.log(JSON.stringify({account,interval:top?.interval?{status:top.interval.status,start:top.interval.start,end:top.interval.end,compared:top.interval.compared}:null,missing_covers:missing.size,output}));
