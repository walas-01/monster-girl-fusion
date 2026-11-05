import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthError, createAuthApi, parseSession } from '../src/auth/api.ts';
import { googleClientId } from '../src/config.ts';
import { dictionaries, initialLanguage } from '../src/i18n.ts';
import { normalizeUsername } from '../src/auth/username.ts';

const signal = () => new AbortController().signal;
const token = 'x'.repeat(43);
const signedIn = { authenticated: true, user: { id: 'a'.repeat(36), username: null }, requiresOnboarding: true };

test('relative API calls preserve cookies, JSON and CSRF headers without a client-supplied Origin', async () => {
  const calls: Array<{ url: unknown; init: RequestInit | undefined }> = [];
  const api = createAuthApi(async (url, init) => {
    calls.push({ url, init });
    if (url === '/api/auth/logout') return new Response(null, { status: 204 });
    return Response.json(url === '/api/auth/csrf' ? { csrfToken: token }
      : url === '/api/auth/google' ? { ...signedIn, csrfToken: 'y'.repeat(43) } : { authenticated: false });
  });
  assert.deepEqual(await api.session(signal()), { authenticated: false });
  assert.equal(await api.csrf(signal()), token);
  assert.deepEqual(await api.login('private.credential.signature', token, signal()), signedIn);
  await api.logout(token, signal());
  assert.deepEqual(calls.map((call) => call.url), ['/api/auth/session', '/api/auth/csrf', '/api/auth/google', '/api/auth/logout']);
  for (const call of calls) {
    assert.equal(call.init?.credentials, 'same-origin');
    assert.equal(call.init?.cache, 'no-store');
    assert.equal(new Headers(call.init?.headers).has('Origin'), false);
  }
  assert.equal(calls[2]!.init!.body, '{"credential":"private.credential.signature"}');
  assert.equal(new Headers(calls[2]!.init!.headers).get('x-csrf-token'), token);
  assert.equal(calls[3]!.init!.body, undefined);
});

for (const value of [null, {}, [], { authenticated: 'false' },
  { ...signedIn, requiresOnboarding: false }, { ...signedIn, user: { id: 'x', username: null } },
  { ...signedIn, user: { id: 'a'.repeat(36), username: '' } }]) {
  test(`malformed session is rejected: ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseSession(value), AuthError);
  });
}

test('unknown/known API errors expose only fixed translation keys, never server details', async () => {
  for (const [code, key] of Object.entries({ CSRF_INVALID: 'security', AUTH_REQUIRED: 'security',
    INVALID_GOOGLE_TOKEN: 'credential', AUTH_UNAVAILABLE: 'service', SESSION_UNAVAILABLE: 'service', UNEXPECTED: 'generic' })) {
    const api = createAuthApi(async () => Response.json({ error: { code, message: 'private stack/token' } }, { status: 503 }));
    await assert.rejects(api.session(signal()), (error: unknown) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.key, key);
      assert.doesNotMatch(error.message, /private/);
      return true;
    });
  }
  const html = createAuthApi(async () => new Response('<html>private proxy error</html>', { status: 502 }));
  await assert.rejects(html.session(signal()), { key: 'generic' });
});

test('invalid CSRF, login and logout success envelopes fail closed', async () => {
  for (const value of [{}, { csrfToken: 'x' }, { csrfToken: token + '\n' }]) {
    await assert.rejects(createAuthApi(async () => Response.json(value)).csrf(signal()), AuthError);
  }
  await assert.rejects(createAuthApi(async () => Response.json({ authenticated: false })).login('a.b.c', token, signal()), AuthError);
  await assert.rejects(createAuthApi(async () => Response.json({ ok: true })).logout(token, signal()), AuthError);
});

test('request timeout and external cancellation abort the underlying fetch', async () => {
  const aborting: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('private aborted request')), { once: true });
  });
  await assert.rejects(createAuthApi(aborting, 10).session(signal()), { key: 'network' });
  const controller = new AbortController();
  const request = createAuthApi(aborting).session(controller.signal);
  controller.abort();
  await assert.rejects(request, { key: 'network' });
});

test('language preferences use first supported regional tag then English fallback; dictionary keys match', () => {
  assert.equal(initialLanguage(['fr-FR', 'es-AR', 'en']), 'es');
  assert.equal(initialLanguage(['en-GB', 'es']), 'en');
  assert.equal(initialLanguage(['ES-mx']), 'es');
  assert.equal(initialLanguage(['ja']), 'en');
  assert.equal(initialLanguage([]), 'en');
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.es).sort());
  assert.ok(Object.values(dictionaries.es).every(Boolean));
});

test('only bounded Google web-client IDs are accepted', () => {
  assert.equal(googleClientId('test.apps.googleusercontent.com'), 'test.apps.googleusercontent.com');
  for (const value of [undefined, '', 'invalid', 'test.apps.googleusercontent.com\n', 'x'.repeat(260) + '.apps.googleusercontent.com']) {
    assert.equal(googleClientId(value), undefined);
  }
});

test('username API posts only the name with CSRF, validates completed state, and maps fixed errors', async () => {
  const completed = { ...signedIn, user: { ...signedIn.user, username: 'Luna_7' }, requiresOnboarding: false };
  const api = createAuthApi(async (url, init) => {
    assert.equal(url, '/api/auth/username');
    assert.equal(init?.body, '{"username":"Luna_7"}');
    assert.equal(new Headers(init?.headers).get('x-csrf-token'), token);
    assert.equal(init?.credentials, 'same-origin');
    return Response.json(completed);
  });
  assert.deepEqual(await api.setUsername('Luna_7', token, signal()), completed);
  for (const value of [{ authenticated: false }, signedIn, { ...completed, requiresOnboarding: true }]) {
    await assert.rejects(createAuthApi(async () => Response.json(value)).setUsername('Luna_7', token, signal()), AuthError);
  }
  for (const [code, key] of Object.entries({ INVALID_USERNAME: 'usernameInvalid', USERNAME_TAKEN: 'usernameTaken',
    USERNAME_ALREADY_SET: 'usernameAlreadySet', USERNAME_UNAVAILABLE: 'usernameUnavailable' })) {
    const failed = createAuthApi(async () => Response.json({ error: { code, message: 'private error' } }, { status: 409 }));
    await assert.rejects(failed.setUsername('Luna_7', token, signal()), { key });
  }
});

test('frontend username validation mirrors backend boundaries, raw bounds, trim and ASCII rules', () => {
  for (const name of ['abc', '_a_', '123', 'Luna_7', 'A'.repeat(20)]) assert.equal(normalizeUsername(name), name);
  assert.equal(normalizeUsername('\t Luna_7 \n'), 'Luna_7');
  assert.equal(normalizeUsername(' '.repeat(253) + 'abc'), 'abc');
  for (const value of ['', 'ab', 'a'.repeat(21), '___', 'a b', 'Luná', '月Luna', 'Luna🙂', 'Luna-', 'Lu\0na', 'abc\ndef', ' '.repeat(257) + 'abc']) {
    assert.equal(normalizeUsername(value), undefined);
  }
});
