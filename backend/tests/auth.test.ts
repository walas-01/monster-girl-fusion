import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync } from 'node:fs';
import type { SessionData } from 'express-session';
import { ApiError } from '../src/middleware/api-error.js';
import { authFixture } from './auth-helpers.js';

test('health, anonymous session inspection, and unknown routes do not create sessions', async (t) => {
  const f = await authFixture(t);
  const queries = t.mock.method(f.database, 'prepare');
  for (const path of ['/api/health', '/missing', '/api/auth/session']) {
    const response = await f.request(path);
    assert.equal(response.headers.get('set-cookie'), null);
    await response.arrayBuffer();
  }
  assert.equal(queries.mock.callCount(), 0);
  queries.mock.restore();
  assert.deepEqual(f.database.prepare('SELECT * FROM sessions').all(), []);
  assert.ok(readdirSync(f.directory).every((name) => name.startsWith('game.sqlite')));
});

test('bootstrap/login rotates SID and token, persists only minimal identity, and logout invalidates the old cookie', async (t) => {
  const f = await authFixture(t);
  const bootstrap = await f.bootstrap();
  const oldCookie = f.cookie;
  const oldToken = f.csrfToken;
  const oldSession = f.database.prepare('SELECT sid FROM sessions').get();
  assert.match(bootstrap.headers.get('set-cookie')!, /HttpOnly/);
  assert.match(bootstrap.headers.get('set-cookie')!, /SameSite=Lax/);
  assert.match(bootstrap.headers.get('set-cookie')!, /Path=\/api/);
  assert.equal(bootstrap.headers.get('cache-control'), 'no-store');
  const { body, response } = await f.login();
  assert.equal(body.requiresOnboarding, true);
  assert.equal(body.user.username, null);
  assert.notEqual(f.cookie, oldCookie);
  assert.notEqual(f.csrfToken, oldToken);
  assert.notDeepEqual(f.database.prepare('SELECT sid FROM sessions').get(), oldSession);
  assert.match(body.user.id, /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const rows = f.database.prepare<[], { data: string }>('SELECT data FROM sessions').all();
  assert.equal(rows.length, 1);
  assert.doesNotMatch(rows[0]!.data, /header.payload.signature|player@example|google-subject/);
  const stale = await fetch(`${f.url}/api/auth/session`, { headers: { cookie: oldCookie } });
  assert.deepEqual(await stale.json(), { authenticated: false });
  const current = await f.request('/api/auth/session');
  assert.deepEqual(await current.json(), { authenticated: true, user: body.user, requiresOnboarding: true });
  const authenticatedCookie = f.cookie;
  const staleToken = await f.request('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': oldToken } });
  assert.equal(staleToken.status, 403);
  await staleToken.arrayBuffer();
  const logout = await f.request('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': f.csrfToken } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/);
  const reused = await fetch(`${f.url}/api/auth/session`, { headers: { cookie: authenticatedCookie } });
  assert.deepEqual(await reused.json(), { authenticated: false });
  assert.deepEqual(f.database.prepare('SELECT * FROM sessions').all(), []);
});

test('missing, stale, and hostile CSRF/origin headers fail before Google verification', async (t) => {
  let calls = 0;
  const f = await authFixture(t, {}, async () => { calls++; return { subject: 'sub', email: 'a@b.test' }; });
  await f.bootstrap();
  const allowed = { 'content-type': 'application/json', 'x-csrf-token': f.csrfToken, cookie: f.cookie, origin: f.config.appOrigin };
  for (const change of [{ origin: undefined }, { origin: 'null' }, { origin: 'https://evil.test' },
    { 'x-csrf-token': undefined }, { 'x-csrf-token': 'x'.repeat(43) }, { 'x-csrf-token': 'é'.repeat(43) },
    { 'sec-fetch-site': 'cross-site' }]) {
    const headers = { ...allowed, ...change };
    const filtered = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined)) as Record<string, string>;
    const response = await fetch(`${f.url}/api/auth/google`, { method: 'POST', headers: filtered,
      body: JSON.stringify({ credential: 'a.b.c' }) });
    assert.equal(response.status, 403);
    assert.deepEqual((await response.json() as { error: { code: string } }).error.code, 'CSRF_INVALID');
  }
  assert.equal(calls, 0);
  assert.deepEqual(f.database.prepare('SELECT * FROM users').all(), []);
  const cross = await f.request('/api/auth/csrf', { headers: { origin: 'https://evil.test' } });
  assert.equal(cross.status, 403);
  const sameOriginNoHeader = await fetch(`${f.url}/api/auth/csrf`, { headers: { cookie: f.cookie } });
  assert.equal(sameOriginNoHeader.status, 200);
});

