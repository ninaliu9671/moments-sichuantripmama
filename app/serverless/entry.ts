// Bundled into one CommonJS file for the CloudBase Event runtime.
import { GET as handle } from '../app/api/[...path]/route';

const SAFE_METHODS = new Set(['GET', 'HEAD']);
const text = (value: unknown, fallback = '') => typeof value === 'string' && value.length ? value : fallback;
function normalizePath(rawPath: unknown) {
  let path = text(rawPath, '/');
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/^\/+/, '');
  if (path === 'api' || path.startsWith('api/')) path = path.slice(path === 'api' ? 3 : 4);
  return path;
}
function toBuffer(body: unknown, isBase64: boolean) {
  if (body === undefined || body === null || body === '') return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, isBase64 ? 'base64' : 'utf8');
  return Buffer.from(JSON.stringify(body));
}
type GatewayEvent = { httpMethod?: string; method?: string; path?: string; requestContext?: { path?: string }; headers?: Record<string, unknown>; queryStringParameters?: Record<string, string>; body?: unknown; isBase64Encoded?: boolean };
export async function main(event: GatewayEvent = {}) {
  const method = text(event.httpMethod || event.method, 'GET').toUpperCase();
  const path = normalizePath(event.path || event.requestContext?.path);
  const host = text(event.headers?.host, 'moments.internal');
  const search = new URLSearchParams(event.queryStringParameters || {}).toString();
  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers || {})) if (value !== undefined && value !== null) headers.set(key, String(value));
  const body = SAFE_METHODS.has(method) ? undefined : toBuffer(event.body, event.isBase64Encoded === true);
  const request = new Request(`https://${host}/api/${path}${search ? `?${search}` : ''}`, { method, headers, body: body ? new Uint8Array(body) : undefined });
  const response = await handle(request, { params: Promise.resolve({ path: path.split('/').filter(Boolean) }) });
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => { if (key.toLowerCase() !== 'content-length') responseHeaders[key] = value; });
  const bytes = Buffer.from(await response.arrayBuffer());
  const isBinary = !/^text\/|^application\/(json|javascript|xml)/.test(response.headers.get('content-type') || '');
  return { statusCode: response.status, headers: responseHeaders, body: bytes.toString(isBinary ? 'base64' : 'utf8'), isBase64Encoded: isBinary };
}
