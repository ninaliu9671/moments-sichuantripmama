import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import JSZip from 'jszip';
import { createArchive } from '../lib/server/archive';
import type { Snapshot } from '../lib/types';

const original = new TextEncoder().encode('original photograph bytes');
const sha256 = createHash('sha256').update(original).digest('hex');
const fixture = (): Snapshot => ({
  trip: { id: 'trip', title: '四川之旅', startDate: '2026-09-21', endDate: '2026-09-28', days: [{ day: 1, date: '2026-09-21', title: '抵达成都', placeIds: ['chengdu'] }] },
  me: { id: 'a', name: '妈妈', avatar: 1, role: 'owner', status: 'active', joinedAt: '2026-09-20' },
  members: [{ id: 'a', name: '妈妈', avatar: 1, role: 'owner', status: 'active', joinedAt: '2026-09-20' }],
  places: [{ id: 'chengdu', name: '成都', subtitle: '慢慢逛', dayIndices: [1], mapX: 30, mapY: 50, subplaces: ['人民公园'] }],
  moments: [{ id: 'm', authorId: 'a', text: '一起看风景 </script><img src=x onerror=alert(1)>', placeId: 'chengdu', subplace: '人民公园', createdAt: '2026-09-21T01:00:00Z', updatedAt: '2026-09-21T01:00:00Z', media: [{ id: '../photo', type: 'photo', name: '风景.jpg', mime: 'image/jpeg', size: original.length, sha256, duration: 0, url: 'https://private.invalid/media?token=secret-url' }] }],
  comments: [{ id: 'c1', momentId: 'm', authorId: 'a', body: '好漂亮', parentId: null, createdAt: '2026-09-21T02:00:00Z' }, { id: 'c2', momentId: 'm', authorId: 'a', body: '明天继续', parentId: 'c1', createdAt: '2026-09-21T03:00:00Z' }],
  reactions: [{ momentId: 'm', userId: 'a', emoji: '❤️' }],
});

test('archive rejects missing hash, wrong hash, wrong size, and missing original', async () => {
  for (const mutation of [ { sha256: '' }, { sha256: '0'.repeat(64) }, { size: original.length + 1 } ]) {
    const input = fixture(); Object.assign(input.moments[0].media[0], mutation);
    await assert.rejects(createArchive(input, async () => original), /SHA-256|完整性校验失败/);
  }
  await assert.rejects(createArchive(fixture(), async () => { throw new Error('原文件丢失'); }), /无法读取原始媒体/);
});

test('archive whitelists public fields, embeds offline data safely and verifies all packaged files', async () => {
  const input = fixture();
  Object.assign(input, { sessions: ['private-session'], inviteToken: 'private-invite' });
  Object.assign(input.members[0], { pinHash: 'private-pin', recoveryCode: 'private-recovery' });
  Object.assign(input.trip, { token: 'private-trip-token' });
  Object.assign(input.moments[0].media[0], { storageKey: 'private-storage' });
  const zip = await JSZip.loadAsync(await createArchive(input, async () => original));
  const html = await zip.file('index.html')!.async('string');
  const json = await zip.file('snapshot.json')!.async('string');
  for (const secret of ['private-session', 'private-invite', 'private-pin', 'private-recovery', 'private-trip-token', 'private-storage', 'secret-url']) {
    assert.ok(!html.includes(secret)); assert.ok(!json.includes(secret));
  }
  assert.ok(html.includes('回复 妈妈'));
  for (const text of ['成都', '人民公园', '抵达成都', '好漂亮', '明天继续', '❤️']) assert.ok(html.includes(text));
  assert.ok(html.includes('\\u003c/script\\u003e'));
  assert.ok(!html.includes('</script><img'));
  assert.ok(!html.includes('https://'));
  const data = JSON.parse(json);
  assert.match(data.moments[0].media[0].url, /^media\/[a-f0-9]{64}\.jpg$/);
  assert.deepEqual(await zip.file(data.moments[0].media[0].url)!.async('uint8array'), original);
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.counts, { moments: 1, media: 1, comments: 2, reactions: 1 });
  for (const entry of manifest.files) {
    const bytes = await zip.file(entry.path)!.async('uint8array');
    assert.equal(entry.size, bytes.byteLength);
    assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
});

test('empty trip remains readable and exports no invented moments', async () => {
  const input = fixture(); input.moments = []; input.comments = []; input.reactions = [];
  const zip = await JSZip.loadAsync(await createArchive(input, async () => { throw new Error('must not read'); }));
  assert.ok((await zip.file('index.html')!.async('string')).includes('还没有记录'));
  assert.equal(JSON.parse(await zip.file('manifest.json')!.async('string')).counts.media, 0);
});

test('video and voice originals use local controls and preserve every byte', async () => {
  const input = fixture();
  const sample = input.moments[0].media[0];
  input.moments[0].media.push({ ...sample, id: 'video', type: 'video', mime: 'video/mp4', name: '旅途.mp4' }, { ...sample, id: 'audio', type: 'audio', mime: 'audio/webm;codecs=opus', name: '妈妈的声音.webm' });
  const zip = await JSZip.loadAsync(await createArchive(input, async () => original));
  const html = await zip.file('index.html')!.async('string');
  assert.match(html, /<video controls preload="metadata" src="media\/[a-f0-9]+\.mp4"/);
  assert.match(html, /<audio controls preload="metadata" src="media\/[a-f0-9]+\.webm"/);
  const data = JSON.parse(await zip.file('snapshot.json')!.async('string'));
  for (const media of data.moments[0].media) assert.deepEqual(await zip.file(media.url)!.async('uint8array'), original);
});

test('media reads stay sequential across moments to bound download memory', async () => {
  const input = fixture();
  input.moments.push({ ...input.moments[0], id: 'second', media: [{ ...input.moments[0].media[0], id: 'second-photo' }] });
  let active = 0;
  let maximum = 0;
  await createArchive(input, async () => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active -= 1;
    return original;
  });
  assert.equal(maximum, 1);
});
