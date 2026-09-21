import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyState, transact } from '../lib/server/store';

test('CloudBase state mutations retry a revision conflict against fresh state', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = process.env.MOMENTS_STORAGE;
  const originalEnv = process.env.CLOUDBASE_ENV_ID;
  const originalKey = process.env.CLOUDBASE_APIKEY;
  process.env.MOMENTS_STORAGE = 'cloudbase-postgres';
  process.env.CLOUDBASE_ENV_ID = 'test-env';
  process.env.CLOUDBASE_APIKEY = 'test-key';
  const versions = [
    { state: emptyState(), revision: 3 },
    { state: emptyState(), revision: 4 },
  ];
  versions[1].state.trip.title = '另一位家人刚更新的标题';
  let reads = 0;
  let patches = 0;
  globalThis.fetch = async (_input, init) => {
    if (!init?.method || init.method === 'GET') {
      const current = versions[reads++];
      return Response.json([{ payload: current.state, revision: current.revision }]);
    }
    patches += 1;
    if (patches === 1) return Response.json([]);
    const body = JSON.parse(String(init.body)) as { payload: ReturnType<typeof emptyState>; revision: number };
    assert.equal(body.revision, 5);
    assert.equal(body.payload.trip.title, '另一位家人刚更新的标题');
    assert.equal(body.payload.invite.enabled, true);
    return Response.json([{ revision: 5 }]);
  };
  try {
    const result = await transact(state => { state.invite.enabled = true; return 'saved'; });
    assert.equal(result, 'saved');
    assert.equal(reads, 2);
    assert.equal(patches, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete process.env.MOMENTS_STORAGE; else process.env.MOMENTS_STORAGE = originalStorage;
    if (originalEnv === undefined) delete process.env.CLOUDBASE_ENV_ID; else process.env.CLOUDBASE_ENV_ID = originalEnv;
    if (originalKey === undefined) delete process.env.CLOUDBASE_APIKEY; else process.env.CLOUDBASE_APIKEY = originalKey;
  }
});
