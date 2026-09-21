import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSignedUploadUrl } from '../lib/server/storage-url';

const env = 'example-env';

test('signed upload URL uses one Storage API prefix and keeps its token', () => {
  const doubled = `https://${env}.api.tcloudbasegateway.com/v1/storages/v1/storages/object/upload/sign/moments/user/photo.png?token=once`;
  assert.equal(normalizeSignedUploadUrl(doubled, env), `https://${env}.api.tcloudbasegateway.com/v1/storages/object/upload/sign/moments/user/photo.png?token=once`);
  assert.equal(normalizeSignedUploadUrl(normalizeSignedUploadUrl(doubled, env), env), normalizeSignedUploadUrl(doubled, env));
  assert.throws(() => normalizeSignedUploadUrl(doubled.replace(`${env}.api`, 'attacker.api'), env));
  assert.throws(() => normalizeSignedUploadUrl(doubled.split('?')[0], env));
});
