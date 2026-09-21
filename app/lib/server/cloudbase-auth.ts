// Server-side helper that mints a short-lived CloudBase custom-login ticket.
// The browser exchanges it for a real CloudBase identity so it can upload
// media straight to cloud storage (the cloud function cannot carry large
// payloads).
//
// The private key file is generated in the console under
// 身份认证 → 登录方式 → 自定义登录 → 下载私钥, and must be placed on the
// server only. Never ship it to the browser.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Credentials = { env_id: string; private_key_id: string; private_key: string };

let cached: Credentials | undefined;

async function loadCredentials(): Promise<Credentials | undefined> {
  const inline = process.env.MOMENTS_CUSTOM_LOGIN_KEY;
  if (inline) {
    try { return JSON.parse(inline) as Credentials; }
    catch { throw new Error('MOMENTS_CUSTOM_LOGIN_KEY 不是合法的 JSON。'); }
  }
  const file = process.env.MOMENTS_CUSTOM_LOGIN_KEY_FILE || '.secrets/tcb_custom_login.json';
  try {
    cached ??= JSON.parse(await readFile(resolve(process.cwd(), file), 'utf8')) as Credentials;
    return cached;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

// CloudBase requires a custom user id of 4-32 chars from
// [A-Za-z0-9_-#@(){}[]:.,+#~]; a UUID has to lose its dashes to fit (32 chars).
export function customUserId(memberId: string) {
  return memberId.replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 32);
}

export async function createTicket(memberId: string): Promise<string> {
  const credentials = await loadCredentials();
  if (!credentials?.private_key || !credentials.private_key_id || !credentials.env_id || credentials.env_id !== process.env.CLOUDBASE_ENV_ID) {
    throw new Error('自定义登录私钥缺失或与云环境不匹配，无法上传。');
  }
  const { default: sdk } = await import('@cloudbase/node-sdk');
  const app = sdk.init({ env: process.env.CLOUDBASE_ENV_ID!, credentials });
  return app.auth().createTicket(customUserId(memberId), { refresh: 3600 * 1000 });
}

export async function ticketAvailable() {
  const credentials = await loadCredentials();
  return !!(credentials?.private_key && credentials.private_key_id && credentials.env_id === process.env.CLOUDBASE_ENV_ID);
}
