import { apiUrl } from './api-base';

type Ticket = { token: string; objectKey: string; error?: string };

async function uploadIdentity(file: File): Promise<Ticket> {
  const response = await fetch(apiUrl('/api/upload-ticket'), {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mime: file.type }),
  });
  const data = await response.json().catch(() => ({})) as Partial<Ticket>;
  if (!response.ok || !data.token || !data.objectKey) {
    throw new Error(data.error || '未能取得上传权限，请重新登录后再试。');
  }
  return data as Ticket;
}

/** Upload to the private PG bucket; only the user's own folder is writable by RLS. */
export async function uploadToStorage(file: File, onProgress?: (percent: number) => void) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const identity = await uploadIdentity(file);
  const { default: cloudbase } = await import('@cloudbase/js-sdk');
  const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  if (!envId) throw new Error('未配置云环境 ID，无法上传媒体。');
  const app = cloudbase.init({ env: envId, region: process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai' });
  onProgress?.(0);
  const { error } = await app.storage.from('moments').uploadToSignedUrl(identity.objectKey, identity.token, file, { contentType: file.type });
  if (error) throw new Error(`文件上传失败：${error.message}`);
  onProgress?.(100);
  return { objectKey: identity.objectKey, sha256 };
}
