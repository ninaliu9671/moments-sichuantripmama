import { digest } from '../lib/server/auth';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, type State } from '../lib/server/store';
import { operate, type Result } from '../lib/server/service';
import type { AuthResult, Comment, Moment, Snapshot } from '../lib/types';

const setupKey = 'service-test-initialization-key';
process.env.MOMENTS_SETUP_KEY = setupKey;

function call(state: State, method: string, path: string, body: Record<string, unknown> = {}, cookie?: string): Result {
  const request = new Request(`https://moments.test/api/${path}`, { method, headers: cookie ? { cookie: `moments_session=${cookie}` } : undefined });
  return operate(state, request, path.split('?')[0], body);
}
function success<T>(result: Result): T {
  assert.equal(result.status ?? 200, 200, JSON.stringify(result.data));
  return result.data as T;
}
function rejected(result: Result, status: number) {
  assert.equal(result.status, status, JSON.stringify(result.data));
  assert.ok((result.data as { error?: string }).error);
}
function identity(state: State, name: string) {
  const result = call(state, 'POST', 'auth/join', { token: state.invite.token, name, avatar: 2, password: 'test5678' });
  const auth = success<AuthResult>(result);
  assert.ok(result.cookie);
  return { ...auth, cookie: result.cookie };
}
function fixture() {
  const state = emptyState();
  const result = call(state, 'POST', 'auth/setup', { setupKey, name: '旅行主人', avatar: 1, password: 'test1234' });
  const owner = { ...success<AuthResult>(result), cookie: result.cookie! };
  const traveler = identity(state, '同行家人');
  success(call(state, 'PATCH', `members/${traveler.user.id}`, { role: 'traveler' }, owner.cookie));
  const family = identity(state, '远方亲友');
  success(call(state, 'PATCH', `members/${family.user.id}`, { role: 'family' }, owner.cookie));
  family.user.role = 'family';
  return { state, owner, traveler, family };
}
function record(state: State, cookie: string, text = '今天看到了好风景') {
  return success<Moment>(call(state, 'POST', 'moments', { text, mediaIds: [], placeId: null, subplace: '' }, cookie));
}

test('fresh spaces have real itinerary but no invented members, visits, or comments', () => {
  const state = emptyState();
  assert.equal(state.trip.startDate, '2026-09-21');
  assert.equal(state.trip.endDate, '2026-09-28');
  assert.equal(state.trip.days.length, 8);
  for (const key of ['members', 'moments', 'comments', 'reactions', 'media'] as const) assert.equal(state[key].length, 0);
  rejected(call(state, 'GET', 'snapshot'), 401);
  rejected(call(state, 'GET', 'invite?token=unknown'), 401);
});

test('three roles have distinct creation and management rights; client role claims are ignored', () => {
  const { state, owner, traveler, family } = fixture();
  assert.equal(family.user.role, 'family');
  record(state, owner.cookie);
  record(state, traveler.cookie);
  rejected(call(state, 'POST', 'moments', { text: '不能发布', mediaIds: [], role: 'owner' }, family.cookie), 403);
  for (const member of [traveler, family]) {
    rejected(call(state, 'GET', 'manage/invite', {}, member.cookie), 404);
    rejected(call(state, 'PATCH', `members/${family.user.id}`, { role: 'traveler' }, member.cookie), 403);
    rejected(call(state, 'PATCH', 'trip', { title: '冒用修改' }, member.cookie), 403);
    assert.equal(success<Snapshot>(call(state, 'GET', 'snapshot', {}, member.cookie)).moments.length, 2);
  }
  rejected(call(state, 'PATCH', `members/${owner.user.id}`, { role: 'family' }, owner.cookie), 400);
  assert.equal(success<Snapshot>(call(state, 'GET', 'snapshot', {}, owner.cookie)).me.role, 'owner');
});