test('input validation is scoped, bounded, and does not call Google for invalid requests', async (t) => {
  let calls = 0;
  const f = await authFixture(t, {}, async () => { calls++; throw new ApiError('INVALID_GOOGLE_TOKEN'); });
  await f.bootstrap();
  for (const [body, type, status, code] of [
    ['{bad json', 'application/json', 400, 'INVALID_JSON'],
    ['{}', 'application/json', 400, 'INVALID_REQUEST'],
    ['{"credential":"a.b.c","userId":"client"}', 'application/json', 400, 'INVALID_REQUEST'],
    ['{"credential":"not-jwt"}', 'application/json', 400, 'INVALID_REQUEST'],
    [JSON.stringify({ credential: 'a'.repeat(8193) }), 'application/json', 400, 'INVALID_REQUEST'],
    [JSON.stringify({ credential: 'a'.repeat(17000) }), 'application/json', 413, 'BODY_TOO_LARGE'],
    ['a.b.c', 'text/plain', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['{}', 'application/json; charset=latin1', 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ] as const) {
    const response = await f.request('/api/auth/google', { method: 'POST', headers: {
      'content-type': type, 'x-csrf-token': f.csrfToken,
    }, body });
    assert.equal(response.status, status);
    assert.equal((await response.json() as { error: { code: string } }).error.code, code);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(calls, 0);
  const response = await f.request('/api/auth/google', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-csrf-token': f.csrfToken,
  }, body: '{"credential":"a.b.c"}' });
  assert.equal(response.status, 401);
  assert.equal(calls, 1);
});

test('save failure clears the partial session and retry reuses the account', async (t) => {
  t.mock.method(console, 'error', () => {});
  const f = await authFixture(t);
  const originalSet = f.store.set.bind(f.store);
  const mocked = t.mock.method(f.store, 'set', (sid: string, value: SessionData,
    callback: (error: Error | null) => void = () => {}) => {
    if (value.userId) callback(new ApiError('SESSION_UNAVAILABLE'));
    else originalSet(sid, value, callback);
  });
  await f.bootstrap();
  const response = await f.request('/api/auth/google', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-csrf-token': f.csrfToken,
  }, body: '{"credential":"a.b.c"}' });
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { error: { code: string } }).error.code, 'SESSION_UNAVAILABLE');
  assert.deepEqual(f.database.prepare('SELECT * FROM sessions').all(), []);
  const user = f.database.prepare('SELECT id FROM users').get();
  mocked.mock.restore();
  const { body } = await f.login();
  assert.deepEqual(user, { id: body.user.id });
  assert.equal((f.database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count, 1);
});

test('CSRF bootstrap save and session regeneration failures do not establish authentication', async (t) => {
  t.mock.method(console, 'error', () => {});
  const f = await authFixture(t);
  const failSave = t.mock.method(f.store, 'set', (_sid: string, _value: SessionData,
    callback: (error: Error | null) => void = () => {}) => callback(new ApiError('SESSION_UNAVAILABLE')));
  const bootstrap = await f.request('/api/auth/csrf');
  assert.equal(bootstrap.status, 503);
  await bootstrap.arrayBuffer();
  assert.deepEqual(f.database.prepare('SELECT * FROM sessions').all(), []);
  failSave.mock.restore();
  await f.bootstrap();
  const failDestroy = t.mock.method(f.store, 'destroy', (_sid: string,
    callback: (error: Error | null) => void = () => {}) => callback(new ApiError('SESSION_UNAVAILABLE')));
  const login = await f.request('/api/auth/google', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-csrf-token': f.csrfToken,
  }, body: '{"credential":"a.b.c"}' });
  assert.equal(login.status, 503);
  await login.arrayBuffer();
  failDestroy.mock.restore();
  const rows = f.database.prepare<[], { data: string }>('SELECT data FROM sessions').all();
  assert.ok(rows.every((row) => JSON.parse(row.data).userId === undefined));
});

test('store read and logout-destroy failures return service errors, not false success', async (t) => {
  t.mock.method(console, 'error', () => {});
  const f = await authFixture(t);
  await f.login();
  const get = t.mock.method(f.store, 'get', (_sid: string,
    callback: (error: Error | null, data?: SessionData | undefined) => void) => callback(new ApiError('SESSION_UNAVAILABLE')));
  const unavailable = await f.request('/api/auth/session');
  assert.equal(unavailable.status, 503);
  await unavailable.arrayBuffer();
  get.mock.restore();
  const destroy = t.mock.method(f.store, 'destroy', (_sid: string,
    callback: (error: Error | null) => void = () => {}) => callback(new ApiError('SESSION_UNAVAILABLE')));
  const logout = await f.request('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': f.csrfToken } });
  assert.equal(logout.status, 503);
  await logout.arrayBuffer();
  destroy.mock.restore();
});

