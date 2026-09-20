import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { State, PrivateMember } from './store';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function requireValue(condition: unknown, message: string, status = 400): asserts condition { if (!condition) throw new HttpError(status, message); }
export const token = () => randomBytes(24).toString('base64url');
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function hashSecret(value: string) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(value, salt, 32).toString('hex')}`; }
export function checkSecret(value: string, encoded: string) {
  const [salt, hash] = encoded.split(':');
  if (!salt || !hash || hash.length !== 64) return false;
  return timingSafeEqual(scryptSync(value, salt, 32), Buffer.from(hash, 'hex'));
}
export function publicMember(member: PrivateMember) {
  const { id, name, avatar, role, status, joinedAt } = member;
  return { id, name, avatar, role, status, joinedAt };
}
export function sessionToken(request: Request) {
  return /(?:^|;\s*)moments_session=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
}
export function currentMember(state: State, request: Request) {
  const session = state.sessions.find(s => s.hash === digest(sessionToken(request)) && s.expires > Date.now());
  const member = session && state.members.find(m => m.id === session.memberId && m.status === 'active');
  requireValue(member, '登录已失效，请用昵称和密码重新登录。', 401);
  return member;
}
export function owner(member: PrivateMember) { requireValue(member.role === 'owner', '只有旅行主人可以操作。', 403); }
export function writer(member: PrivateMember) { requireValue(member.role !== 'family', '请让旅行主人将你设为旅行者后记录。', 403); }
export function validInvite(state: State, value: unknown) { requireValue(typeof value === 'string' && !!value && state.invite.enabled && digest(value) === digest(state.invite.token), '邀请已失效，请向旅行主人索取新邀请。', 403); }
export function text(value: unknown, max: number, label: string, empty = false): string {
  requireValue(typeof value === 'string', `请填写${label}。`);
  const result = value.trim(); requireValue((empty || result.length > 0) && result.length <= max, `${label}需要${empty ? '不超过' : '1–'}${max}个字。`); return result;
}
export function pin(value: unknown): string { requireValue(typeof value === 'string' && value.length >= 6 && value.length <= 128, '密码需要 6–128 个字符。'); return value; }
export function nickname(value: unknown): string { return text(value, 24, '昵称').normalize('NFKC').toLowerCase(); }
export function avatar(value: unknown): number { requireValue(Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 16, '请选择一个头像。'); return Number(value); }
export function limited(state: State, key: string, maximum: number, milliseconds = 15 * 60 * 1000): boolean {
  const now = Date.now();
  for (const [id, entry] of Object.entries(state.attempts)) if (entry.until <= now) delete state.attempts[id];
  const entry = state.attempts[key] ??= { count: 0, until: now + milliseconds };
  entry.count++;
  return entry.count > maximum;
}
export function startSession(state: State, memberId: string) {
  const raw = token();
  state.sessions = state.sessions.filter(s => s.expires > Date.now());
  state.sessions.push({ hash: digest(raw), memberId, expires: Date.now() + 30 * 86400_000 });
  return raw;
}
