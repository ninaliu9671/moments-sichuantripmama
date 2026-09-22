import { validateOrigin } from '@/lib/server/origin';
import { randomUUID } from 'node:crypto';
import { operate, snapshot } from '@/lib/server/service';
import { cloudStorageAvailable, createMediaUpload, inspectUploadedMedia, mediaDeliveryUrl, readMedia, transact, writeMedia, deleteMedia } from '@/lib/server/store';
import { currentMember, digest, HttpError, requireValue, writer } from '@/lib/server/auth';
import { createArchive } from '@/lib/server/archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noCache = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const MAX_FILE = 100 * 1024 * 1024;

async function boundedBody(request: Request, maximum: number) {
  requireValue(Number(request.headers.get('content-length') || 0) <= maximum, '文件太大，请选择 100MB 以内的媒体。', 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; requireValue(size <= maximum, '上传内容太大。', 413); chunks.push(value); }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
const SUPPORTED_MEDIA = /^(image\/(jpeg|png|webp|gif|heic|heif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|wav|x-wav|webm|ogg|aac))(;.*)?$/i;
const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic', 'image/heif': '.heif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/aac': '.aac',
};

type MediaType = 'photo' | 'video' | 'audio';
function mediaTypeOf(mime: string): MediaType {
  return mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : 'audio';
}
function validateMedia(mime: string, size: number, duration: number) {
  requireValue(SUPPORTED_MEDIA.test(mime), '暂不支持此格式，请选照片、MP4 视频或常用音频。');
  requireValue(Number.isFinite(size) && size > 0 && size <= MAX_FILE, '请选择 100MB 以内的照片、视频或语音。');
  requireValue(Number.isFinite(duration) && duration >= 0, '媒体时长不正确。');
  if (mime.startsWith('video/')) requireValue(duration > 0 && duration <= 60, '视频需在 1 分钟以内。');
  if (mime.startsWith('audio/')) requireValue(duration > 0 && duration <= 180, '语音需在 3 分钟以内。');
}

