import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runMigrations } from '../src/database/migrations.js';
import { migrationCatalog } from '../src/database/migration-catalog.js';
import { findOrCreateUser } from '../src/auth/users.js';
import { normalizeUsername, setUsername } from '../src/auth/username.js';
import { databaseFixture } from './database-helpers.js';
import { authFixture } from './auth-helpers.js';

for (const value of ['', 'ab', 'a'.repeat(21), '___', 'a b', 'Luná', '月Luna', 'Luna🙂', 'Luna-', 'Lu\0na', 'abc\ndef', ' '.repeat(257) + 'abc']) {
  test(`invalid username is rejected: ${JSON.stringify(value)}`, () => {
    assert.throws(() => normalizeUsername(value), { code: 'INVALID_USERNAME' });
  });
}

test('username boundaries, trimming and accepted capitalization match the approved rules', () => {
  for (const name of ['abc', '_a_', '123', 'Luna_7', 'A'.repeat(20)]) assert.equal(normalizeUsername(name), name);
  assert.equal(normalizeUsername('\t Luna_7 \n'), 'Luna_7');
  assert.equal(normalizeUsername(' '.repeat(253) + 'abc'), 'abc');
});

test('migration 2 upgrades once, preserves users/session rows and legacy names, and enforces NOCASE', (t) => {
  const f = databaseFixture(t);
  const db = f.open();
  runMigrations(db, migrationCatalog.slice(0, 1));
  const first = findOrCreateUser(db, { subject: 'first', email: 'first@example.test' });
  const legacy = findOrCreateUser(db, { subject: 'legacy', email: 'legacy@example.test' });
  findOrCreateUser(db, { subject: 'unset', email: 'unset@example.test' });
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run('Luna_7', first.id);
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run('Á', legacy.id);
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('untouched', Date.now() + 60_000, '{}');
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  const sessions = db.prepare('SELECT * FROM sessions').all();
  runMigrations(db, migrationCatalog);
  const history = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  runMigrations(db, migrationCatalog);
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), history);
  assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), users);
  assert.deepEqual(db.prepare('SELECT * FROM sessions').all(), sessions);
  assert.throws(() => db.prepare('UPDATE users SET username = ? WHERE id = ?').run('lUnA_7', legacy.id), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }).count, 2);
});

test('migration collision rolls back index/history without renaming users or losing sessions', (t) => {
  t.mock.method(console, 'error', () => {});
  const f = databaseFixture(t);
  const db = f.open();
  runMigrations(db, migrationCatalog.slice(0, 1));
  for (const name of ['Luna', 'luna']) {
    const user = findOrCreateUser(db, { subject: name, email: 'player@example.test' });
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(name, user.id);
  }
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('untouched', Date.now() + 60_000, '{}');
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  const sessions = db.prepare('SELECT * FROM sessions').all();
  const history = db.prepare('SELECT * FROM schema_migrations').all();
  assert.throws(() => runMigrations(db, migrationCatalog), /MIGRATION_FAILED/);
  assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(), users);
  assert.deepEqual(db.prepare('SELECT * FROM sessions').all(), sessions);
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(), history);
  assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'users_username_nocase_idx'").get(), undefined);
});

test('one-time account assignment preserves spelling/identity, confirms repeats, and rejects other names', (t) => {
  const f = databaseFixture(t);
  const db = f.open();
  runMigrations(db, migrationCatalog);
  const user = findOrCreateUser(db, { subject: 'first', email: 'first@example.test' });
  const before = db.prepare('SELECT google_id, email, created_at FROM users WHERE id = ?').get(user.id);
  assert.deepEqual(setUsername(db, user.id, ' Luna_7 '), { id: user.id, username: 'Luna_7' });
  assert.deepEqual(setUsername(db, user.id, 'lUnA_7'), { id: user.id, username: 'Luna_7' });
  assert.throws(() => setUsername(db, user.id, 'Another'), { code: 'USERNAME_ALREADY_SET' });
  assert.deepEqual(db.prepare('SELECT google_id, email, created_at FROM users WHERE id = ?').get(user.id), before);
  const other = findOrCreateUser(db, { subject: 'other', email: 'other@example.test' });
  assert.throws(() => setUsername(db, other.id, 'LUNA_7'), { code: 'USERNAME_TAKEN' });
  assert.deepEqual(db.prepare('SELECT username FROM users WHERE id = ?').get(other.id), { username: null });
  assert.throws(() => setUsername(db, 'absent-user', 'ValidName'), { code: 'AUTH_REQUIRED' });
  assert.equal(db.inTransaction, false);
});

