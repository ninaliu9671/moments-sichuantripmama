# MOMENTS

新版是 Next.js 静态页面、CloudBase 云函数、PostgreSQL 和私有存储。产品变化见 [版本更新](../CHANGELOG.md)，部署步骤见仓库根目录的 [DEPLOYMENT.md](../DEPLOYMENT.md)，数据库迁移、预览导入和备份见 [cloudbase-data-operations.md](../docs/cloudbase-data-operations.md)。

本地开发在本目录运行 `npm ci`、`npm run dev`；发布前运行 `npm run typecheck`、`npm test`、`npm run lint` 和 `npm run build:serverless`。构建产物位于 Git 忽略的 `dist/serverless/`。
