import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import seed from '../trip-seed.json';
import type { Member, Trip, Place, Moment, Comment, Reaction, Media } from '../types';
import { customUserId } from './cloudbase-auth';

export type PrivateMember = Member & { pinHash: string; recoveryHash: string };
export type StoredMedia = Media & { ownerId: string; objectKey: string; momentId: string | null };
export type State = {
  version: 1; trip: Trip; members: PrivateMember[]; places: Place[];
  moments: Moment[]; comments: Comment[]; reactions: Reaction[]; media: StoredMedia[];
  sessions: { hash: string; memberId: string; expires: number }[];
  invite: { enabled: boolean; token: string };
  attempts: Record<string, { count: number; until: number }>;
};
export function emptyState(): State {
  return { version: 1, trip: { id: 'sichuan-2026', title: seed.title, startDate: seed.startDate, endDate: seed.endDate, days: structuredClone(seed.days) }, places: structuredClone(seed.places), members: [], moments: [], comments: [], reactions: [], media: [], sessions: [], invite: { enabled: false, token: '' }, attempts: {} };
}
export function dataDir() { return resolve(process.env.MOMENTS_DATA_DIR || '.data'); }
function postgresMode() { return process.env.MOMENTS_STORAGE === 'cloudbase-postgres'; }
function assertStorage() {
  if (process.env.NODE_ENV === 'production' && !postgresMode() && process.env.MOMENTS_ALLOW_LOCAL !== 'true') throw new Error('生产环境必须配置 PostgreSQL 持久存储。');
}
const stateId = 'sichuan-2026';
function cloudbaseConfig() {
  const env = process.env.CLOUDBASE_ENV_ID;
  const apiKey = process.env.CLOUDBASE_APIKEY || process.env.CLOUDBASE_API_KEY;
  if (!env || !apiKey) throw new Error('未配置 CloudBase 环境或服务端 API Key');
  return {
    env, apiKey,
    stateUrl: `https://${env}.api.tcloudbasegateway.com/v1/rdb/rest/moments_app_state`,
  };
}
async function stateRequest(path: string, init: RequestInit = {}) {
  const { apiKey, stateUrl } = cloudbaseConfig();
  const response = await fetch(`${stateUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`CloudBase state request failed (${response.status})`);
  return response;
}
export async function readCloudState(): Promise<{ state: State; revision: number }> {
  const response = await stateRequest(`?id=eq.${stateId}&select=payload,revision`);
  const rows = await response.json() as { payload: State; revision: number }[];
  if (!rows[0]?.payload || !Number.isSafeInteger(Number(rows[0].revision))) throw new Error('旅行数据尚未初始化，请先运行数据库迁移。');
  return { state: rows[0].payload, revision: Number(rows[0].revision) };
}
// PG native storage uses bucket-relative paths, not the classic cloud:// fileID.
// This credential must only exist in the cloud function or an administrator's shell.
let pgStoragePromise: ReturnType<typeof createPgStorageApp> | undefined;
async function createPgStorageApp() {
  const { env, apiKey } = cloudbaseConfig();
  // The Node SDK reads the service-role API key from this environment variable.
  // Passing it as accessKey is documented for publishable browser keys and may
  // select the anonymous role instead of the server identity.
  process.env.CLOUDBASE_APIKEY = apiKey;
  const { default: sdk } = await import('@cloudbase/js-sdk');
  return sdk.init({ env });
}
async function pgBucket() {
  pgStoragePromise ??= createPgStorageApp();
  return (await pgStoragePromise).storage.from('moments');
}
export function cloudStorageAvailable() {
  return !!(process.env.CLOUDBASE_ENV_ID && (process.env.CLOUDBASE_APIKEY || process.env.CLOUDBASE_API_KEY));
}
function validatePgObjectKey(key: string): void {
  if (!/^[A-Za-z0-9_-]{32}\/[a-f0-9-]{36}\.[a-z0-9]{2,5}$/.test(key) || key.includes('..')) throw new Error('无效的媒体对象路径');
}
export async function createMediaUpload(memberId: string, extension: string) {
  if (!postgresMode()) throw new Error('仅 PostgreSQL 云存储支持直传媒体');
  if (!/^\.[a-z0-9]{2,5}$/.test(extension)) throw new Error('媒体扩展名无效');
  const owner = customUserId(memberId);
  const objectKey = `${owner}/${randomUUID()}${extension}`;
  const { data, error } = await (await pgBucket()).createSignedUploadUrl(objectKey);
  if (error || !data?.token) throw new Error('无法创建上传凭据', { cause: error });
  return { objectKey, token: data.token };
}
async function readPgMedia(objectKey: string): Promise<Buffer> {
  validatePgObjectKey(objectKey);
  const { data, error } = await pgBucket().then(bucket => bucket.download(objectKey));
  if (error || !data) throw new Error('云端媒体下载失败', { cause: error });
  return Buffer.from(await data.arrayBuffer());
}
/** Inspect the immutable uploaded object before recording it in application state. */
export async function inspectUploadedMedia(objectKey: string, memberId: string): Promise<{ size: number; sha256: string; mime?: string }> {
  if (!postgresMode()) throw new Error('仅 PostgreSQL 云存储支持直传媒体核验');
  validatePgObjectKey(objectKey);
  const owner = customUserId(memberId);
  if (!/^[A-Za-z0-9_-]{32}$/.test(owner) || !objectKey.startsWith(`${owner}/`)) throw new Error('媒体路径不属于当前用户');
  const { data: entry, error } = await (await pgBucket()).info(objectKey);
  if (error || !entry) throw new Error('媒体未上传完成或上传身份不匹配', { cause: error });
  const declaredSize = Number(entry.size);
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 1 || declaredSize > 100 * 1024 * 1024) throw new Error('媒体大小不符合限制');
  const bytes = await readPgMedia(objectKey);
  if (bytes.byteLength !== declaredSize) throw new Error('媒体字节数与云端记录不一致');
  return { size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), mime: entry.contentType || undefined };
}
/** Admin-only preview import path; normal users upload with their own CloudBase identity. */
export async function uploadImportedMedia(objectKey: string, bytes: Buffer, mime: string): Promise<void> {
  if (!postgresMode()) throw new Error('仅 PostgreSQL 模式支持云端预览导入');
  validatePgObjectKey(objectKey);
  const { error } = await pgBucket().then(bucket => bucket.upload(objectKey, bytes, { contentType: mime.split(';')[0], upsert: false }));
  if (error) throw new Error('预览媒体上传失败', { cause: error });
}
let queue = Promise.resolve();
// CloudBase REST uses the revision as an optimistic lock across function
// instances. A conflict reloads current state and reapplies the operation.
export async function transact<T>(fn: (state: State) => T): Promise<T> {
  assertStorage();
  if (postgresMode()) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { state, revision } = await readCloudState();
      const value = fn(state);
      const payload = JSON.stringify(state);
      if (Buffer.byteLength(payload) > 12 * 1024 * 1024) throw new Error('旅行数据已达到当前容量，请联系管理员扩容后重试。');
      const response = await stateRequest(`?id=eq.${stateId}&revision=eq.${revision}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ payload: state, revision: revision + 1, updated_at: new Date().toISOString() }),
      });
      const updated = await response.json() as { revision: number }[];
      if (updated.length === 1) return value;
    }
    throw new Error('旅行数据同时被多人修改，请重试。');
  }
  let release!: () => void;
  const previous = queue;
  queue = new Promise<void>(r => { release = r; });
  await previous;
  try {
    await mkdir(dataDir(), { recursive: true });
    const file = join(dataDir(), 'state.json');
    let state: State;
    try { state = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; state = emptyState(); }
    const value = fn(state);
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, file);
    return value;
  } finally { release(); }
}
export async function writeMedia(id: string, bytes: Buffer): Promise<string> {
  assertStorage();
  if (postgresMode()) throw new Error('PostgreSQL 云存储需使用已认证用户直传。');
  await mkdir(join(dataDir(), 'media'), { recursive: true });
  await writeFile(join(dataDir(), 'media', id), bytes);
  return id;
}
export async function readMedia(objectKey: string): Promise<Buffer> {
  assertStorage();
  if (postgresMode()) return readPgMedia(objectKey);
  if (!/^[\w-]+$/.test(objectKey)) throw new Error('无效的媒体路径');
  return readFile(join(dataDir(), 'media', objectKey));
}
export async function deleteMedia(objectKey: string): Promise<void> {
  assertStorage();
  if (postgresMode()) {
    validatePgObjectKey(objectKey);
    const { error } = await pgBucket().then(bucket => bucket.remove([objectKey]));
    if (error) throw new Error('云端媒体删除失败', { cause: error });
    return;
  }
  if (!/^[\w-]+$/.test(objectKey)) throw new Error('无效的媒体路径');
  await unlink(join(dataDir(), 'media', objectKey));
}
// Private PG objects are delivered through time-limited signed URLs, keeping
// large media out of the cloud function response.
export async function mediaDeliveryUrl(objectKey: string, seconds = 3600): Promise<string | undefined> {
  assertStorage();
  if (!postgresMode()) return undefined;
  validatePgObjectKey(objectKey);
  const { data, error } = await pgBucket().then(bucket => bucket.createSignedUrl(objectKey, seconds));
  if (error || !data?.fullSignedURL) throw new Error('无法生成私有媒体下载链接', { cause: error });
  return data.fullSignedURL;
}