test('storage/lock errors are unavailable, not taken, and invalid values perform no SQL', (t) => {
  const f = databaseFixture(t);
  const db = f.open();
  runMigrations(db, migrationCatalog);
  const user = findOrCreateUser(db, { subject: 'first', email: 'first@example.test' });
  const prepare = t.mock.method(db, 'prepare');
  assert.throws(() => setUsername(db, user.id, '___'), { code: 'INVALID_USERNAME' });
  assert.equal(prepare.mock.callCount(), 0);
  prepare.mock.restore();
  const other = f.open();
  other.exec('BEGIN IMMEDIATE');
  db.pragma('busy_timeout = 10');
  assert.throws(() => setUsername(db, user.id, 'Luna'), { code: 'USERNAME_UNAVAILABLE' });
  other.exec('ROLLBACK');
  assert.deepEqual(setUsername(db, user.id, 'Luna'), { id: user.id, username: 'Luna' });
  db.close();
  assert.throws(() => setUsername(db, user.id, 'Luna'), { code: 'USERNAME_UNAVAILABLE' });
});

test('HTTP username setup reads only the session identity, preserves session expiry, and later Google login reuses it', async (t) => {
  const f = await authFixture(t);
  const { body } = await f.login();
  const sessions = f.database.prepare('SELECT * FROM sessions').all();
  const response = await f.request('/api/auth/username', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-csrf-token': f.csrfToken,
  }, body: '{"username":" Luna_7 "}' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  const expected = { authenticated: true, user: { id: body.user.id, username: 'Luna_7' }, requiresOnboarding: false };
  assert.deepEqual(await response.json(), expected);
  assert.deepEqual(f.database.prepare('SELECT * FROM sessions').all(), sessions);
  assert.deepEqual(await (await f.request('/api/auth/session')).json(), expected);
  assert.equal((await f.request('/api/probe/onboarded')).status, 200);
  const later = await f.login();
  assert.deepEqual(later.body.user, expected.user);
  assert.equal(later.body.requiresOnboarding, false);
  assert.deepEqual(f.database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all(),
    [{ name: 'schema_migrations' }, { name: 'sessions' }, { name: 'users' }]);
});

test('username endpoint rejects anonymous/expired/stale identities and invalid Origin/CSRF', async (t) => {
  const f = await authFixture(t);
  assert.equal((await f.request('/api/auth/username', { method: 'POST' })).status, 401);
  const { body } = await f.login();
  for (const headers of [{ origin: 'https://evil.test' }, { 'x-csrf-token': 'x'.repeat(43) }, {}]) {
    const response = await f.request('/api/auth/username', { method: 'POST', headers });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.arrayBuffer();
  }
  f.database.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
  assert.equal((await f.request('/api/auth/username', { method: 'POST' })).status, 401);
  await f.login();
  f.database.prepare('DELETE FROM users WHERE id = ?').run(body.user.id);
  assert.equal((await f.request('/api/auth/username', { method: 'POST' })).status, 401);
});

