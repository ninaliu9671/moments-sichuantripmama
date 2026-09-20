import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrigin } from '../lib/server/origin';
test('local requests allow same-port loopback aliases but reject foreign sites', () => {
  const previous = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
  try {
    const request = (origin: string) => new Request('http://localhost:5173/api/auth/join', { headers: { origin } });
    assert.doesNotThrow(() => validateOrigin(request('http://127.0.0.1:5173')));
    assert.throws(() => validateOrigin(request('http://127.0.0.1:9999')));
    assert.throws(() => validateOrigin(request('https://evil.example')));
    assert.throws(() => validateOrigin(request('null')));
  } finally { (process.env as Record<string, string | undefined>).NODE_ENV = previous; }
});
test('production uses the configured public origin and rejects local aliases', () => {
  const previous = process.env.NODE_ENV, url = process.env.MOMENTS_PUBLIC_URL;
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production'; process.env.MOMENTS_PUBLIC_URL = 'https://moments.example';
  try {
    assert.doesNotThrow(() => validateOrigin(new Request('http://localhost:3000/api/auth/login', { headers: { origin: 'https://moments.example' } })));
    assert.throws(() => validateOrigin(new Request('http://localhost:3000/api/auth/login', { headers: { origin: 'http://127.0.0.1:3000' } })));
  } finally { (process.env as Record<string, string | undefined>).NODE_ENV = previous; if (url === undefined) delete process.env.MOMENTS_PUBLIC_URL; else process.env.MOMENTS_PUBLIC_URL = url; }
});
