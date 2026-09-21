import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
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
let poolPromise: Promise<Pool> | undefined;
async function postgres() {
  if (!process.env.DATABASE_URL) throw new Error('未配置 DATABASE_URL');
  poolPromise ??= import('pg').then(({ Pool }) => new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.MOMENTS_DATABASE_POOL_SIZE || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  }));
  return poolPromise;
}
// PG native storage uses bucket-relative paths, not the classic cloud:// fileID.
// This credential must only exist in the cloud function or an administrator's shell.
let pgStoragePromise: ReturnType<typeof createPgStorageApp> | undefined;
async function createPgStorageApp() {
  const env = process.env.CLOUDBASE_ENV_ID;
  const apiKey = process.env.CLOUDBASE_APIKEY || process.env.CLOUDBASE_API_KEY;
  if (!env || !apiKey) throw new Error('未配置 CloudBase PG 存储环境或服务端 API Key');
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
function validatePgObjectKey(key: string): void {
  if (!/^[A-Za-z0-9_-]{32}\/[a-f0-9-]{36}\.[a-z0-9]{2,5}$/.test(key) || key.includes('..')) throw new Error('无效的媒体对象路径');
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
  const result = await (await postgres()).query<{ owner_id: string | null; metadata: { size?: number | string; mimetype?: string } | null }>(
    'SELECT owner_id, metadata FROM storage.objects WHERE bucket_id = $1 AND name = $2',
    ['moments', objectKey],
  );
  const entry = result.rows[0];
  if (!entry || entry.owner_id !== owner) throw new Error('媒体未上传完成或上传身份不匹配');
  const declaredSize = Number(entry.metadata?.size);
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 1 || declaredSize > 100 * 1024 * 1024) throw new Error('媒体大小不符合限制');
  const bytes = await readPgMedia(objectKey);
  if (bytes.byteLength !== declaredSize) throw new Error('媒体字节数与云端记录不一致');
  return { size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), mime: entry.metadata?.mimetype };
}
/** Admin-only preview import path; normal users upload with their own CloudBase identity. */
export async function uploadImportedMedia(objectKey: string, bytes: Buffer, mime: string): Promise<void> {
  if (!postgresMode()) throw new Error('仅 PostgreSQL 模式支持云端预览导入');
  validatePgObjectKey(objectKey);
  const { error } = await pgBucket().then(bucket => bucket.upload(objectKey, bytes, { contentType: mime.split(';')[0], upsert: false }));
  if (error) throw new Error('预览媒体上传失败', { cause: error });
}
async function rollback(client: PoolClient) {
  try { await client.query('ROLLBACK'); }
  catch { console.error('MOMENTS database rollback failed'); }
}
let queue = Promise.resolve();
// All mutations, including auth failures, commit atomically. Database transactions
// provide the same serialization across multiple container instances.
export async function transact<T>(fn: (state: State) => T): Promise<T> {
  assertStorage();
  if (postgresMode()) {
    const client = await (await postgres()).connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ payload: State }>(
        'SELECT payload FROM moments_private.app_state WHERE id = $1 FOR UPDATE',
        ['sichuan-2026'],
      );
      const state = result.rows[0]?.payload;
      if (!state) throw new Error('旅行数据尚未初始化，请先运行数据库迁移。');
      const value = fn(state);
      const payload = JSON.stringify(state);
      if (Buffer.byteLength(payload) > 12 * 1024 * 1024) throw new Error('旅行数据已达到当前容量，请联系管理员扩容后重试。');
      await client.query(
        'UPDATE moments_private.app_state SET payload = $2::jsonb, updated_at = now() WHERE id = $1',
        ['sichuan-2026', payload],
      );
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
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
