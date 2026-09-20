export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: method || (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await response.json().catch(() => ({ error: '暂时没有连上，请稍后重试。' })) as { error?: string };
  if (!response.ok) throw new ApiError(data.error || '暂时没有完成，请重试。', response.status);
  return data as T;
}
