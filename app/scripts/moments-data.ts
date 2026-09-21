import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { customUserId } from '../lib/server/cloudbase-auth';
import { emptyState, readMedia, uploadImportedMedia, type State } from '../lib/server/store';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const previewRoot = join(appRoot, '.data-preview');
const exportRoot = join(appRoot, '.data-exports');
const rowId = 'sichuan-2026';
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac',
};
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fail = (message: string): never => { throw new Error(message); };
const pathForMedia = (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) fail(`无效的媒体 ID：${id}`);
  return `media/${id}`;
};
function checkState(value: unknown): asserts value is State {
  if (!value || typeof value !== 'object') fail('状态文件格式不正确');
  const state = value as State;
  if (state.version !== 1 || state.trip?.id !== rowId || !Array.isArray(state.members) || !Array.isArray(state.moments) || !Array.isArray(state.media) || !Array.isArray(state.comments)) fail('状态版本不匹配');
  const ids = new Set(state.media.map(item => item.id));
  if (ids.size !== state.media.length) fail('媒体 ID 重复');
  for (const item of state.media) {
    pathForMedia(item.id);
    if (!state.members.some(m => m.id === item.ownerId)) fail(`媒体 ${item.id} 的所属用户不存在`);
    if (!Number.isSafeInteger(item.size) || item.size < 1 || item.size > 100 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(item.sha256)) fail(`媒体 ${item.id} 的完整性元数据无效`);
  }
}
async function db() {
  if (!process.env.DATABASE_URL) fail('需要在管理员电脑设置 DATABASE_URL');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}