test('only the author may edit/delete, including against owner; demotion takes effect on existing sessions', () => {
  const { state, owner, traveler, family } = fixture();
  const moment = record(state, traveler.cookie);
  for (const member of [owner, family]) {
    rejected(call(state, 'PATCH', `moments/${moment.id}`, { text: '篡改', mediaIds: [] }, member.cookie), 403);
    rejected(call(state, 'DELETE', `moments/${moment.id}`, {}, member.cookie), 403);
  }
  const updated = success<Moment>(call(state, 'PATCH', `moments/${moment.id}`, { text: '补记', mediaIds: [] }, traveler.cookie));
  assert.equal(updated.text, '补记');
  assert.equal(updated.createdAt, moment.createdAt);
  success(call(state, 'PATCH', `members/${traveler.user.id}`, { role: 'family' }, owner.cookie));
  rejected(call(state, 'PATCH', `moments/${moment.id}`, { text: '降级后编辑', mediaIds: [] }, traveler.cookie), 403);
  rejected(call(state, 'DELETE', `moments/${moment.id}`, {}, traveler.cookie), 403);
  success(call(state, 'PATCH', `members/${traveler.user.id}`, { role: 'traveler' }, owner.cookie));
  success(call(state, 'DELETE', `moments/${moment.id}`, {}, traveler.cookie));
  assert.equal(state.moments.length, 0);
});

test('family comments and reactions work, replies stay on the same moment and one level deep', () => {
  const { state, owner, traveler, family } = fixture();
  const first = record(state, traveler.cookie);
  const second = record(state, owner.cookie);
  const comment = success<Comment>(call(state, 'POST', 'comments', { momentId: first.id, body: '真漂亮！', parentId: null, authorId: owner.user.id }, family.cookie));
  assert.equal(comment.authorId, family.user.id);
  const reply = success<Comment>(call(state, 'POST', 'comments', { momentId: first.id, body: '谢谢！', parentId: comment.id }, traveler.cookie));
  assert.equal(reply.parentId, comment.id);
  rejected(call(state, 'POST', 'comments', { momentId: second.id, body: '跨记录回复', parentId: comment.id }, owner.cookie), 400);
  rejected(call(state, 'POST', 'comments', { momentId: first.id, body: '第二层回复', parentId: reply.id }, owner.cookie), 400);
  rejected(call(state, 'POST', 'comments', { momentId: first.id, body: '  ' }, family.cookie), 400);
  const reaction = { momentId: first.id, emoji: '❤️', userId: owner.user.id };
  success(call(state, 'POST', 'reactions', reaction, family.cookie));
  assert.equal(state.reactions[0].userId, family.user.id);
  success(call(state, 'POST', 'reactions', reaction, family.cookie));
  assert.equal(state.reactions.length, 0);
  success(call(state, 'POST', 'reactions', reaction, family.cookie));
  success(call(state, 'DELETE', `moments/${first.id}`, {}, traveler.cookie));
  assert.equal(state.comments.length, 0);
  assert.equal(state.reactions.length, 0);
  rejected(call(state, 'POST', 'comments', { momentId: first.id, body: '已删除' }, family.cookie), 404);
});

test('five wrong PINs persist and the sixth attempt is throttled even with the correct PIN', () => {
  const { state, family } = fixture();
  const body = { token: state.invite.token, name: family.user.name, password: 'wrong0000' };
  for (let attempt = 1; attempt <= 5; attempt++) {
    rejected(call(state, 'POST', 'auth/login', body), 403);
    assert.equal(state.attempts[`login:${digest(family.user.name.toLowerCase())}`].count, attempt);
  }
  rejected(call(state, 'POST', 'auth/login', { ...body, password: 'test5678' }), 429);
  state.attempts[`login:${digest(family.user.name.toLowerCase())}`].until = Date.now() - 1;
  success(call(state, 'POST', 'auth/login', { ...body, password: 'test5678' }));
  assert.equal(state.attempts[`login:${digest(family.user.name.toLowerCase())}`], undefined);
});

test('recovery is single-use, changes PIN, and invalidates all prior sessions immediately', () => {
  const { state, family } = fixture();
  const result = call(state, 'POST', 'auth/recover', { token: state.invite.token, name: family.user.name, recoveryCode: family.recoveryCode, password: 'test2468' });
  const recovered = success<AuthResult>(result);
  assert.ok(recovered.recoveryCode);
  assert.notEqual(recovered.recoveryCode, family.recoveryCode);
  rejected(call(state, 'GET', 'snapshot', {}, family.cookie), 401);
  success(call(state, 'GET', 'snapshot', {}, result.cookie));
  rejected(call(state, 'POST', 'auth/recover', { token: state.invite.token, name: family.user.name, recoveryCode: family.recoveryCode, password: 'test1111' }), 403);
  rejected(call(state, 'POST', 'auth/login', { token: state.invite.token, name: family.user.name, password: 'test5678' }), 403);
  success(call(state, 'POST', 'auth/login', { token: state.invite.token, name: family.user.name, password: 'test2468' }));
});

