import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as tick } from 'node:timers/promises';
import { AuthController } from '../src/auth/controller.ts';
import { AuthError } from '../src/auth/api.ts';
import type { AuthApi, Session } from '../src/auth/api.ts';

const anonymous: Session = { authenticated: false };
const account: Session = { authenticated: true, user: { id: 'a'.repeat(36), username: null }, requiresOnboarding: true };

function fixture(overrides: Partial<AuthApi> = {}) {
  const calls: string[] = [];
  let current = anonymous;
  const api: AuthApi = {
    session: async () => { calls.push('session'); return current; },
    csrf: async () => { calls.push('csrf'); return 'x'.repeat(43); },
    login: async () => { calls.push('login'); current = account; return account; },
    setUsername: async (username) => { calls.push('username'); current = { ...account, authenticated: true,
      user: { id: 'a'.repeat(36), username }, requiresOnboarding: false }; return current; },
    logout: async () => { calls.push('logout'); current = anonymous; }, ...overrides,
  };
  const controller = new AuthController(api);
  controller.activate();
  return { controller, calls };
}

test('restore, duplicate login guard, fresh CSRF per mutation and logout work without credential retention', async () => {
  const { controller, calls } = fixture();
  await tick();
  await Promise.all([controller.login('private.a.b'), controller.login('duplicate.a.b')]);
  assert.deepEqual(controller.snapshot().session, account);
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /private|duplicate|csrfToken/);
  await controller.logout();
  assert.deepEqual(controller.snapshot().session, anonymous);
  assert.deepEqual(calls, ['session', 'csrf', 'login', 'csrf', 'logout']);
  controller.deactivate();
});

test('initial failed session inspection is unknown, blocks mutations, and has a read-only retry', async () => {
  let reads = 0;
  const { controller, calls } = fixture({ session: async () => { if (++reads === 1) throw new Error(); return anonymous; } });
  await tick();
  assert.deepEqual(controller.snapshot(), { session: null, pending: null, error: 'unavailable' });
  await controller.login('a.b.c');
  assert.deepEqual(calls, []);
  await controller.refresh();
  assert.deepEqual(controller.snapshot().session, anonymous);
  controller.deactivate();
});

test('lost login success is reconciled instead of automatically replaying the mutation', async () => {
  let reads = 0;
  let writes = 0;
  const { controller } = fixture({
    session: async () => ++reads === 1 ? anonymous : account,
    login: async () => { writes++; throw new AuthError('NETWORK'); },
  });
  await tick();
  await controller.login('a.b.c');
  assert.deepEqual(controller.snapshot(), { session: account, pending: null, error: 'network' });
  assert.equal(writes, 1);
  assert.equal(reads, 2);
  controller.deactivate();
});

test('lost logout response reconciles to confirmed anonymous; failed reconciliation blocks new mutations', async () => {
  for (const fail of [false, true]) {
    let reads = 0;
    let writes = 0;
    const { controller } = fixture({
      session: async () => { if (++reads === 1) return account; if (fail) throw new Error(); return anonymous; },
      logout: async () => { writes++; throw new AuthError('NETWORK'); },
    });
    await tick();
    await controller.logout();
    assert.deepEqual(controller.snapshot().session, fail ? null : anonymous);
    assert.equal(controller.snapshot().error, fail ? 'unavailable' : 'network');
    await controller.logout();
    assert.equal(writes, 1);
    controller.deactivate();
  }
});

test('CSRF failure refreshes session but never repeats the mutation; explicit retry fetches a new token', async () => {
  let writes = 0;
  const { controller, calls } = fixture({ login: async () => {
    writes++; if (writes === 1) throw new AuthError('CSRF_INVALID'); return account;
  } });
  await tick();
  await controller.login('a.b.c');
  assert.equal(controller.snapshot().error, 'security');
  assert.equal(writes, 1);
  await controller.login('a.b.c');
  assert.equal(writes, 2);
  assert.deepEqual(calls, ['session', 'csrf', 'session', 'csrf']);
  controller.deactivate();
});

