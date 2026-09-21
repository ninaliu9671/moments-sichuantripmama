import { createServer } from 'node:http';

const PUBLIC_ORIGIN = process.env.MOMENTS_PUBLIC_URL || 'https://sichuantripmama-d8furc3w318e17b0-1491690992.ap-shanghai.app.tcloudbase.com';
const STORAGE_ORIGIN = `https://${process.env.CLOUDBASE_ENV_ID || 'sichuantripmama-d8furc3w318e17b0'}.api.tcloudbasegateway.com`;
const MAX_FILE = 100 * 1024 * 1024;
const MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/aac',
]);

function reply(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/media-upload/health')) {
    return reply(res, 200, { ok: true });
  }
  if (req.method !== 'PUT') return reply(res, 405, { error: '不支持此操作。' });
  if (req.headers.origin !== PUBLIC_ORIGIN) return reply(res, 403, { error: '上传来源不正确，请从旅行页面重试。' });
  const mime = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
  const length = Number(req.headers['content-length']);
  if (!MIMES.has(mime)) return reply(res, 400, { error: '暂不支持此媒体格式。' });
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_FILE) {
    return reply(res, 413, { error: '请选择 100MB 以内的照片、视频或语音。' });
  }
  if (!req.headers.cookie) return reply(res, 401, { error: '请重新登录后上传。' });

  try {
    const ticketResponse = await fetch(`${PUBLIC_ORIGIN}/api/upload-ticket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': PUBLIC_ORIGIN,
        'Cookie': req.headers.cookie,
      },
      body: JSON.stringify({ mime }),
      signal: AbortSignal.timeout(30_000),
    });
    const ticket = await ticketResponse.json().catch(() => ({}));
    if (!ticketResponse.ok || !ticket.objectKey || !ticket.uploadUrl) {
      return reply(res, ticketResponse.status === 401 ? 401 : 403, { error: ticket.error || '未能取得上传权限，请重新登录后再试。' });
    }
    const url = new URL(ticket.uploadUrl);
    if (url.origin !== STORAGE_ORIGIN || !url.pathname.startsWith('/v1/storages/object/upload/sign/moments/') || !url.searchParams.has('token')) {
      throw new Error('云存储上传链接不正确');
    }
    const storageResponse = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': mime, 'Content-Length': String(length) },
      body: req,
      duplex: 'half',
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!storageResponse.ok) {
      console.error('Storage upload failed', storageResponse.status, (await storageResponse.text()).slice(0, 300));
      return reply(res, 502, { error: `云存储上传失败（HTTP ${storageResponse.status}）。` });
    }
    return reply(res, 200, { objectKey: ticket.objectKey });
  } catch (error) {
    console.error('Media upload proxy failed', error);
    if (!res.headersSent) return reply(res, 502, { error: '上传服务暂时不可用，请稍后重试。' });
    res.end();
  }
});

server.requestTimeout = 10 * 60_000;
server.listen(9000, '0.0.0.0');
