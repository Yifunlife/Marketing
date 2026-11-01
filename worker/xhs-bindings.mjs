async function xhsBindingsApi(req,env,user){
 if(user.role!=='owner'||user.must_change)return xjson({error:'仅主管理员可配置'},403);
 const bindings=await xget('advertiser_bindings',env)||{};
 if(req.method==='GET')return xjson({bindings:{factory:'332719',garden:'136547',...bindings}});
 if(req.method!=='POST')return xjson({error:'Method not allowed'},405);
 const body=await req.json();if(body.target!=='toy'||!/^\d{1,20}$/.test(String(body.advertiser_id)))return xjson({error:'请选择玩具号已授权的广告账号'},400);
 const id=String(body.advertiser_id);if(id==='136547'||id==='332719'&&body.move_from!=='factory')return xjson({error:'该广告账号已属于工厂号或乐园号，不能重复记账'},409);
 const entries=await xhsTokens(env);const approved=entries.flatMap(e=>e.token.approval_advertisers||[]).some(a=>String(a.advertiser_id)===id);if(!approved)return xjson({error:'该广告账号尚未授权，请先完成聚光授权'},409);
 await xput('advertiser_bindings',{...bindings,...(id==='332719'?{factory:null}:{}),toy:id},env);return xjson({ok:true,message:'玩具号广告账号已绑定，请读取报表核对。'});
}
