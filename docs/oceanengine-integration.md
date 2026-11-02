# 乐园号本地推 API 接入进度（2026-11-02）

应用 yifunlife-ben-ditui-leads，App ID 1876027941412073 已上线。
现有授权管理账号：来客 7659981470752180243 上海·亦玩集团(总部)；工作台 1869959148397577 上海亦玩游乐设备集团有限公司。
以上不是已核实的本地推投放账户，不得直接绑定或计费。

已部署 /integrations/oceanengine 与浏览器绑定、单次使用的授权回调，现有应用密钥已通过管理员页面加密保存。密钥与凭证不返回前端。
旧回调 https://www.yifunlife.com/oceanengine/callback 实测 GET/HEAD 均为404。
新回调 https://yifun-marketing.yifunlife.workers.dev/integrations/oceanengine/callback 已部署。巨量后台修改弹窗已填入，尚未提交，需要确认更改凭证接收地址。

尚未收到云端授权，未读取真实广告费、未启用自动刷新/定时广告采集、未接入看板广告汇总。下一步授权完成后，查询授权账户及工作台下本地推投放账户、核实乐园号归属，实测 /open_api/v3.0/local/report/account/get/ 的 stat_cost 与后台口径，然后实现凭证刷新、幂等逐日保存和汇总。不要把来客ID/工作台ID直接代入 local_account_id；不要把广告授权误称为自然运营数据已接通。

官方文档： https://open.oceanengine.com/docs/1819564415845708
官方 SDK： https://github.com/oceanengine/ad_open_sdk_java （2026-10-29版本验证授权请求字段app_id/secret/auth_code，已授权账户ID优先使用account_string_id避免精度丢失）。

58项测试通过，部署版本 e7764953-523f-4426-81bc-f9fbb1de530b。
