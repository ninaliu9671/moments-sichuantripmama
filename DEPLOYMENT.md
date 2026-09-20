# MOMENTS 四川之旅部署

代码已准备好推送到 GitHub，再部署到 CloudBase。GitHub 私有仓库已创建；本项目尚未绑定 CloudBase 环境。账号中已有一个由旧版 Work Buddy 项目使用过的环境 `sichuantripmama-d8furc3w318e17b0`，优先核验并复用该环境，避免重复创建环境或误升级套餐。

## CloudBase

2026-09-20 已在真实控制台核验：现有环境是上海区域的免费体验版，到期 2027-03-19 23:59:59；当前周期已用 14.06/3000 资源点，按量付费关闭。旧网站静态文件及 PostgreSQL 表仍在，云函数/云托管各 0 个。详见 [环境核验](docs/cloudbase-audit-2026-09-20.md)。

代码已支持现有 PostgreSQL：业务状态写入独立表 `moments_app_state`，每次修改使用数据库事务和行锁串行化；媒体原文件继续写入 CloudBase 私有存储。首次成功连接时应用会自动创建该表，不会修改旧版 `memories`、`settings` 表。

### 复用已有环境

在 CloudBase 控制台的“环境”和“套餐用量”页面确认以下信息，再填写环境变量并部署：

- 环境 ID、环境状态、地域、套餐名称和到期时间。
- 当前环境是否仍为免费体验环境，是否开启了超限按量或其他付费能力。
- 云托管或其他 Node 服务能力是否可用，能否运行 Node.js 22 和本项目的 Dockerfile。
- 数据库中是否已有 `moments_state` 集合及 `sichuan-2026` 文档，云存储中是否已有 `moments/` 前缀。若旧应用使用了这些名称，部署前先为新应用增加独立命名空间，避免覆盖旧数据。
- 旧应用是否仍有服务、域名、云函数或定时任务在运行；确认无业务依赖后再决定是否停用。不要为了部署本项目直接销毁旧资源。

截至 2026 年 8 月 31 日，腾讯云官方价格文档说明：自 2026 年 1 月 16 日起，每个云开发账号可以创建一个免费体验版环境，含每月 3000 资源点，单次可续期 6 个月；已在使用免费套餐的账号不能再创建新的免费体验环境。免费环境不支持加购资源包或开启按量付费，手动转为付费后会收到续费提醒。因此，如果旧环境仍处于免费且功能满足要求，复用通常是成本最低的选择；实际套餐和到期状态仍以控制台“套餐用量”页面为准。

官方参考：

- [CloudBase 价格文档](https://cloud.tencent.com/document/product/876/75213)
- [CloudBase 环境说明](https://cloud.tencent.com/document/product/876/46895)

应用需要 Node.js 22 和 `npm run build` 产物。CloudBase 云托管应直接使用 `app/Dockerfile`：容器入口是 standalone 产物的 `node server.js`，读取平台注入的 `PORT`，默认 3000。非 Docker 本地冒烟可使用 `npm run start`。生产环境必须设置：

```text
MOMENTS_STORAGE=cloudbase-postgres
CLOUDBASE_ENV_ID=sichuantripmama-d8furc3w318e17b0
DATABASE_URL=postgresql://<用户名>:<密码>@<主机>:<端口>/<数据库>

MOMENTS_PUBLIC_URL=https://<你的域名>
TENCENTCLOUD_SECRETID=<服务端密钥 ID>
TENCENTCLOUD_SECRETKEY=<服务端密钥>
```

数据库连接串和云密钥只能配置在云托管的加密环境变量中，不得写入 `.env`、GitHub、截图或日志。可选 `MOMENTS_DATABASE_POOL_SIZE` 默认为 5；家庭规模无需调高。


应用会拒绝超过 12 MiB 的 JSONB 状态；大档案的原始媒体始终单独存储。当前完整归档在服务内存生成 ZIP，适合家庭旅行规模，未来大型档案可改为后台流式导出。

## 本地验证

```powershell
cd app
npm install
$env:MOMENTS_ALLOW_LOCAL = "true"
npm run dev
```

本地数据写入 `app/.data`，媒体写入 `app/.data/media`。`.gitignore` 已忽略这些运行时数据。发布前运行：

```powershell
npm run typecheck
npm test
npm run build
```

## GitHub

建议先在 GitHub 创建一个空的私有仓库，再在项目根目录执行：

```powershell
git init
git add .
git commit -m "Build MOMENTS Sichuan family travel space"
git branch -M main
git remote add origin https://github.com/<account>/<repository>.git
git push -u origin main
```

首次部署后打开 `MOMENTS_PUBLIC_URL`，由发起人先用昵称和密码注册管理员账号，再分享网址。不要把初始化密钥、PIN、恢复码或云密钥放入 GitHub、截图或归档。
