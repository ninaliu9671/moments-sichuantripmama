# MOMENTS 四川之旅部署

代码已准备好推送到 GitHub，再部署到 CloudBase。GitHub 私有仓库已创建，CloudBase 环境 ID 尚未创建；创建后在项目的部署平台填入以下配置。

## CloudBase

应用需要 Node.js 22、`npm run build` 产物和一个 Node 服务，启动命令为 `npm run start`，本地端口为 3000；Docker 使用平台注入的 PORT，默认 3000。生产环境必须设置：

```text
MOMENTS_STORAGE=cloudbase
CLOUDBASE_ENV_ID=<CloudBase 环境 ID>

MOMENTS_PUBLIC_URL=https://<你的域名>
TENCENTCLOUD_SECRETID=<服务端密钥 ID>
TENCENTCLOUD_SECRETKEY=<服务端密钥>
```


CloudBase 的数据库状态文档有容量上限。应用会拒绝超过 12 MiB 的状态文档；大档案的原始媒体始终单独存储。当前完整归档在服务内存生成 ZIP，适合家庭旅行规模，未来大型档案可改为后台流式导出。

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
