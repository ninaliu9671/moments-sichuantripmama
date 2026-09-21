# MOMENTS 新版 CloudBase 部署

新版使用 CloudBase **静态托管 + 云函数 + PostgreSQL + 私有云存储**，目标环境 ID 是 `sichuantripmama-d8furc3w318e17b0`。构建和配置均以 `serverless` 分支为准。旧版数据库表和媒体不迁移；新版使用独立表和 `moments-v2` 云函数。静态站点发布到默认域名的 `/` 后会替换该域名显示的旧首页，因此发布前保留旧站点文件备份。

**先核实环境类型。**CloudBase 的 PostgreSQL 原生存储和 RLS 只在创建时选择 PG 模式的环境可用，传统模式环境不能原地升级。如果上述环境是传统模式，本部署包不能发布到旧环境，需要另一个 PG 模式环境并更新 `app/serverless/cloudbaserc.json` 的 `envId` 后重新构建。CloudBase 当前每个账号只允许 1 个免费环境；在保留旧环境且坚持零月费的条件下，是否有可用的第二个免费账号必须先核实，不能擅自删除旧环境或开通付费套餐。[环境类型说明](https://docs.cloudbase.net/quick-start/env-overview)、[免费额度](https://cloudbase.cloud.tencent.com/pricing)。

## 发布前

1. 在控制台确认环境是 **PG 模式**、仍是免费体验版、按量付费关闭、资源点尚有余量。不要开通云托管或升级付费套餐。
2. 按[数据操作说明](docs/cloudbase-data-operations.md)创建独立函数数据库账号，设置管理员终端的 `DATABASE_URL` 与 `MOMENTS_DB_APP_ROLE`，运行 `node --import tsx scripts/moments-data.ts migrate`。它执行[独立状态表迁移](app/sql/001_moments_pg.sql)，创建私有 `moments` 桶和上传 RLS，并给函数账号最小授权。数据库连接凭据只放管理员终端和云函数环境变量中。
3. 在控制台复核 `moments` 桶保持私有、匿名读写关闭，已启用自定义登录并下载与环境匹配的私钥。
4. 备份当前默认域名静态托管文件与路由配置，以便出现问题时恢复旧首页；不要删除旧版数据库表或媒体。

## 构建与部署

本机用 Node.js 22 或更新版本构建 Next.js；云函数运行时使用 CloudBase 当前稳定的 `Nodejs20.19`。两者版本不同是有意选择，云函数代码按 Node 20 打包。安装依赖后在项目中执行：

```powershell
cd app
npm ci
npm run typecheck
npm test
npm run build:serverless
```

`build:serverless` 把不含 API 路由和服务端模块的源码复制到临时目录后静态导出，再把云函数打包。整个发布包位于被 Git 忽略的 `app/dist/serverless/`，包含 `static/`、`functions/moments-v2/` 和 `cloudbaserc.json`。构建不移动原始 `app/api`，也不覆盖仓库里原有的 `functions/moments/bundle.mjs`。

先安装 [CloudBase CLI](https://docs.cloudbase.net/cli-v1/install) 3.8.2 或更新版本并登录，再对发布包执行声明式部署。此配置在同一默认域名上把 `/api` 路由到 `moments-v2` 云函数、`/` 路由到静态托管；`/api` 保留完整子路径供函数识别。先验证资源计划，检查它没有修改旧版数据库及其他路由，再执行发布：

```powershell
cd app/dist/serverless
tcb validate
tcb deploy --dry-run
tcb deploy
```

发布时**不要**使用 `--prune` 清理旧站点文件。CLI 配置不包含密码或密钥，重复发布不会从本地覆盖云函数的秘密环境变量；若 CLI 提示覆盖环境变量，先核对线上值并保留它们。[声明式部署说明](https://docs.cloudbase.net/cli-v1/declarative-deploy/deploy)、[网关路由配置](https://docs.cloudbase.net/cli-v1/gateway)。

## 云函数环境变量

在 CloudBase 控制台为 `moments-v2` 设置以下变量。`MOMENTS_PUBLIC_URL` 使用控制台给出的实际 HTTPS 默认域名；不得写入仓库、构建包、截图或日志。

| 变量 | 用途 |
| --- | --- |
| `NODE_ENV=production` | 启用安全 Cookie |
| `MOMENTS_STORAGE=cloudbase-postgres` | 使用 PostgreSQL 和云存储 |
| `CLOUDBASE_ENV_ID=sichuantripmama-d8furc3w318e17b0` | 指定环境 |
| `MOMENTS_PUBLIC_URL=https://<实际默认域名>` | 同源请求校验 |
| `DATABASE_URL` | PostgreSQL 服务端连接串 |
| `CLOUDBASE_APIKEY` | 私有云存储服务端 API Key；只存在云函数和管理员电脑 |
| `MOMENTS_CUSTOM_LOGIN_KEY` | CloudBase 自定义登录的 JSON 私钥，用于限定用户目录直传 |

`MOMENTS_DATABASE_POOL_SIZE` 默认为 5。首次部署后确认环境变量，再请求 `/api/health`。数据库凭据与 `CLOUDBASE_APIKEY` 需要有各自对应的权限，不能使用浏览器的 Publishable Key 代替服务端 Key。

## 上线验收

1. 用默认域名访问首页和 `/api/health`；确认 API、页面资源、登录 Cookie 均来自同一域名。
2. 导入本机预览数据，核对 2 条动态、3 个媒体文件、5 条留言及媒体哈希；使用临时预览账号验证照片、视频、语音、留言、直传和刷新后持久化。
3. 从管理员电脑生成并校验完整备份，不通过云函数响应传输大型归档。
4. 用妈妈实际使用的手机和网络测试页面与上传。默认域名可能显示提示中间页，也可能受访问限制，以实测结果为准。
5. 你确认预览后，先保留本机备份，再只清空新版预览账号与数据；旧版资源不参与清理。随后由你注册正式管理员账号并邀请家人。

免费体验版资源点用完会停止访问。上线后定期查看用量与续期时间，尤其留意视频带来的存储和流量消耗。[CloudBase 免费版规则](https://cloud.tencent.com/document/product/876/75213)。
