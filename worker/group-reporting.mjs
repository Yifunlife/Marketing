// Private binding only. Never export credentials, sessions or files.
export class MarketingReporting extends WorkerEntrypoint {
 async fetch(req){
  if(req.method!=='GET'||new URL(req.url).pathname!=='/snapshot')return new Response(null,{status:404});
  const rows=[];const groupIds={garden:'8',factory:'7',toy:'9',supertada:'2'};const bindings={factory:'332719',garden:'136547',...await xget('advertiser_bindings',this.env)};
  const creators=await creatorReports(this.env);
  for(const [id,a] of Object.entries(creators)){
   if(id!==a.account_id)continue;
   const brand=Object.keys(groupIds).find(key=>creators[key]?.account_id===id);
   rows.push({group_account_id:groupIds[brand]||null,id:'xhs-creator:'+id,platform:'小红书',kind:'创作报表',name:a.display_name||a.name||id,fans:a.fans,fans_observed_at:a.observed_at,data_end:a.data_end,periods:{month:a.month,yesterday:a.yesterday},growth:a.growth});
  }
  for(const [key,platform] of [['reports','小红书'],['oe:reports','抖音']]){
   const r=await xget(key,this.env);
   for(const a of r?.accounts||[])rows.push({group_account_id:key==='oe:reports'?'4':groupIds[Object.keys(bindings).find(k=>String(bindings[k])===String(a.id))]||null,id:key+':'+String(a.id||a.local_account_id),platform,kind:'广告报表',name:a.name||String(a.id||a.local_account_id),periods:Object.fromEntries(Object.entries(a.periods||{}).map(([k,v])=>[k,{status:v.status,start:v.start,end:v.end,stale:!!v.stale,metrics:v.metrics,checked_at:v.checked_at}]))});
  }
  return Response.json({schemaVersion:1,accountLinksVersion:1,source:'yifun-marketing',generated_at:new Date().toISOString(),accounts:rows},{headers:{'Cache-Control':'no-store'}});
 }
}
