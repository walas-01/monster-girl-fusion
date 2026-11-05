import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import session from 'express-session';
import type { SessionData } from 'express-session';
import { SQLiteSessionStore } from '../src/auth/session-store.js';
import { findOrCreateUser } from '../src/auth/users.js';
import { authFixture } from './auth-helpers.js';
import { runMigrations } from '../src/database/migrations.js';
import { createAuthenticationTables } from '../src/database/migrations/001-create-authentication-tables.js';
import { databaseFixture } from './database-helpers.js';
import { ApiError } from '../src/middleware/api-error.js';

function data(expiresAt = Date.now() + 60_000): SessionData {
  const cookie = new session.Cookie();
  Object.assign(cookie, { path: '/api', httpOnly: true, secure: false, sameSite: 'lax', expires: new Date(expiresAt) });
  return { expiresAt, csrfToken: randomBytes(32).toString('base64url'), cookie };
}
function assertStoreError(error: Error | null) {
  assert.ok(error instanceof ApiError);
  assert.equal(error.code, 'SESSION_UNAVAILABLE');
}
const get = (store: SQLiteSessionStore, sid: string) => new Promise<SessionData | undefined>((resolve, reject) => {
  store.get(sid, (error, value) => error ? reject(error) : resolve(value));
});
const set = (store: SQLiteSessionStore, sid: string, value: SessionData) => new Promise<void>((resolve, reject) => {
  store.set(sid, value, (error) => error ? reject(error) : resolve());
});

test('session schema and users are created atomically by the existing migration catalog', (t) => {
  const fixture = databaseFixture(t);
  const db = fixture.open();
  t.mock.method(console, 'error', () => {});
  runMigrations(db, []);
  assert.throws(() => runMigrations(db, [{ ...createAuthenticationTables, sql: createAuthenticationTables.sql + '\nINVALID SQL;' }]));
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all(), [{ name: 'schema_migrations' }]);
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(), []);
  runMigrations(db, [createAuthenticationTables]);
  assert.deepEqual(db.prepare('SELECT version FROM schema_migrations').all(), [{ version: 1 }]);
});

test('account lookup reuses subjects, updates verified email, and never links by email', async (t) => {
  const f = await authFixture(t);
  const first = findOrCreateUser(f.database, { subject: 'subject-a', email: 'first@example.test' });
  const created = f.database.prepare('SELECT created_at FROM users WHERE id = ?').get(first.id);
  f.database.prepare('UPDATE users SET username = ? WHERE id = ?').run('ExistingPlayer', first.id);
  const next = findOrCreateUser(f.database, { subject: 'subject-a', email: 'changed@example.test' });
  assert.deepEqual(next, { id: first.id, username: 'ExistingPlayer' });
  assert.deepEqual(f.database.prepare('SELECT created_at FROM users WHERE id = ?').get(first.id), created);
  assert.deepEqual(f.database.prepare('SELECT email FROM users WHERE id = ?').get(first.id), { email: 'changed@example.test' });
  const other = findOrCreateUser(f.database, { subject: 'subject-b', email: 'changed@example.test' });
  assert.notEqual(other.id, first.id);
  assert.equal(other.username, null);
  assert.throws(() => f.database.prepare('UPDATE users SET username = ? WHERE id = ?').run('ExistingPlayer', other.id));
});

test('store set/get/destroy persists rows, respects expiry, and never extends through touch', async (t) => {
  const f = await authFixture(t);
  const value = data();
  await set(f.store, 'session-a', value);
  assert.equal((await get(f.store, 'session-a'))!.expiresAt, value.expiresAt);
  const before = f.database.prepare('SELECT * FROM sessions').all();
  f.store.touch('session-a', value, (error) => assert.equal(error, null));
  assert.deepEqual(f.database.prepare('SELECT * FROM sessions').all(), before);
  const expiresAt = value.expiresAt!;
  t.mock.method(Date, 'now', () => expiresAt);
  assert.equal(await get(f.store, 'session-a'), undefined);
  f.store.destroy('session-a', (error) => assert.equal(error, null));
  assert.deepEqual(f.database.prepare('SELECT * FROM sessions').all(), []);
});

test('corrupt session JSON/shape fails safely with exactly one callback', async (t) => {
  const f = await authFixture(t);
  f.database.pragma('ignore_check_constraints = ON');
  for (const corrupt of ['not-json', '{}', '{"cookie":null}', JSON.stringify({ ...data(), expiresAt: 0 })]) {
    f.database.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?)').run('broken', Date.now() + 60_000, corrupt);
    let calls = 0;
    f.store.get('broken', (error) => { calls++; assertStoreError(error); });
    assert.equal(calls, 1);
  }
  f.database.pragma('ignore_check_constraints = OFF');
  assert.throws(() => f.database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('bad-json', Date.now(), 'bad'));
});

test('invalid session writes and consumer callback exceptions do not double-invoke callbacks', async (t) => {
  const f = await authFixture(t);
  let calls = 0;
  f.store.set('invalid', { cookie: new session.Cookie() }, (error) => {
    calls++; assertStoreError(error);
  });
  assert.equal(calls, 1);
  calls = 0;
  assert.throws(() => f.store.get('absent', () => { calls++; throw new Error('consumer'); }), /consumer/);
  assert.equal(calls, 1);
});

test('periodic cleanup affects only expired session rows; disposal cancels it without closing the database', async (t) => {
  const f = await authFixture(t);
  const user = findOrCreateUser(f.database, { subject: 'cleanup-user', email: 'a@example.test' });
  const store = new SQLiteSessionStore(f.database, 10);
  try {
    f.database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('expired', Date.now() - 1, '{}');
    await delay(60);
    assert.deepEqual(f.database.prepare('SELECT * FROM sessions').all(), []);
    assert.deepEqual(f.database.prepare('SELECT id FROM users').all(), [{ id: user.id }]);
    store.dispose();
    store.dispose();
    f.database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run('after-dispose', Date.now() - 1, '{}');
    await delay(40);
    assert.deepEqual(f.database.prepare('SELECT sid FROM sessions').all(), [{ sid: 'after-dispose' }]);
    assert.equal(f.database.open, true);
    let callbacks = 0;
    store.get('anything', (error) => { callbacks++; assertStoreError(error); });
    assert.equal(callbacks, 1);
  } finally { store.dispose(); }
});