test('stale-user, expired, and forged sessions cannot authorize requests', async (t) => {
  const f = await authFixture(t);
  const { body } = await f.login();
  f.database.prepare('DELETE FROM users WHERE id = ?').run(body.user.id);
  const stale = await f.request('/api/auth/session');
  assert.deepEqual(await stale.json(), { authenticated: false });
  assert.deepEqual(f.database.prepare('SELECT * FROM sessions').all(), []);
  await f.login();
  f.database.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
  const expired = await f.request('/api/probe/account');
  assert.equal(expired.status, 401);
  await expired.arrayBuffer();
  const forged = await fetch(`${f.url}/api/auth/session`, { headers: { cookie: 'mgf.sid=s%3Aforged.fake' } });
  assert.deepEqual(await forged.json(), { authenticated: false });
});

test('anonymous logout still requires CSRF, and authorization distinguishes onboarding', async (t) => {
  const f = await authFixture(t);
  assert.equal((await f.request('/api/auth/logout', { method: 'POST' })).status, 403);
  await f.bootstrap();
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': f.csrfToken } })).status, 204);
  const { body } = await f.login();
  assert.equal((await f.request('/api/probe/account')).status, 200);
  assert.equal((await f.request('/api/probe/onboarded')).status, 403);
  f.database.prepare('UPDATE users SET username = ? WHERE id = ?').run('TestPlayer', body.user.id);
  assert.equal((await f.request('/api/probe/onboarded')).status, 200);
});

test('production cookie security trusts only configured proxy addresses', async (t) => {
  const untrusted = await authFixture(t, { nodeEnv: 'production', trustProxyCidrs: [] });
  assert.equal((await untrusted.request('/api/auth/csrf')).status, 403);
  assert.deepEqual(untrusted.database.prepare('SELECT * FROM sessions').all(), []);
  const trusted = await authFixture(t, { nodeEnv: 'production', trustProxyCidrs: ['127.0.0.1/32'] });
  const response = await trusted.bootstrap();
  assert.match(response.headers.get('set-cookie')!, /; Secure/);
  const http = await fetch(`${trusted.url}/api/auth/session`, { headers: { cookie: trusted.cookie } });
  assert.equal(http.status, 403);
  const health = await fetch(`${trusted.url}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('set-cookie'), null);
  await trusted.login();
});

test('overlapping logins converge on one Google-subject account', async (t) => {
  let calls = 0;
  const ready = Promise.withResolvers<void>();
  const f = await authFixture(t, {}, async () => {
    if (++calls === 2) ready.resolve();
    await ready.promise;
    return { subject: 'same-subject', email: 'player@example.test' };
  });
  await f.bootstrap();
  const headers = { origin: f.config.appOrigin, cookie: f.cookie, 'x-csrf-token': f.csrfToken, 'content-type': 'application/json' };
  const responses = await Promise.all([1, 2].map(() => fetch(`${f.url}/api/auth/google`, {
    method: 'POST', headers, body: '{"credential":"a.b.c"}',
  })));
  const users = await Promise.all(responses.map(async (response) => {
    assert.equal(response.status, 200);
    return (await response.json() as { user: { id: string } }).user.id;
  }));
  assert.equal(users[0], users[1]);
  assert.equal((f.database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count, 1);
});

test('cookie and store deadlines do not slide on repeated reads', async (t) => {
  const f = await authFixture(t, { sessionTtlSeconds: 60 });
  const { response } = await f.login();
  const row = f.database.prepare<[], { expires_at: number; data: string }>('SELECT expires_at, data FROM sessions').get()!;
  assert.equal(new Date(JSON.parse(row.data).cookie.expires).getTime(), row.expires_at);
  const headerExpiry = /Expires=([^;]+)/.exec(response.headers.get('set-cookie')!)![1]!;
  assert.ok(new Date(headerExpiry).getTime() <= row.expires_at);
  const later = Date.now() + 10_000;
  t.mock.method(Date, 'now', () => later);
  const reread = await f.bootstrap();
  assert.equal(reread.headers.get('set-cookie'), null);
  assert.deepEqual(f.database.prepare('SELECT expires_at, data FROM sessions').get(), row);
});