async function cloudState(client: pg.Client) {
  const result = await client.query<{ payload: State }>('SELECT payload FROM moments_private.app_state WHERE id = $1', [rowId]);
  if (!result.rows[0]) fail('数据库未初始化，请先运行 migrate');
  checkState(result.rows[0].payload);
  return result.rows[0].payload;
}
async function preview() {
  const state = JSON.parse(await readFile(join(previewRoot, 'state.json'), 'utf8')) as unknown;
  checkState(state);
  if (state.moments.length !== 2 || state.media.length !== 3 || state.comments.length !== 5) fail('本机预览数据的数量与计划不一致，请先检查');
  const files: { id: string; size: number; sha256: string }[] = [];
  for (const item of state.media) {
    const bytes = await readFile(join(previewRoot, pathForMedia(item.id)));
    if (bytes.byteLength !== item.size || sha256(bytes) !== item.sha256) fail(`本机预览媒体损坏：${item.id}`);
    files.push({ id: item.id, size: item.size, sha256: item.sha256 });
  }
  return { state, files };
}
async function migrate() {
  const appRole = process.env.MOMENTS_DB_APP_ROLE;
  if (!appRole || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(appRole) || ['anon', 'authenticated', 'service_role', 'postgres'].includes(appRole)) fail('必须设置有效的独立函数数据库账号 MOMENTS_DB_APP_ROLE');
  const client = await db();
  try {
    const sql = await readFile(join(appRoot, 'sql', '001_moments_pg.sql'), 'utf8');
    await client.query(sql);
      const role = `"${appRole}"`;
      await client.query('BEGIN');
      try {
        await client.query(`GRANT USAGE ON SCHEMA moments_private, storage TO ${role}`);
        await client.query(`GRANT SELECT, UPDATE ON moments_private.app_state TO ${role}`);
        await client.query(`GRANT SELECT ON storage.objects TO ${role}`);
        await client.query('DROP POLICY IF EXISTS moments_backend_state ON moments_private.app_state');
        await client.query(`CREATE POLICY moments_backend_state ON moments_private.app_state FOR ALL TO ${role} USING (id = 'sichuan-2026') WITH CHECK (id = 'sichuan-2026')`);
        await client.query('DROP POLICY IF EXISTS moments_backend_inspect ON storage.objects');
        await client.query(`CREATE POLICY moments_backend_inspect ON storage.objects FOR SELECT TO ${role} USING (bucket_id = 'moments')`);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    await client.query('INSERT INTO moments_private.app_state (id, payload) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING', [rowId, JSON.stringify(emptyState())]);
    const state = await cloudState(client);
    console.log(`迁移完成。当前状态：${state.members.length} 位成员，${state.moments.length} 条动态。函数数据库账号：${appRole}`);
  } finally { await client.end(); }
}
function hashSecret(value: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 32).toString('hex')}`;
}
async function importPreview() {
  const password = process.env.MOMENTS_PREVIEW_PASSWORD;
  if (!password || password.length < 6 || password.length > 128) throw new Error('请设置长度 6–128 的 MOMENTS_PREVIEW_PASSWORD，凭据不得写入仓库');
  const { state: source, files } = await preview();
  const client = await db();
  const uploaded: string[] = [];
  try {
    const current = await cloudState(client);
    if (current.members.length || current.moments.length || current.media.length) fail('目标数据库不是空白新版；为保护已有数据，拒绝导入');
    const state = structuredClone(source);
    state.sessions = [];
    state.attempts = {};
    state.invite = { enabled: false, token: '' };
    const owner = state.members.find(m => m.role === 'owner' && m.status === 'active');
    if (!owner) throw new Error('本机预览数据没有可用的主人账号');
    // Existing local credentials never enter the cloud preview. The supplied
    // temporary password works for the owner only; all old sessions expire.
    for (const member of state.members) {
      member.pinHash = hashSecret(randomBytes(32).toString('base64url'));
      member.recoveryHash = hashSecret(randomBytes(32).toString('base64url'));
    }
    owner.pinHash = hashSecret(password);
    for (const item of state.media) {
      const extension = extensions[item.mime.split(';')[0]];
      if (!extension) fail(`未知媒体类型：${item.mime}`);
      const objectKey = `${customUserId(item.ownerId)}/${item.id}.${extension}`;
      const bytes = await readFile(join(previewRoot, pathForMedia(item.id)));
      process.env.MOMENTS_STORAGE = 'cloudbase-postgres';
      let cloudBytes: Buffer;
      try { cloudBytes = await readMedia(objectKey); }
      catch {
        await uploadImportedMedia(objectKey, bytes, item.mime);
        uploaded.push(objectKey);
        cloudBytes = await readMedia(objectKey);
      }
      if (cloudBytes.byteLength !== item.size || sha256(cloudBytes) !== item.sha256) fail(`云端预览媒体校验失败：${item.id}`);
      item.objectKey = objectKey;
    }
    await client.query('BEGIN');
    const locked = await client.query<{ payload: State }>('SELECT payload FROM moments_private.app_state WHERE id = $1 FOR UPDATE', [rowId]);
    if (!locked.rows[0] || locked.rows[0].payload.members.length || locked.rows[0].payload.moments.length) fail('导入期间目标数据已发生变化');
    await client.query('UPDATE moments_private.app_state SET payload = $2::jsonb, updated_at = now() WHERE id = $1', [rowId, JSON.stringify(state)]);
    await client.query('COMMIT');
    const imported = await cloudState(client);
    if (imported.moments.length !== 2 || imported.media.length !== 3 || imported.comments.length !== 5 || files.some(file => imported.media.find(m => m.id === file.id)?.sha256 !== file.sha256)) fail('导入后的数量或 SHA-256 不一致');
    console.log(`导入并核验完成：2 条动态、3 个媒体、5 条留言。预览登录昵称：${owner.name}。密码由 MOMENTS_PREVIEW_PASSWORD 提供。`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* no open transaction */ }
    // Uploaded objects are intentionally retained on failure for inspection;
    // a retry refuses overwrites and cannot silently replace any bytes.
    if (uploaded.length) console.error(`导入未完成，已有 ${uploaded.length} 个云端对象需要人工核对。`);
    throw error;
  } finally { await client.end(); }
}
type Manifest = { format: string; version: number; counts: { members: number; moments: number; media: number; comments: number }; files: { path: string; size: number; sha256: string }[] };
async function exportData(targetArg?: string) {
  process.env.MOMENTS_STORAGE = 'cloudbase-postgres';
  const client = await db();
  let state: State;
  try { state = await cloudState(client); }
  finally { await client.end(); }
  const target = resolve(targetArg || join(exportRoot, new Date().toISOString().replace(/[:.]/g, '-')));
  if (!targetArg) await mkdir(exportRoot, { recursive: true, mode: 0o700 });
  await mkdir(target, { recursive: false, mode: 0o700 });
  await mkdir(join(target, 'media'), { mode: 0o700 });
  const files: Manifest['files'] = [];
  const stateBytes = Buffer.from(JSON.stringify(state, null, 2));
  await writeFile(join(target, 'state.json'), stateBytes, { mode: 0o600, flag: 'wx' });
  files.push({ path: 'state.json', size: stateBytes.byteLength, sha256: sha256(stateBytes) });
  for (const item of state.media) {
    const bytes = await readMedia(item.objectKey);
    if (bytes.byteLength !== item.size || sha256(bytes) !== item.sha256) fail(`云端媒体完整性校验失败：${item.id}`);
    const path = pathForMedia(item.id);
    await writeFile(join(target, path), bytes, { mode: 0o600, flag: 'wx' });
    files.push({ path, size: bytes.byteLength, sha256: sha256(bytes) });
  }
  const manifest: Manifest = { format: 'moments-private-full-export', version: 1, counts: { members: state.members.length, moments: state.moments.length, media: state.media.length, comments: state.comments.length }, files };
  await writeFile(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
  await verifyExport(target);
  console.log(`完整私人备份已校验：${target}`);
}
async function verifyExport(targetArg: string) {
  const target = resolve(targetArg);
  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8')) as Manifest;
  if (manifest.format !== 'moments-private-full-export' || manifest.version !== 1 || !Array.isArray(manifest.files)) fail('备份清单格式不正确');
  const paths = new Set<string>();
  for (const entry of manifest.files) {
    if (entry.path !== 'state.json' && !/^media\/[0-9a-f-]{36}$/.test(entry.path)) fail('备份清单含无效路径');
    if (paths.has(entry.path)) fail('备份清单路径重复');
    paths.add(entry.path);
    const bytes = await readFile(join(target, entry.path));
    if (bytes.byteLength !== entry.size || sha256(bytes) !== entry.sha256) fail(`备份文件损坏：${entry.path}`);
  }
  if (!paths.has('state.json')) fail('备份缺少状态文件');
  const state = JSON.parse(await readFile(join(target, 'state.json'), 'utf8')) as unknown;
  checkState(state);
  if (state.members.length !== manifest.counts.members || state.moments.length !== manifest.counts.moments || state.media.length !== manifest.counts.media || state.comments.length !== manifest.counts.comments || paths.size !== state.media.length + 1) fail('备份数量不一致');
  for (const item of state.media) {
    const file = manifest.files.find(f => f.path === pathForMedia(item.id));
    if (!file || file.size !== item.size || file.sha256 !== item.sha256) fail(`备份媒体清单不一致：${item.id}`);
  }
  console.log(`备份验证通过：${target}（${state.moments.length} 条动态，${state.media.length} 个媒体，${state.comments.length} 条留言）`);
}

const [command, argument] = process.argv.slice(2);
try {
  if (command === 'inspect-preview') {
    const { state, files } = await preview();
    console.log(JSON.stringify({ counts: { members: state.members.length, moments: state.moments.length, media: state.media.length, comments: state.comments.length }, files }, null, 2));
  } else if (command === 'migrate') await migrate();
  else if (command === 'import-preview') await importPreview();
  else if (command === 'export') await exportData(argument);
  else if (command === 'verify-export' && argument) await verifyExport(argument);
  else fail('用法：node --import tsx scripts/moments-data.ts <inspect-preview|migrate|import-preview|export [目录]|verify-export 目录>');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
