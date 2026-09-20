import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import type { Transaction } from '@cloudbase/database/dist/commonjs/transaction/index';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import seed from '../trip-seed.json';
import type { Member, Trip, Place, Moment, Comment, Reaction, Media } from '../types';

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
function cloudMode() { return process.env.MOMENTS_STORAGE === 'cloudbase'; }
function postgresMode() { return process.env.MOMENTS_STORAGE === 'cloudbase-postgres'; }
function cloudMediaMode() { return cloudMode() || postgresMode(); }
function assertStorage() {
  if (process.env.NODE_ENV === 'production' && !cloudMediaMode() && process.env.MOMENTS_ALLOW_LOCAL !== 'true') throw new Error('生产环境必须配置持久存储。');
}
let cloudPromise: Promise<import('@cloudbase/node-sdk').CloudBase> | undefined;
async function cloud() {
  if (!process.env.CLOUDBASE_ENV_ID) throw new Error('未配置 CLOUDBASE_ENV_ID');
  cloudPromise ??= import('@cloudbase/node-sdk').then(({ default: sdk }) => sdk.init({ env: process.env.CLOUDBASE_ENV_ID!, ...(process.env.TENCENTCLOUD_SECRETID ? { secretId: process.env.TENCENTCLOUD_SECRETID, secretKey: process.env.TENCENTCLOUD_SECRETKEY } : {}) }));
  return cloudPromise;
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
      await client.query(`CREATE TABLE IF NOT EXISTS moments_app_state (
        id text PRIMARY KEY,
        payload jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await client.query(
        'INSERT INTO moments_app_state (id, payload) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING',
        ['sichuan-2026', JSON.stringify(emptyState())],
      );
      const result = await client.query<{ payload: State }>(
        'SELECT payload FROM moments_app_state WHERE id = $1 FOR UPDATE',
        ['sichuan-2026'],
      );
      const state = result.rows[0]?.payload;
      if (!state) throw new Error('旅行数据初始化失败');
      const value = fn(state);
      const payload = JSON.stringify(state);
      if (Buffer.byteLength(payload) > 12 * 1024 * 1024) throw new Error('旅行数据已达到当前容量，请联系管理员扩容后重试。');
      await client.query(
        'UPDATE moments_app_state SET payload = $2::jsonb, updated_at = now() WHERE id = $1',
        ['sichuan-2026', payload],
      );
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally { client.release(); }
  }
  if (cloudMode()) {
    const db = (await cloud()).database();
    return db.runTransaction(async (tx: Transaction) => {
      const ref = tx.collection('moments_state').doc('sichuan-2026');
      const result = await ref.get();
      const document = (Array.isArray(result.data) ? result.data[0] : result.data) as { payload?: State } | undefined;
      const state = document?.payload || emptyState();
      const value = fn(state);
      // Keep below the document limit; media bytes live in private object storage.
      if (Buffer.byteLength(JSON.stringify(state)) > 12 * 1024 * 1024) throw new Error('旅行数据已达到当前容量，请联系管理员扩容后重试。');
      await ref.set({ payload: state });
      return value;
    });
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
  if (cloudMediaMode()) return (await (await cloud()).uploadFile({ cloudPath: `moments/${id}`, fileContent: bytes })).fileID;
  await mkdir(join(dataDir(), 'media'), { recursive: true });
  await writeFile(join(dataDir(), 'media', id), bytes);
  return id;
}
export async function readMedia(objectKey: string): Promise<Buffer> {
  assertStorage();
  if (cloudMediaMode()) {
    const result = await (await cloud()).downloadFile({ fileID: objectKey });
    if (!Buffer.isBuffer(result.fileContent)) throw new Error('媒体下载失败');
    return result.fileContent;
  }
  if (!/^[\w-]+$/.test(objectKey)) throw new Error('无效的媒体路径');
  return readFile(join(dataDir(), 'media', objectKey));
}
export async function deleteMedia(objectKey: string): Promise<void> {
  assertStorage();
  if (cloudMediaMode()) { await (await cloud()).deleteFile({ fileList: [objectKey] }); return; }
  if (!/^[\w-]+$/.test(objectKey)) throw new Error('无效的媒体路径');
  await unlink(join(dataDir(), 'media', objectKey));
}
