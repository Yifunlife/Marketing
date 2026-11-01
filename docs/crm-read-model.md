# 业务CRM客户只读视图

运营系统通过 CRM_DB 绑定直接读取现有 yifun-crm-db；不复制客户、不创建客户、不写入业务CRM。客户ID沿用 crm_leads.id。页面 /#customers，接口 GET /api/crm/customers，主管理员正常登录后可读；其他角色未配置业务CRM账号范围前不开放全量客户资料。未登录由主鉴权拒绝，所有非GET请求拒绝。

## 21列合同

| 字段 | CRM来源 |
| --- | --- |
| 客户ID | crm_leads.id |
| 项目名称 | 最近更新的crm_sales_projects.name，或其关联crm_customer_projects.name；再取原始detail.项目名称。不把客户名或项目类型当项目名称 |
| 国家 | crm_leads.country |
| 联系人 | crm_leads.name |
| WhatsApp | crm_leads.phone，保留CRM原始联系方式，不推断WhatsApp是否可达 |
| Email | crm_leads.email |
| 客户来源 | crm_leads.source，原始渠道另行显示，不用导入方式覆盖获客来源 |
| 客户类型 | detail.客户类型，缺失留空，不将客户角色、新老客户或客户等级互换 |
| 客户等级 | crm_leads.grade |
| 当前阶段 | 最近销售项目stage，中文名称沿用CRM阶段字典；无项目阶段时只使用原始detail.当前阶段 |
| 项目状态 | project.details.project_status或原始detail.项目状态；不把跟进状态、预测分类当项目状态 |
| 初次联系 | CRM使用的首条非表单咨询/归属核正/系统导入/自动分配/系统收信的备注时间。不把录入时间当初次联系 |
| 最近联系 | crm_leads.last_contact |
| 下一步动作 | 最近销售项目next_action，或最近一条crm_notes.next_step |
| 下次联系 | 最近销售项目next_date，或crm_leads.next_date |
| 跟进状态 | crm_leads.status，原值保留 |
| 成交时间 | 未取消crm_deals最近deal_date。不根据“已成交”标签虚构成交单 |
| 预计金额 | 最近销售项目amount_minor / 100，附CRM币种；null保持未知，实际0保留 |
| 负责人 | crm_users.name，通过owner_id关联 |
| 丢单原因 | 最近销售项目loss_reason，或原始detail.丢单原因 |
| 备注 | 原始detail.备注，或CRM最近跟进备注 |

每客户一行，多项目时展示最近更新项目；不把多个项目金额擅自加总。查询确定排序、每页25条，搜索及筛选均绑定参数。页面每60秒更新，只在客户页可见时请求；失败保留上次数据显示过期提示。不将客户资料存widgetState、localStorage或Git。

## 来源与入口

正式列表排除channel精确等于“模拟流程演练”的3条源记录，不修改或删除CRM原记录。2026-11-01核实原始总数5514，正式5511。平台渠道来自source/channel；已有3400条保存ad_id，但当时与crm_meta_ad_daily无匹配，不能声称已知道具体账号。

只有ad_id在CRM广告日表唯一对应一个account_id时才关联crm_operation_accounts；多个广告账号共用相同ad_id时不归属。无匹配显示“账号待核实”。保留原始广告/活动/表单ID、名称、导入批次ID和文件名、原录入时间，点击客户ID可查看来源追溯。文件名、负责人和联系方式不能作为已确认来源账号的依据。

录入和维护统一在 https://yifun-crm.yifunlife.workers.dev/ 的客户管理中进行。运营看板只展示CRM数据，不能保证历史记录从未保存的账号标识自动补全。

## 列表展示（2026-11-01调整）

页面第一列优先显示CRM客户名字（crm_leads.name，沿用接口contact原值），点击名字打开资料与来源。客户ID移入详情，不在主列表显示内部form散列编号；接口仍保留原21字段，客户ID不改动。列表按20列展示，ID作为详情字段保留。公司名仅取原始detail.公司名称或company_name，标注“公司”；项目名仍取其独立字段，缺失不替代。
