# 亦玩集团运营智能体 / Marketing

生产架构：Cloudflare Workers 运行服务，D1 保存人员、授权凭证、报表及文件元数据，R2 保存图片、PDF及上传文件。页面脚本和样式使用 Workers Static Assets。

## 部署

```sh
npm install
npm run check
npm run build
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

配置以 `wrangler.jsonc` 为准。密钥通过 `wrangler secret put` 配置，不进入代码：`ADMIN_EMAIL`、`ADMIN_PASSWORD_HASH`、`XHS_CREDENTIAL_KEY`。迁移环境已设置对应密钥。不要更换加密密钥，否则已有小红书授权无法解密。

## 数据边界

- `users`：真实人员及密码哈希；`sessions`、`attempts`：临时登录数据。
- `xhs_settings`：AES-GCM 加密的小红书配置、凭证和聚合报表；`xhs_states`：10分钟一次性授权请求。
- `marketing_snapshot`：原系统核实过的内容快照，无图片或视频。
- `files`：仅文件元数据与R2对象路径，不保存文件内容或Base64。
- `sync_runs`：自动同步运行结果。
- `/api/files`：登录后上传和列表；`/api/files/:id`：鉴权下载，未授权用户不能读取。
- `/brand-logo.png`：从R2读取公开品牌Logo；历史示例PDF归档在私有R2对象中。
- 本地原视频目录继续只在本机读取，不会自动上传。

每天上海时间08:00检查、10:30读取昨日广告报表；08:00记录等待产出状态，不覆盖已有数据。官方离线数据最早次日10点产出；未提供指标为缺失，不当作0。广告数据不等于自然流量或CRM有效客户。小红书应用回调已更新为 `https://yifun-marketing.yifunlife.workers.dev/integrations/xiaohongshu/callback`。

## main 同步

生产源码保存在 `main`。完成修改后运行检查、构建，提交并推送 main，再执行部署；不要提交 `dist`、数据库导出、密钥、本地备份和 `asset-staging`。此仓库不保存原视频、图片或PDF文件。

## 当前生产环境

https://yifun-marketing.yifunlife.workers.dev

数据库：`yifun-marketing-db`；文件桶：`yifun-marketing-files`。原人员密码保持不变，新域名需重新登录。历史登录会话、登录失败计数和一次性授权请求不迁移。

### 乐园号创作后台采集

每日08:00由本机Codex定时任务读取Safari已登录的乐园号，导出四类逐日报表，经校验后将指标写入D1、原始xlsx写入私有R2。这与10:30聚光云端同步独立。必须保持电脑在线、应用运行和创作后台登录；非Cloudflare独立采集，尚无官方创作数据API接入。运行说明见 docs/creator-collection.md。首次采集已手动跑通，后续定时执行需持续观察。
