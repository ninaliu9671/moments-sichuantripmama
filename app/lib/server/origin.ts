import { requireValue } from './auth';
export function validateOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const target = new URL(request.url);
  const allowed = new Set([new URL(process.env.MOMENTS_PUBLIC_URL || request.url).origin]);
  if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) allowed.add(`${target.protocol}//${host}${target.port ? ':' + target.port : ''}`);
  }
  requireValue(!origin || allowed.has(origin), '请求来源不正确，请重新打开旅行空间。', 403);
  requireValue(request.headers.get('sec-fetch-site') !== 'cross-site', '不能从其他网站发起此操作。', 403);
}
