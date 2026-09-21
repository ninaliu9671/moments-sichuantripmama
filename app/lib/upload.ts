import { apiUrl } from './api-base';

type Ticket = { ticket: string; userId: string; error?: string };

function extensionFor(name: string, mime: string) {
  const fromName = /\.[A-Za-z0-9]{1,8}$/.exec(name)?.[0];
  if (fromName) return fromName.toLowerCase();
  if (mime.includes('jpeg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('mp4')) return '.mp4';
  if (mime.includes('webm')) return '.webm';
  return '';
}

async function uploadIdentity(): Promise<Ticket> {
  const response = await fetch(apiUrl('/api/upload-ticket'), { method: 'POST', credentials: 'same-origin' });
  const data = await response.json().catch(() => ({})) as Partial<Ticket>;
  if (!response.ok || !data.ticket || !data.userId) {
    throw new Error(data.error || '未能取得上传权限，请重新登录后再试。');
  }
  return data as Ticket;
}

/** Upload to the private PG bucket; only the user's own folder is writable by RLS. */
export async function uploadToStorage(file: File, onProgress?: (percent: number) => void) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const identity = await uploadIdentity();
  const { default: cloudbase } = await import('@cloudbase/js-sdk');
  const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID;
  if (!envId) throw new Error('未配置云环境 ID，无法上传媒体。');
  const app = cloudbase.init({ env: envId, region: process.env.NEXT_PUBLIC_CLOUDBASE_REGION || 'ap-shanghai' });
  let firstTicket = identity.ticket;
  await app.auth().signInWithCustomTicket(async () => {
    if (firstTicket) { const ticket = firstTicket; firstTicket = ''; return ticket; }
    return (await uploadIdentity()).ticket;
  });
  const objectKey = `${identity.userId}/${crypto.randomUUID()}${extensionFor(file.name, file.type)}`;
  onProgress?.(0);
  const { error } = await app.storage.from('moments').upload(objectKey, file, { contentType: file.type });
  if (error) throw new Error(`文件上传失败：${error.message}`);
  onProgress?.(100);
  return { objectKey, sha256 };
}
