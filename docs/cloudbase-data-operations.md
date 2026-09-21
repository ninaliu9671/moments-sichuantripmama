# CloudBase PostgreSQL 数据操作

在 `app/` 目录执行以下命令。先在控制台确认目标 CloudBase 环境创建时选用了 PG 模式；传统模式环境不能原地升级。旧版 CloudBase 文档数据库与旧版存储不参与本流程。任何密钥只放管理员终端和云函数环境变量，不提交到 Git。

## 一次性迁移

管理员终端配置 `DATABASE_URL`，指向 CloudBase 控制台提供的 PostgreSQL 连接地址，使用有权创建 schema、表和 `storage` RLS Policy 的数据库管理员。先在控制台创建独立的函数数据库账号，再将其用户名设置为 `MOMENTS_DB_APP_ROLE`。该变量必须设置，才能为函数账号授权。运行：

```powershell
node --import tsx scripts/moments-data.ts migrate
```

迁移创建 `moments_private.app_state` 并填入空白新版状态，建立私有 `moments` 桶、100 MB 单文件上限及上传路径策略。浏览器的 `anon` 和 `authenticated` 数据库角色没有业务状态表权限。脚本按 `MOMENTS_DB_APP_ROLE` 授予函数账号业务表的 `SELECT, UPDATE` 与媒体元数据的只读权限，并创建只允许读取 `moments` 桶元数据的 RLS 策略。函数的 `DATABASE_URL` 使用这个独立账号，不使用管理员连接。云函数另需 `CLOUDBASE_ENV_ID` 与服务端 `CLOUDBASE_APIKEY`。该 Key 是服务角色凭据，只能放在函数环境变量中。CloudBase PG 存储的对象路径是桶内路径 `<CloudBase 用户 ID>/<UUID>.<扩展名>`，不能使用旧版 `cloud://` 文件 ID。

## 预览数据

先离线核验本机源数据：

```powershell
node --import tsx scripts/moments-data.ts inspect-preview
```

预期为 2 条动态、3 个媒体、5 条留言，三个媒体的大小与 SHA-256 必须匹配。目标状态须为空。设置本次预览专用密码 `MOMENTS_PREVIEW_PASSWORD`（长度 6–128）；同时设置 `DATABASE_URL`、`CLOUDBASE_ENV_ID`、`CLOUDBASE_APIKEY`，再运行：

```powershell
node --import tsx scripts/moments-data.ts import-preview
```

脚本不会沿用本机旧密码、恢复码或会话。它将原始媒体上传到新私有桶，逐个下载核对 SHA-256 和大小，再以一次数据库事务写入状态。控制台输出预览登录昵称；密码就是管理员终端提供的临时密码。导入失败后先检查云端对象；同哈希对象可在重试时复用，脚本不会覆盖已有对象。

## 完整私人备份

管理员电脑配置 `DATABASE_URL`、`CLOUDBASE_ENV_ID`、`CLOUDBASE_APIKEY` 后运行：

```powershell
node --import tsx scripts/moments-data.ts export
node --import tsx scripts/moments-data.ts verify-export .data-exports/<输出目录>
```

导出写入 `app/.data-exports/<时间>/`，包括完整 `state.json`、所有原始媒体和每个文件的 SHA-256 清单；导出后立即自动验证。该目录包含私人内容及密码哈希，应存入个人安全备份位置，不要上传到公开仓库。

云函数不负责生成大体积 ZIP。**用户验收预览之后**，先把上述完整备份保存并验证，再单独执行清空预览数据及媒体的操作；当前工具没有自动清空命令，以免在验收前误删。清空后再创建正式管理员账号并邀请妈妈。

参考：[CloudBase PostgreSQL 直连与最小权限](https://docs.cloudbase.net/database/postgresql/connecting-to-postgresql)、[PG 存储权限模型](https://docs.cloudbase.net/storage/pg/data-permission)、[PG 存储 SDK](https://docs.cloudbase.net/api-reference/webv3-pg/storage)。