test('StrictMode cleanup ignores obsolete reads and unmount during CSRF prevents POST', async () => {
  const old = Promise.withResolvers<Session>();
  let reads = 0;
  const csrf = Promise.withResolvers<string>();
  let writes = 0;
  const { controller } = fixture({ session: async () => ++reads === 1 ? old.promise : anonymous,
    csrf: () => csrf.promise, login: async () => { writes++; return account; } });
  controller.deactivate();
  controller.activate();
  await tick();
  old.resolve(account);
  await tick();
  assert.deepEqual(controller.snapshot().session, anonymous);
  const pending = controller.login('a.b.c');
  controller.deactivate();
  csrf.resolve('x'.repeat(43));
  await pending;
  assert.equal(writes, 0);
});

test('deactivation ignores a late mutation response and does not mutate a remounted controller', async () => {
  const response = Promise.withResolvers<Session>();
  const { controller } = fixture({ login: () => response.promise });
  await tick();
  const pending = controller.login('a.b.c');
  await tick();
  controller.deactivate();
  controller.activate();
  await tick();
  response.resolve(account);
  await pending;
  assert.deepEqual(controller.snapshot().session, anonymous);
  controller.deactivate();
});

test('username assignment fetches fresh CSRF, blocks duplicate/conflicting actions and cannot rename a configured account', async () => {
  const pending = Promise.withResolvers<Session>();
  let writes = 0;
  const { controller, calls } = fixture({ session: async () => account,
    setUsername: async (_name, token) => { writes++; assert.equal(token, 'x'.repeat(43)); return pending.promise; } });
  await tick();
  const save = controller.setUsername('Luna_7');
  await controller.setUsername('Different');
  await controller.logout();
  await tick();
  assert.equal(controller.snapshot().pending, 'savingUsername');
  assert.equal(writes, 1);
  pending.resolve({ authenticated: true, user: { id: 'a'.repeat(36), username: 'Luna_7' }, requiresOnboarding: false });
  await save;
  assert.equal(controller.snapshot().error, null);
  await controller.setUsername('Different');
  assert.equal(writes, 1);
  assert.deepEqual(calls, ['csrf']);
  controller.deactivate();
});

test('username errors reconcile without replay; stale-tab or lost-success results suppress obsolete form errors', async () => {
  for (const completed of [false, true]) {
    let reads = 0;
    let writes = 0;
    const saved: Session = { authenticated: true, user: { id: 'a'.repeat(36), username: 'OtherTab' }, requiresOnboarding: false };
    const { controller } = fixture({ session: async () => ++reads > 1 && completed ? saved : account,
      setUsername: async () => { writes++; throw new AuthError(completed ? 'USERNAME_ALREADY_SET' : 'USERNAME_TAKEN'); } });
    await tick();
    await controller.setUsername('Luna_7');
    assert.deepEqual(controller.snapshot().session, completed ? saved : account);
    assert.equal(controller.snapshot().error, completed ? null : 'usernameTaken');
    assert.equal(reads, 2);
    assert.equal(writes, 1);
    controller.deactivate();
  }
});

test('username failed reconciliation locks writes; read-only retry observes completion or expired account', async () => {
  for (const result of [anonymous, { authenticated: true, user: { id: 'a'.repeat(36), username: 'Luna_7' }, requiresOnboarding: false }] as Session[]) {
    let reads = 0;
    let writes = 0;
    const { controller } = fixture({ session: async () => { if (++reads === 1) return account; if (reads === 2) throw new Error(); return result; },
      setUsername: async () => { writes++; throw new AuthError('NETWORK'); } });
    await tick();
    await controller.setUsername('Luna_7');
    assert.equal(controller.snapshot().session, null);
    await controller.setUsername('Retry');
    assert.equal(writes, 1);
    await controller.refresh();
    assert.deepEqual(controller.snapshot().session, result);
    controller.deactivate();
  }
});

test('username CSRF rejection/expiry never replays a mutation and deactivation prevents a stale save', async () => {
  let reads = 0;
  const { controller } = fixture({ session: async () => ++reads === 1 ? account : anonymous,
    setUsername: async () => { throw new AuthError('CSRF_INVALID'); } });
  await tick();
  await controller.setUsername('Luna');
  assert.deepEqual(controller.snapshot().session, anonymous);
  controller.deactivate();
  const csrf = Promise.withResolvers<string>();
  let writes = 0;
  const second = fixture({ session: async () => account, csrf: () => csrf.promise,
    setUsername: async () => { writes++; return account; } });
  await tick();
  const pending = second.controller.setUsername('Luna');
  second.controller.deactivate();
  csrf.resolve('x'.repeat(43));
  await pending;
  assert.equal(writes, 0);
});
