import { randomUUID } from 'node:crypto';
import type { State, StoredMedia } from './store';
import { avatar, checkSecret, currentMember, digest, hashSecret, HttpError, limited, owner, pin, publicMember, requireValue, startSession, text, token, writer, nickname } from './auth';
import { emojiOptions } from '../types';

type Input = Record<string, unknown>;
export type Result = { data: unknown; cookie?: string; status?: number };
export function snapshot(state: State, request: Request) {
  const me = currentMember(state, request);
  return { trip: state.trip, me: publicMember(me), members: state.members.map(publicMember), places: state.places, moments: state.moments, comments: state.comments, reactions: state.reactions };
}
function publicMedia(item: StoredMedia) {
  const { id, type, url, duration, name, mime, size, sha256 } = item;
  return { id, type, url, duration, name, mime, size, sha256 };
}
function doOperation(state: State, request: Request, path: string, body: Input): Result {
  const method = request.method;
  if (method === 'GET' && path === 'public') return { data: { title: state.trip.title, startDate: state.trip.startDate, endDate: state.trip.endDate, initialized: state.members.length > 0, canSetup: !state.members.length } };
  if (method === 'POST' && path.startsWith('auth/') && path !== 'auth/logout') {
    const action = path.slice(5);
    requireValue(['setup', 'join', 'login', 'recover'].includes(action), '页面不存在。', 404);
    const name = text(body.name, 24, '昵称'), key = nickname(name);
    const existing = state.members.find(m => nickname(m.name) === key);
    if (action === 'setup' || action === 'join') {
      requireValue(!existing, '这个昵称已被使用，请换一个，或用它登录。', 409);
      const image = avatar(body.avatar), secret = pin(body.password);
      const recoveryCode = token();
      const member = { id: randomUUID(), name, avatar: image, role: state.members.length === 0 ? 'owner' as const : 'traveler' as const, status: 'active' as const, joinedAt: new Date().toISOString(), pinHash: hashSecret(secret), recoveryHash: hashSecret(recoveryCode) };
      state.members.push(member);
      return { data: { user: publicMember(member), recoveryCode }, cookie: startSession(state, member.id) };
    }
    const limitKey = `${action}:${digest(key)}`;
    requireValue(!limited(state, limitKey, 5), '尝试过多，请 15 分钟后再试。', 429);
    requireValue(existing && existing.status === 'active', '昵称或密码不正确，或账号已停用。', 403);
    if (action === 'login') {
      requireValue(checkSecret(text(body.password, 128, '密码'), existing.pinHash), '昵称或密码不正确，请重试或使用恢复码。', 403);
      delete state.attempts[limitKey];
      return { data: { user: publicMember(existing) }, cookie: startSession(state, existing.id) };
    }
    const recovery = text(body.recoveryCode, 100, '恢复码'), newPassword = pin(body.password);
    requireValue(checkSecret(recovery, existing.recoveryHash), '恢复码不正确或已使用。', 403);
    const recoveryCode = token();
    existing.pinHash = hashSecret(newPassword); existing.recoveryHash = hashSecret(recoveryCode);
    state.sessions = state.sessions.filter(s => s.memberId !== existing.id);
    delete state.attempts[limitKey]; delete state.attempts[`login:${digest(key)}`];
    return { data: { user: publicMember(existing), recoveryCode }, cookie: startSession(state, existing.id) };
  }
  if (method === 'POST' && path === 'auth/logout') {
    const raw = /(?:^|;\s*)moments_session=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
    state.sessions = state.sessions.filter(s => s.hash !== digest(raw));
    return { data: { ok: true }, cookie: '' };
  }
  const me = currentMember(state, request);
  if (method === 'GET' && path === 'snapshot') return { data: snapshot(state, request) };
  if (method === 'PATCH' && path === 'profile') {
    const name = text(body.name, 24, '昵称'), image = avatar(body.avatar);
    requireValue(!state.members.some(m => m.id !== me.id && nickname(m.name) === nickname(name)), '这个昵称已被使用，请换一个。', 409);
    me.name = name; me.avatar = image;
    return { data: publicMember(me) };
  }
  if (method === 'PATCH' && path.startsWith('members/')) {
    owner(me);
    const target = state.members.find(m => m.id === path.slice(8));
    requireValue(target && target.role !== 'owner', '不能修改旅行主人或不存在的成员。', 400);
    if (body.role !== undefined) requireValue(body.role === 'family' || body.role === 'traveler', '角色不正确。');
    if (body.status !== undefined) requireValue(body.status === 'active' || body.status === 'left', '成员状态不正确。');
    if (body.role) target.role = body.role as 'family' | 'traveler';
    if (body.status) target.status = body.status as 'active' | 'left';
    if (target.status === 'left') state.sessions = state.sessions.filter(s => s.memberId !== target.id);
    return { data: publicMember(target) };
  }
  if (method === 'PATCH' && path === 'trip') {
    owner(me);
    const title = text(body.title, 40, '旅行名称');
    const startDate = text(body.startDate, 10, '出发日期'), endDate = text(body.endDate, 10, '结束日期');
    const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
    requireValue(validDate(startDate) && validDate(endDate) && endDate >= startDate, '请填写正确的起止日期。');
    requireValue(Array.isArray(body.days) && body.days.length > 0 && body.days.length <= 31, '请填写 1–31 天行程。');
    const days = body.days.map((raw, index) => {
      requireValue(raw && typeof raw === 'object', '行程格式不正确。');
      const item = raw as Input, date = text(item.date, 10, '行程日期');
      requireValue(validDate(date) && date >= startDate && date <= endDate, '行程日期须位于旅行日期内。');
      requireValue(Array.isArray(item.placeIds) && item.placeIds.every(id => state.places.some(p => p.id === id)), '行程地点不存在。');
      return { day: index + 1, date, title: text(item.title, 100, '行程标题'), placeIds: [...new Set(item.placeIds)] as string[] };
    });
    requireValue(days.every((day, index) => index === 0 || day.date > days[index - 1].date), '每天的行程日期须按先后排列，且不能重复。');
    state.trip = { ...state.trip, title, startDate, endDate, days };
    for (const place of state.places) place.dayIndices = days.filter(day => day.placeIds.includes(place.id)).map(day => day.day);
    return { data: state.trip };
  }
  if ((method === 'POST' && path === 'moments') || (['PATCH', 'DELETE'].includes(method) && path.startsWith('moments/'))) {
    writer(me);
    const existing = path.startsWith('moments/') ? state.moments.find(m => m.id === path.slice(8)) : undefined;
    if (path !== 'moments') requireValue(existing && existing.authorId === me.id, '只能修改或删除自己的记录。', 403);
    if (method === 'DELETE') {
      state.moments = state.moments.filter(m => m.id !== existing!.id);
      state.comments = state.comments.filter(c => c.momentId !== existing!.id);
      state.reactions = state.reactions.filter(r => r.momentId !== existing!.id);
      state.media.forEach(m => { if (m.momentId === existing!.id) m.momentId = null; });
      return { data: { ok: true } };
    }
    const content = text(body.text ?? '', 10000, '记录', true), subplace = text(body.subplace ?? '', 80, '细分地点', true);
    requireValue(Array.isArray(body.mediaIds) && body.mediaIds.length <= 20 && new Set(body.mediaIds).size === body.mediaIds.length, '每条记录最多 20 个媒体，且不能重复。');
    const media = body.mediaIds.map(id => {
      const item = state.media.find(m => m.id === id);
      requireValue(item && item.ownerId === me.id && (!item.momentId || item.momentId === existing?.id), '媒体未上传完成或不属于此记录。'); return item;
    });
    requireValue(content || media.length, '写一点文字，或添加照片、视频、语音。');
    let placeId = body.placeId || null;
    requireValue(placeId === null || (typeof placeId === 'string' && state.places.some(p => p.id === placeId)), '选择的地点不存在。');
    if (body.customPlace) {
      const name = text(body.customPlace, 40, '自定义地点');
      let place = state.places.find(p => p.name === name);
      if (!place) { place = { id: randomUUID(), name, subtitle: '家人添加的地点', dayIndices: [], mapX: 50, mapY: 50, subplaces: [] }; state.places.push(place); }
      placeId = place.id;
    }
    const now = new Date().toISOString();
    const moment = { id: existing?.id || randomUUID(), authorId: me.id, text: content, placeId: placeId as string | null, subplace, media: media.map(publicMedia), createdAt: existing?.createdAt || now, updatedAt: now };
    state.media.forEach(m => { if (m.momentId === moment.id) m.momentId = null; });
    media.forEach(m => { m.momentId = moment.id; });
    if (existing) state.moments[state.moments.indexOf(existing)] = moment; else state.moments.unshift(moment);
    return { data: moment };
  }
  if (method === 'POST' && (path === 'comments' || path === 'reactions')) {
    const momentId = text(body.momentId, 80, '记录');
    requireValue(state.moments.some(m => m.id === momentId), '这条记录已删除，请刷新。', 404);
    if (path === 'comments') {
      const content = text(body.body, 2000, '评论');
      const parentId = body.parentId || null;
      requireValue(parentId === null || state.comments.some(c => c.id === parentId && c.momentId === momentId && c.parentId === null), '请回复此记录中的一级评论。');
      const comment = { id: randomUUID(), momentId, authorId: me.id, body: content, parentId: parentId as string | null, createdAt: new Date().toISOString() };
      state.comments.push(comment); return { data: comment };
    }
    requireValue(emojiOptions.includes(String(body.emoji)), '不支持的表情。');
    const index = state.reactions.findIndex(r => r.userId === me.id && r.momentId === momentId && r.emoji === body.emoji);
    if (index >= 0) state.reactions.splice(index, 1); else state.reactions.push({ momentId, userId: me.id, emoji: String(body.emoji) });
    return { data: { ok: true } };
  }
  throw new HttpError(404, '此操作不存在。');
}

// Business failures roll back partially changed data, while failed PIN attempts
// must still be persisted so restarting/scaling a container cannot reset limits.
export function operate(state: State, request: Request, path: string, body: Input): Result {
  const working = structuredClone(state);
  try { const result = doOperation(working, request, path, body); Object.assign(state, working); return result; }
  catch (error) {
    if (!(error instanceof HttpError)) throw error;
    state.attempts = working.attempts;
    return { data: { error: error.message }, status: error.status };
  }
}
