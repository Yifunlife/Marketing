// Guard at the deployed scheduler boundary, independently of collector internals.
async function runScheduledSourceOnce(env,source,task,now=Date.now()){
 const start=Math.floor((now+28800000)/86400000)*86400000-28800000;
 const success=await env.DB.prepare("SELECT 1 AS ok FROM sync_runs WHERE source=? AND status='succeeded' AND finished_at>=? AND finished_at<=? LIMIT 1").bind(source,start,now).first();
 if(success)return false;
 await task();
 return true;
}
async function scheduledCreatorsOnce(env){
 for(const target of Object.values(creatorTargets))await runScheduledSourceOnce(env,'xiaohongshu_creator_'+target.key,()=>scheduledCreatorSync(env,target));
}
