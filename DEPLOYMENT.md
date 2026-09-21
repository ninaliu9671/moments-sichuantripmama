# MOMENTS 新版 CloudBase 部署

新版使用 CloudBase 静态托管、云函数、PostgreSQL REST API 和私有 PG 存储。目标环境是 `sichuantripmama-d8furc3w318e17b0`，云函数名为 `moments-v2`。正式同源入口是 [MOMENTS 四川之旅](https://sichuantripmama-d8furc3w318e17b0-1491690992.ap-shanghai.app.tcloudbase.com/)，由 HTTP 网关同时提供首页和 `/api`。旧版数据库、`media` 桶和静态文件都保留；新应用使用 `public.moments_app_state` 与私有 `moments` 桶。

## 已采用的服务端鉴权

云函数只使用一枚 CloudBase 服务端 API Key。它通过 PostgreSQL REST API 读写状态表，并为浏览器签发单个对象路径的一次性上传凭据。浏览器拿不到 API Key，不需要 CloudBase 自定义登录私钥，也不需要 PostgreSQL 直连账号。

云函数环境变量如下：

| 变量 | 值或用途 |
| --- | --- |
| `NODE_ENV` | `production` |
| `MOMENTS_STORAGE` | `cloudbase-postgres` |
| `CLOUDBASE_ENV_ID` | `sichuantripmama-d8furc3w318e17b0` |
| `MOMENTS_PUBLIC_URL` | `https://sichuantripmama-d8furc3w318e17b0-1491690992.ap-shanghai.app.tcloudbase.com` |
| `CLOUDBASE_APIKEY` | 服务端 API Key，只放在函数配置和管理员电脑的忽略目录 |
| `MOMENTS_SETUP_KEY` | 首位主人启用口令，只放在函数配置和管理员电脑的忽略目录 |

服务端 API Key 当前有效期为 180 天，到期前需要轮换。不要把它放进 Git、静态站点、日志或截图。旧 Key 已撤销。运行 `tcb fn detail --json` 会回显函数环境变量，排障时应先过滤密钥字段。
首位主人启用口令保存在本机 `app/.data-cloudbase-secrets/setup-key.txt`。注册主人时在“启用口令”栏输入它；注册完成后从函数环境变量移除口令。

## 数据准备

通过 CloudBase CLI 的 PostgreSQL 迁移执行 [app/sql/001_moments_pg.sql](app/sql/001_moments_pg.sql)。它创建受限状态表、私有 `moments` 桶、100 MiB 单文件限制和媒体 MIME 白名单。然后在 `app/` 目录设置 `CLOUDBASE_ENV_ID`、`CLOUDBASE_APIKEY` 并运行：

```powershell
node --import tsx scripts/moments-data.ts migrate
```

该命令只补建空白状态行并核验 REST 访问，不要求 `DATABASE_URL`。详细的数据导入和备份命令见 [docs/cloudbase-data-operations.md](docs/cloudbase-data-operations.md)。

## 构建与发布顺序

本机使用 Node.js 22 或更新版本：

```powershell
cd app
npm ci
npm run typecheck
npm test
npm run lint
npm run build:serverless
```

发布包位于被 Git 忽略的 `app/dist/serverless/`。密钥只注入这份本地发布包的函数环境配置，不写回跟踪的 `app/serverless/cloudbaserc.json`。

为避免新首页先出现而 API 尚不可用，按以下顺序发布：

1. 部署 `moments-v2` Event 云函数并验证 `/api/health`。函数构建为单文件 CommonJS，网关把 HTTP 请求转成事件。
2. 创建 `/api` 网关路由并验证状态读取和权限保护。
3. 上传静态文件并最后创建网关域名的 `/` 托管路由。

不要使用 `--prune`，不要删除旧版静态文件、数据库表或 `media` 桶。旧站点静态文件已备份到本机 `app/.data-legacy-static/`。

## 上线验收

1. 首页与 `/api/health` 均通过上述 HTTP 网关域名访问，健康响应包含 `ok: true` 与 `uploadTicket: true`。旧静态托管 CDN 域名会将页面跳转到正式入口；不要将它作为正式入口分享。
2. 由旅行主人本人尽快在正式入口注册首位账号；此账号会获得主人权限。刷新页面后账号和状态应仍存在。
3. 上传一张小图片，确认登记、私有签名读取和刷新后展示正常。
4. 验证邀请登录、动态、留言、反应和退出登录。
5. 用实际手机网络复测首页和图片上传。
6. 从管理员电脑生成并验证私人完整备份。

免费体验版资源点耗尽会停止访问，应定期查看用量和 `2027-03-19` 前的续期安排。
CloudBase 测试域名可能先显示“页面访问提示”，访问者需要自行点击“确定访问”。