async function cleanupPendingMedia(momentId?: string) {
  const pending = await transact(state => (state.pendingDeletes || []).filter(item => !momentId || item.momentId === momentId).map(item => ({ momentId: item.momentId, objectKeys: [...item.objectKeys] })));
  let failed = false;
  for (const item of pending) {
    const results = await Promise.allSettled(item.objectKeys.map(key => deleteMedia(key)));
    const removed = item.objectKeys.filter((_, index) => results[index].status === 'fulfilled');
    failed ||= results.some(result => result.status === 'rejected');
    await transact(state => {
      const entry = state.pendingDeletes?.find(candidate => candidate.momentId === item.momentId);
      if (!entry) return;
      entry.objectKeys = entry.objectKeys.filter(key => !removed.includes(key));
      if (!entry.objectKeys.length) state.pendingDeletes = state.pendingDeletes?.filter(candidate => candidate !== entry);
    });
  }
  if (failed) throw new HttpError(503, '记录已移除，但云端文件尚未清理完成，请稍后重试删除。');
}

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const path = (await context.params).path.join('/');
    if (!['GET', 'HEAD'].includes(request.method)) {
      validateOrigin(request);
    }
    if (path === 'health' && request.method === 'GET') {
      return Response.json({ ok: true, uploadTicket: cloudStorageAvailable() }, { headers: noCache });
    }
    // The browser asks the function for a one-time signed object upload, so
    // the media payload never crosses the function.
    if (path === 'upload-ticket' && request.method === 'POST') {
      const memberId = await transact(state => { const me = currentMember(state, request); writer(me); return me.id; });
      const raw = await boundedBody(request, 4 * 1024);
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw.toString()) as Record<string, unknown>; }
      catch { throw new HttpError(400, '上传信息无法读取，请重试。'); }
      const mime = String(body.mime || '').split(';')[0].toLowerCase();
      requireValue(SUPPORTED_MEDIA.test(mime) && MEDIA_EXTENSIONS[mime], '暂不支持此格式，请选照片、MP4 视频或常用音频。');
      return Response.json(await createMediaUpload(memberId, MEDIA_EXTENSIONS[mime]), { headers: noCache });
    }
    if (path === 'upload' && request.method === 'POST') {
      const contentType = request.headers.get('content-type') || '';
      // Preferred path: the browser already stored the file and reports only
      // its object key, so nothing large travels through the function.
      if (contentType.includes('application/json')) {
        const raw = await boundedBody(request, 16 * 1024);
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(raw.toString()) as Record<string, unknown>; }
        catch { throw new HttpError(400, '上传信息无法读取，请重试。'); }
        const mime = String(body.mime || '');
        const name = String(body.name || '未命名').slice(0, 200);
        const size = Number(body.size || 0);
        const duration = Number(body.duration || 0);
        validateMedia(mime, size, duration);
        const objectKey = String(body.objectKey || '');
        const claimedHash = String(body.sha256 || '').toLowerCase();
        requireValue(/^[a-f0-9]{64}$/.test(claimedHash), '文件校验信息不正确，请重新上传。');
        const memberId = await transact(state => { const me = currentMember(state, request); writer(me); return me.id; });
        const inspected = await inspectUploadedMedia(objectKey, memberId);
        requireValue(inspected.size === size && inspected.sha256 === claimedHash && (!inspected.mime || inspected.mime.split(';')[0] === mime.split(';')[0]), '上传文件校验失败，请重新上传。', 409);
        const id = randomUUID();
        const media = { id, type: mediaTypeOf(mime), url: `/api/media/${id}`, duration, name, mime, size, sha256: inspected.sha256 };
        await transact(state => {
          const me = currentMember(state, request); writer(me);
          requireValue(me.id === memberId, '登录状态已改变，请重试。', 401);
          requireValue(!state.media.some(item => item.objectKey === objectKey), '这份文件已经登记，请刷新后再试。', 409);
          state.media.push({ ...media, objectKey, ownerId: me.id, momentId: null });
        });
        return Response.json(media, { headers: noCache });
      }
      const memberId = await transact(state => { const me = currentMember(state, request); writer(me); return me.id; });
      const bytes = await boundedBody(request, MAX_FILE + 1024 * 1024);
      const form = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': contentType } }).formData();
      const file = form.get('file');
      requireValue(file instanceof File && file.size > 0, '请选择 100MB 以内的照片、视频或语音。');
      const duration = Number(form.get('duration') || 0);
      validateMedia(file.type, file.size, duration);
      const content = Buffer.from(await file.arrayBuffer()), id = randomUUID();
      const objectKey = await writeMedia(id, content);
      const media = { id, type: mediaTypeOf(file.type), url: `/api/media/${id}`, duration, name: file.name.slice(0, 200), mime: file.type, size: file.size, sha256: digest(content) };
      try { await transact(state => { const me = currentMember(state, request); writer(me); requireValue(me.id === memberId, '登录状态已改变，请重试。', 401); state.media.push({ ...media, objectKey, ownerId: me.id, momentId: null }); }); }
      catch (error) { await deleteMedia(objectKey).catch(() => console.error('Media cleanup failed')); throw error; }
      return Response.json(media, { headers: noCache });
    }
    if (path.startsWith('media/') && request.method === 'GET') {
      const media = await transact(state => {
        const me = currentMember(state, request);
        const item = state.media.find(m => m.id === path.slice(6));
        requireValue(item && (item.momentId || item.ownerId === me.id), '媒体不存在或你无权查看。', 404);
        return item;
      });
      const location = await mediaDeliveryUrl(media.objectKey);
      if (location) return new Response(null, { status: 302, headers: { ...noCache, Location: location } });
      requireValue(process.env.MOMENTS_STORAGE !== 'cloudbase-postgres', '暂时无法读取媒体，请联系旅行主人。', 503);
      const content = await readMedia(media.objectKey);
      const headers = { ...noCache, 'Content-Type': media.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(media.name)}`, 'Accept-Ranges': 'bytes' };
      const range = request.headers.get('range');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        requireValue(match && (match[1] || match[2]), '请求的媒体范围不正确。', 416);
        const start = match[1] ? Number(match[1]) : Math.max(0, content.length - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), content.length - 1) : content.length - 1;
        if (start > end || start >= content.length) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${content.length}` } });
        return new Response(new Uint8Array(content.subarray(start, end + 1)), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${content.length}`, 'Content-Length': String(end - start + 1) } });
      }
      return new Response(new Uint8Array(content), { headers: { ...headers, 'Content-Length': String(content.length) } });
    }
    if (path === 'archive' && request.method === 'GET') {
      if (process.env.MOMENTS_STORAGE === 'cloudbase-postgres') {
        throw new HttpError(409, '完整档案请由旅行主人在电脑上运行备份工具生成；云函数不处理整趟旅行的大文件。');
      }
      const capture = await transact(state => { const me = currentMember(state, request); const data = snapshot(state, request); return { data, media: state.media, role: me.role }; });
      requireValue(capture.role === 'owner', '只有旅行主人可以操作。', 403);
      const bytes = await createArchive(capture.data, async id => {
        const item = capture.media.find(m => m.id === id); requireValue(item, '有媒体缺失，请重试。', 409); return readMedia(item.objectKey);
      }).catch(() => { throw new HttpError(409, '档案未通过完整性检查：有原始媒体无法读取或校验失败。请稍后重试；若仍失败，请联系旅行主人检查云存储。未生成不完整档案。'); });
      return new Response(Buffer.from(bytes), { headers: { ...noCache, 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="moments-sichuan-${new Date().toISOString().slice(0, 10)}.zip"`, 'Content-Length': String(bytes.length) } });
    }
    let body: Record<string, unknown> = {};
    if (!['GET', 'HEAD'].includes(request.method)) {
      const raw = await boundedBody(request, 256 * 1024);
      if (raw.length) {
        requireValue(request.headers.get('content-type')?.includes('application/json'), '请求格式不正确。', 415);
        try { const parsed = JSON.parse(raw.toString()); requireValue(parsed && typeof parsed === 'object' && !Array.isArray(parsed), '请求格式不正确。'); body = parsed; }
        catch { throw new HttpError(400, '请求内容无法读取，请重新提交。'); }
      }
    }
    const result = await transact(state => operate(state, request, path, body));
    if ((result.status ?? 200) === 200 && request.method === 'DELETE' && path.startsWith('moments/')) await cleanupPendingMedia(path.slice(8));
    if (request.method === 'GET' && path === 'snapshot') await cleanupPendingMedia().catch(() => {});
    const headers: Record<string, string> = { ...noCache };
    if (result.cookie !== undefined) headers['Set-Cookie'] = `moments_session=${result.cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${result.cookie ? 30 * 86400 : 0}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
    return Response.json(result.data, { status: result.status || 200, headers });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status, headers: noCache });
    // Log only a sanitized category: SDK errors may contain signed storage URLs.
    console.error('MOMENTS request failed:', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: '暂时未能完成，请稍后重试。若持续失败，请联系旅行主人检查服务配置。' }, { status: 500, headers: noCache });
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
