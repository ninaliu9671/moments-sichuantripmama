# CloudBase PostgreSQL 数据操作

以下命令都在 `app/` 目录运行。管理员电脑只需设置 `CLOUDBASE_ENV_ID` 与服务端 `CLOUDBASE_APIKEY`，并设置 `MOMENTS_STORAGE=cloudbase-postgres`。密钥保存在 Git 忽略目录或当前终端，不写入仓库。

## 迁移与初始化

先通过 CloudBase CLI PostgreSQL 迁移执行 `sql/001_moments_pg.sql`。迁移创建：

- `public.moments_app_state` 状态表，使用 `revision` 做并发更新；
- 私有 `moments` 存储桶；
- 100 MiB 单文件限制与照片、视频、音频 MIME 白名单；
- 阻止匿名和普通已登录数据库角色访问业务状态的权限。

然后运行：

```powershell
node --import tsx scripts/moments-data.ts migrate
```

命令通过服务端 REST API 幂等创建空白 `sichuan-2026` 状态行，并读取核验。函数和管理员工具都不使用 PostgreSQL 直连账号。

## 预览数据

先离线核验本机源数据：

```powershell
node --import tsx scripts/moments-data.ts inspect-preview
```

预期是 2 条动态、3 个媒体、5 条留言，媒体大小和 SHA-256 必须匹配。目标云端状态必须为空。设置长度 6–128 的 `MOMENTS_PREVIEW_PASSWORD` 后运行：

```powershell
node --import tsx scripts/moments-data.ts import-preview
```

工具会清除源数据中的旧会话和凭据，为预览主人生成临时密码，上传并回读核验每个私有媒体，再通过状态表版本号提交整份状态。失败后已上传对象会保留供人工核对；重试不会静默覆盖对象。

## 完整私人备份

```powershell
node --import tsx scripts/moments-data.ts export
node --import tsx scripts/moments-data.ts verify-export .data-exports/<输出目录>
```

导出目录包含完整 `state.json`、所有原始媒体及 SHA-256 清单。工具会在导出后自动验证。目录含私人内容和密码哈希，应转存到个人安全位置，不要提交或公开分享。

云函数不生成大体积 ZIP。清理任何预览数据前，必须先保存并验证上述完整备份。
