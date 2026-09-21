import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { customUserId } from '../lib/server/cloudbase-auth';
import { emptyState, readCloudState, readMedia, transact, uploadImportedMedia, type State } from '../lib/server/store';

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
function stateEndpoint() {
  const env = process.env.CLOUDBASE_ENV_ID;
  const apiKey = process.env.CLOUDBASE_APIKEY || process.env.CLOUDBASE_API_KEY;
  if (!env || !apiKey) fail('需要设置 CLOUDBASE_ENV_ID 和服务端 CLOUDBASE_APIKEY');
  return { url: `https://${env}.api.tcloudbasegateway.com/v1/rdb/rest/moments_app_state`, apiKey };
}
async function cloudState() {
  process.env.MOMENTS_STORAGE = 'cloudbase-postgres';
  const { state } = await readCloudState();
  checkState(state);
  return state;
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
  const { url, apiKey } = stateEndpoint();
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify([{ id: rowId, payload: emptyState(), revision: 0 }]),
  });
  if (!response.ok) fail(`状态初始化失败（HTTP ${response.status}）；请先通过 CloudBase CLI 应用 SQL 迁移`);
  const state = await cloudState();
  console.log(`状态表已就绪。当前状态：${state.members.length} 位成员，${state.moments.length} 条动态。`);
}
function hashSecret(value: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 32).toString('hex')}`;
}
async function importPreview() {
  const password = process.env.MOMENTS_PREVIEW_PASSWORD;
  if (!password || password.length < 6 || password.length > 128) throw new Error('请设置长度 6–128 的 MOMENTS_PREVIEW_PASSWORD，凭据不得写入仓库');
  const { state: source, files } = await preview();
  const uploaded: string[] = [];
  try {
    const current = await cloudState();
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
    await transact(target => {
      if (target.members.length || target.moments.length || target.media.length) fail('导入期间目标数据已发生变化');
      Object.assign(target, structuredClone(state));
    });
    const imported = await cloudState();
    if (imported.moments.length !== 2 || imported.media.length !== 3 || imported.comments.length !== 5 || files.some(file => imported.media.find(m => m.id === file.id)?.sha256 !== file.sha256)) fail('导入后的数量或 SHA-256 不一致');
    console.log(`导入并核验完成：2 条动态、3 个媒体、5 条留言。预览登录昵称：${owner.name}。密码由 MOMENTS_PREVIEW_PASSWORD 提供。`);
  } catch (error) {
    // Uploaded objects are intentionally retained on failure for inspection;
    // a retry refuses overwrites and cannot silently replace any bytes.
    if (uploaded.length) console.error(`导入未完成，已有 ${uploaded.length} 个云端对象需要人工核对。`);
    throw error;
  }
}
type Manifest = { format: string; version: number; counts: { members: number; moments: number; media: number; comments: number }; files: { path: string; size: number; sha256: string }[] };
async function exportData(targetArg?: string) {
  process.env.MOMENTS_STORAGE = 'cloudbase-postgres';
  const state = await cloudState();
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
