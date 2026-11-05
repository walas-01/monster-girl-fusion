import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { gaxios } from 'google-auth-library';
import { createGoogleClient, createGoogleVerifier } from '../src/auth/google.js';
import { authFixture } from './auth-helpers.js';
import { testAuthEnv } from './helpers.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const clientId = testAuthEnv.GOOGLE_CLIENT_ID!;

function credential(changes: Record<string, unknown> = {}, privateKey = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'verified-subject', email: 'verified@example.test', email_verified: true,
    aud: clientId, iss: 'https://accounts.google.com', iat: now, exp: now + 3600, ...changes })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}

function controlledClient() {
  const client = createGoogleClient(clientId);
  let calls = 0;
  client.transporter.defaults.adapter = async <T>(options: gaxios.GaxiosOptionsPrepared): Promise<gaxios.GaxiosResponse<T>> => {
    calls++;
    assert.equal(options.timeout, 5000);
    assert.equal(options.retry, false);
    assert.equal(options.retryConfig?.retry, 0);
    assert.ok(options.signal instanceof AbortSignal);
    return Object.assign(new Response(null, { status: 200, headers: { 'cache-control': 'public, max-age=3600' } }),
      { data: { 'test-key': keys.publicKey } as T, config: options });
  };
  return { client, verify: createGoogleVerifier({ googleClientId: clientId }, client), get calls() { return calls; } };
}

test('official verifier validates a local signature, configured claims, and certificate-cache reuse', async () => {
  const f = controlledClient();
  assert.deepEqual(await f.verify(credential()), { subject: 'verified-subject', email: 'verified@example.test' });
  await f.verify(credential());
  assert.equal(f.calls, 1);
});

for (const [label, claims] of [
  ['wrong audience', { aud: 'other-client' }], ['wrong issuer', { iss: 'https://evil.test' }],
  ['expired within library skew', { exp: Math.floor(Date.now() / 1000) - 1 }],
  ['missing subject', { sub: undefined }], ['empty subject', { sub: '' }], ['oversized subject', { sub: 's'.repeat(256) }],
  ['missing email', { email: undefined }], ['invalid email', { email: 'not-an-email' }],
  ['padded email', { email: 'verified@example.test\n' }], ['unverified email', { email_verified: false }],
  ['missing verification', { email_verified: undefined }], ['wrong presenter', { azp: 'other-client' }],
  ['future issue time', { iat: Math.floor(Date.now() / 1000) + 1000 }],
] as const) {
  test(`rejects ${label} with no credential/claim details in the error`, async () => {
    const f = controlledClient();
    await assert.rejects(f.verify(credential(claims)), { code: 'INVALID_GOOGLE_TOKEN',
      message: 'The Google credential is invalid or expired.' });
  });
}

test('rejects invalid signatures and malformed tokens without logging their contents', async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  const f = controlledClient();
  const other = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' } });
  for (const token of [credential({}, other.privateKey), 'private.not-json.signature']) {
    await assert.rejects(f.verify(token), { code: 'INVALID_GOOGLE_TOKEN' });
  }
  assert.deepEqual(logs, []);
});

test('provider failures are sanitized and do not retry', async () => {
  const f = controlledClient();
  let calls = 0;
  f.client.transporter.defaults.adapter = async (options) => {
    calls++;
    throw new gaxios.GaxiosError('private transport details', options);
  };
  await assert.rejects(f.verify(credential()), { code: 'AUTH_UNAVAILABLE', message: 'Authentication is temporarily unavailable.' });
  assert.equal(calls, 1);
});

test('the pinned Google transport aborts a stalled certificate request within five seconds', async () => {
  const f = controlledClient();
  let calls = 0;
  f.client.transporter.defaults.adapter = (options) => new Promise((_resolve, reject) => {
    calls++;
    const aborted = () => reject(new gaxios.GaxiosError('private timeout details', options));
    if (options.signal!.aborted) aborted();
    else options.signal!.addEventListener('abort', aborted, { once: true });
  });
  // AbortSignal.timeout is unref'd; keep this isolated test's event loop alive until it fires.
  const keepAlive = setTimeout(() => {}, 7000);
  const started = performance.now();
  try {
    await assert.rejects(f.verify(credential()), { code: 'AUTH_UNAVAILABLE' });
    assert.ok(performance.now() - started < 6500);
    assert.equal(calls, 1);
  } finally { clearTimeout(keepAlive); }
});

test('the HTTP login flow accepts an actually signed test credential through the real verifier', async (t) => {
  const google = controlledClient();
  const f = await authFixture(t, {}, google.verify);
  await f.bootstrap();
  const response = await f.request('/api/auth/google', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-csrf-token': f.csrfToken,
  }, body: JSON.stringify({ credential: credential() }) });
  assert.equal(response.status, 200);
  const body = await response.json() as { authenticated: boolean; user: { id: string } };
  assert.equal(body.authenticated, true);
  assert.deepEqual(f.database.prepare('SELECT google_id, email, username FROM users WHERE id = ?').get(body.user.id), {
    google_id: 'verified-subject', email: 'verified@example.test', username: null,
  });
});
