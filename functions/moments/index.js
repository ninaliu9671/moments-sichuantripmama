// CloudBase HTTP cloud function entry.
// Converts the HTTP access event into a standard Request, hands it to the
// existing catch-all handler (bundle.mjs), and converts the Response back.
import { handle } from './bundle.mjs';

const SAFE_METHODS = new Set(['GET', 'HEAD']);

function text(value, fallback = '') {
  return typeof value === 'string' && value.length ? value : fallback;
}

function normalizePath(rawPath) {
  let path = text(rawPath, '/');
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/^\/+/, '');
  // The HTTP access service may keep or strip the /api prefix.
  if (path === 'api' || path.startsWith('api/')) path = path.slice(path === 'api' ? 3 : 4);
  return path;
}

function toBuffer(body, isBase64) {
  if (body === undefined || body === null || body === '') return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, isBase64 ? 'base64' : 'utf8');
  return Buffer.from(JSON.stringify(body));
}

export async function main(event = {}, context) {
  const method = text(event.httpMethod || event.method, 'GET').toUpperCase();
  const path = normalizePath(event.path || event.requestContext?.path);
  const host = text(event.headers?.host, 'moments.internal');
  const search = new URLSearchParams(event.queryStringParameters || {}).toString();
  const url = `https://${host}/api/${path}${search ? `?${search}` : ''}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers || {})) {
    if (value !== undefined && value !== null) headers.set(key, String(value));
  }

  const body = SAFE_METHODS.has(method) ? undefined : toBuffer(event.body, event.isBase64Encoded === true);
  const request = new Request(url, { method, headers, body });

  const response = await handle(request, { params: Promise.resolve({ path: path.split('/').filter(Boolean) }) });

  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-length') return;
    responseHeaders[key] = value;
  });

  const bytes = Buffer.from(await response.arrayBuffer());
  // Binary payloads (archive downloads) must travel base64-encoded.
  const isBinary = !/^text\/|^application\/(json|javascript|xml)/.test(response.headers.get('content-type') || '');
  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: bytes.toString(isBinary ? 'base64' : 'utf8'),
    isBase64Encoded: isBinary,
  };
}

export default main;
