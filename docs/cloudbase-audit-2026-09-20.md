# CloudBase 实际环境核验

2026-09-20，经用户在 Codex 内置浏览器登录后，只读查看控制台；未创建、删除、升级、开启按量或部署任何资源。

- 环境：sichuantripmama-d8furc3w318e17b0，上海。
- 创建时间：2026-09-19 18:59:41。
- 免费体验版，有效期至 2027-03-19 23:59:59；不支持自动续费。
- 本周期 2026-09-19 至 2026-10-19，已用 14.06 / 3000 资源点；按量付费开关关闭。用量是核验时快照，并非未来用量保证。
- PostgreSQL 已启用；public 下有 memories、settings，memories 当前 3 条记录。控制台显示两表“无 RLS”；未更改策略，后续新应用使用独立表且必须明确数据库访问控制。
- 云函数 0 个，云托管 0 个。
- 静态托管约 5 MB；根目录已有 app.js、cloudbase-sdk.js、index.html，更新时间 2026-09-20 15:46；还有 .cloudbase-backup/、__auth/、cloud-admin/。应用部署列表为空并不代表托管文件为空。

## 结论与部署前工作

优先继续使用现有免费环境，无需为重写前端新建环境。保留旧表与文件；本轮不清理。

当前代码已新增 `cloudbase-postgres` 模式：状态保存在独立的 `moments_app_state` JSONB 表，并通过事务和行锁保证并发写入；媒体继续使用 CloudBase 私有存储。仍需在云托管中配置 `DATABASE_URL` 和服务端云密钥，并完成线上持久化验收；不能把文档数据库 API 与 PostgreSQL 接口混用。

当前 Next.js 含服务端 API，不能部署为纯静态文件。需确定云托管/云函数的运行方式与资源点消耗，完成账号、留言、媒体持久化线上验收后再切换入口。现有免费额度不能保证任意用量永久免费。

控制台：[套餐用量](https://tcb.cloud.tencent.com/dev?envId=sichuantripmama-d8furc3w318e17b0#/env/package-usage/basic)。