test('deactivation immediately revokes cookies; reactivation requires a fresh login', () => {
  const { state, owner, traveler } = fixture();
  success(call(state, 'PATCH', `members/${traveler.user.id}`, { status: 'left' }, owner.cookie));
  rejected(call(state, 'GET', 'snapshot', {}, traveler.cookie), 401);
  rejected(call(state, 'POST', 'moments', { text: '停用后发布', mediaIds: [] }, traveler.cookie), 401);
  success(call(state, 'PATCH', `members/${traveler.user.id}`, { status: 'active' }, owner.cookie));
  rejected(call(state, 'GET', 'snapshot', {}, traveler.cookie), 401);
  const login = call(state, 'POST', 'auth/login', { token: state.invite.token, name: traveler.user.name, password: 'test5678' });
  success(login);
  success(call(state, 'GET', 'snapshot', {}, login.cookie));
});

test('snapshots expose no PIN/recovery hashes, invitation secret, session tokens, or private media keys', () => {
  const { state, owner, traveler, family } = fixture();
  const media = { id: 'private-photo', type: 'photo' as const, url: '/api/media/private-photo', duration: 0, name: '照片.jpg', mime: 'image/jpeg', size: 2, sha256: 'checksum', ownerId: traveler.user.id, objectKey: 'secret-cloud-object-key', momentId: null };
  state.media.push(media);
  success(call(state, 'POST', 'moments', { text: '照片', mediaIds: [media.id] }, traveler.cookie));
  for (const member of [owner, traveler, family]) {
    const data = success<Snapshot>(call(state, 'GET', 'snapshot', {}, member.cookie));
    const json = JSON.stringify(data);
    for (const forbidden of ['pinHash', 'recoveryHash', 'sessions', 'attempts', 'objectKey', media.objectKey, owner.recoveryCode!, traveler.cookie]) assert.ok(!json.includes(forbidden), forbidden);
    assert.equal(data.moments[0].media[0].url, media.url);
  }
});

test('itinerary changes update every destination day index without marking a visit', () => {
  const { state, owner } = fixture();
  const a = state.places[0].id, b = state.places[1].id;
  success(call(state, 'PATCH', 'trip', { title: '调整后的旅行', startDate: '2026-09-21', endDate: '2026-09-23', days: [
    { date: '2026-09-21', title: '第一站', placeIds: [b, b] },
    { date: '2026-09-22', title: '返回', placeIds: [a] },
    { date: '2026-09-23', title: '再访', placeIds: [b] },
  ] }, owner.cookie));
  assert.deepEqual(state.places.find(p => p.id === a)!.dayIndices, [2]);
  assert.deepEqual(state.places.find(p => p.id === b)!.dayIndices, [1, 3]);
  assert.deepEqual(state.trip.days[0].placeIds, [b]);
  for (const place of state.places.filter(p => p.id !== a && p.id !== b)) assert.deepEqual(place.dayIndices, []);
  assert.equal(state.moments.length, 0);
});

test('invalid compound mutations preserve all business state atomically', () => {
  const { state, owner, traveler } = fixture();
  const before = structuredClone(state);
  rejected(call(state, 'PATCH', `members/${traveler.user.id}`, { role: 'family', status: 'invalid' }, owner.cookie), 400);
  assert.deepEqual(state, before);
  rejected(call(state, 'PATCH', 'profile', { name: '不应保存的新名字', avatar: 99 }, owner.cookie), 400);
  assert.deepEqual(state, before);
  rejected(call(state, 'PATCH', 'trip', { title: '不应保存的行程', startDate: '2026-09-21', endDate: '2026-09-28', days: [state.trip.days[0], { date: '2026-09-22', title: '错误地点', placeIds: ['missing'] }] }, owner.cookie), 400);
  assert.deepEqual(state, before);
  rejected(call(state, 'POST', 'moments', { text: '失败记录', mediaIds: ['not-uploaded'], customPlace: '不得留下孤立地点' }, traveler.cookie), 400);
  assert.deepEqual(state, before);
});