test('username endpoint validates shape/media/body limits and uses fixed username errors', async (t) => {
  const f = await authFixture(t);
  await f.login();
  for (const [body, contentType, status, code] of [
    ['{bad', 'application/json', 400, 'INVALID_JSON'],
    ['{}', 'application/json', 400, 'INVALID_REQUEST'],
    ['{"username":5}', 'application/json', 400, 'INVALID_REQUEST'],
    ['{"username":"Luna","userId":"other"}', 'application/json', 400, 'INVALID_REQUEST'],
    ['{"username":"___"}', 'application/json', 400, 'INVALID_USERNAME'],
    [JSON.stringify({ username: 'a'.repeat(257) }), 'application/json', 400, 'INVALID_USERNAME'],
    [JSON.stringify({ username: 'a'.repeat(2200) }), 'application/json', 413, 'BODY_TOO_LARGE'],
    ['{}', 'text/plain', 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['{}', 'application/json; charset=latin1', 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ] as const) {
    const response = await f.request('/api/auth/username', { method: 'POST', headers: {
      'content-type': contentType, 'x-csrf-token': f.csrfToken,
    }, body });
    assert.equal(response.status, status);
    assert.equal((await response.json() as { error: { code: string } }).error.code, code);
  }
  assert.deepEqual(f.database.prepare('SELECT username FROM users').all(), [{ username: null }]);
});

test('concurrent username POSTs cannot overwrite one account or claim the same name for two accounts', async (t) => {
  let subject = 'first';
  const f = await authFixture(t, {}, async () => ({ subject, email: 'player@example.test' }));
  await f.login();
  const post = (name: string) => f.request('/api/auth/username', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-csrf-token': f.csrfToken,
  }, body: JSON.stringify({ username: name }) });
  const competing = await Promise.all([post('Luna'), post('Sol')]);
  assert.deepEqual(competing.map((response) => response.status).sort(), [200, 409]);
  const winner = (await (competing.find((response) => response.status === 200)!).json() as { user: { username: string } }).user.username;
  const rejected = competing.find((response) => response.status === 409)!;
  assert.equal((await rejected.json() as { error: { code: string } }).error.code, 'USERNAME_ALREADY_SET');
  assert.equal((await post(winner.toUpperCase())).status, 200);
  subject = 'second';
  await f.login();
  const taken = await post(winner.toLowerCase());
  assert.equal(taken.status, 409);
  assert.equal((await taken.json() as { error: { code: string } }).error.code, 'USERNAME_TAKEN');
  assert.equal((f.database.prepare('SELECT COUNT(*) AS count FROM users WHERE username IS NOT NULL').get() as { count: number }).count, 1);
  const secondCookie = f.cookie;
  const secondToken = f.csrfToken;
  subject = 'third';
  // Use a separate cookie jar: logging in through f.login() would regenerate/destroy the second session.
  const thirdBootstrap = await fetch(`${f.url}/api/auth/csrf`);
  const thirdCsrf = (await thirdBootstrap.json() as { csrfToken: string }).csrfToken;
  const thirdLogin = await fetch(`${f.url}/api/auth/google`, { method: 'POST', headers: {
    cookie: thirdBootstrap.headers.getSetCookie()[0]!.split(';')[0]!, origin: f.config.appOrigin,
    'content-type': 'application/json', 'x-csrf-token': thirdCsrf,
  }, body: '{"credential":"header.payload.signature"}' });
  assert.equal(thirdLogin.status, 200);
  const thirdToken = (await thirdLogin.json() as { csrfToken: string }).csrfToken;
  const thirdCookie = thirdLogin.headers.getSetCookie()[0]!.split(';')[0]!;
  const differentAccounts = await Promise.all([
    { cookie: secondCookie, token: secondToken, name: 'SharedName' },
    { cookie: thirdCookie, token: thirdToken, name: 'sharedname' },
  ].map(({ cookie, token, name }) => fetch(`${f.url}/api/auth/username`, { method: 'POST', headers: {
    cookie, origin: f.config.appOrigin, 'content-type': 'application/json', 'x-csrf-token': token,
  }, body: JSON.stringify({ username: name }) })));
  assert.deepEqual(differentAccounts.map((response) => response.status).sort(), [200, 409]);
  for (const response of differentAccounts) {
    const body = await response.json() as { error?: { code: string } };
    if (response.status === 409) assert.equal(body.error?.code, 'USERNAME_TAKEN');
  }
});

test('username HTTP storage failure is sanitized and does not create a false success or assignment', async (t) => {
  const errors: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { errors.push(args); });
  const f = await authFixture(t);
  await f.login();
  t.mock.method(f.database, 'transaction', () => { throw new Error('private database failure'); });
  const response = await f.request('/api/auth/username', { method: 'POST', headers: {
    'content-type': 'application/json', 'x-csrf-token': f.csrfToken,
  }, body: '{"username":"Luna"}' });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'USERNAME_UNAVAILABLE', message: 'Username setup is temporarily unavailable.' } });
  assert.doesNotMatch(JSON.stringify(errors), /private database failure/);
  assert.deepEqual(f.database.prepare('SELECT username FROM users').all(), [{ username: null }]);
});
