import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { before, test } from 'node:test';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { databaseFixture } from './database-helpers.js';
import { backendDirectory, listen, startChild } from './helpers.js';
import { runMigrations } from '../src/database/migrations.js';
import { migrationCatalog } from '../src/database/migration-catalog.js';

function serviceFixture(t: TestContext) {
  const children: ReturnType<typeof startChild>[] = [];
  t.after(async () => {
    for (const { child, completed } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await completed;
    }
  });
  const fixture = databaseFixture(t);
  return { ...fixture, start(args: string[], env: NodeJS.ProcessEnv = {}, cwd = backendDirectory) {
    const child = startChild(t, args, { DATABASE_PATH: fixture.config.databasePath, ...env }, cwd);
    children.push(child);
    return child;
  } };
}

const monitorClose = `
  import Database from 'better-sqlite3';
  const originalClose = Database.prototype.close;
  Database.prototype.close = function () {
    const result = originalClose.call(this);
    if (this.open) throw new Error('Database remained open');
    console.info('DATABASE_CLOSED');
    return result;
  };
`;

before(async () => {
  await promisify(execFile)(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json'], {
    cwd: backendDirectory,
    timeout: 10_000,
  });
});

test('compiled production startup respects configuration and serves health/404', async (t) => {
  // Reserve then release an OS-assigned port; never assume a fixed custom port is free.
  const reservation = createServer();
  const url = await listen(reservation, t);
  const port = new URL(url).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const child = startChild(t, ['dist/server.js'], { PORT: port, NODE_ENV: 'production' });
  await child.waitForOutput(new RegExp(`LISTENING:.*port ${port}\\.`));
  assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { status: 'ok' });
  const missing = await fetch(`${url}/api/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  assert.equal(child.stderr, '');
  const db = new Database(child.databasePath, { readonly: true });
  try {
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all(), [
      { name: 'schema_migrations' },
      { name: 'users' },
      { name: 'sessions' },
      { name: 'sessions_expires_at_idx' },
      { name: 'users_username_nocase_idx' },
    ]);
    assert.deepEqual(db.prepare('SELECT version, name FROM schema_migrations').all(), [
      { version: 1, name: 'create_authentication_tables' },
      { version: 2, name: 'create_case_insensitive_username_index' },
    ]);
  } finally { db.close(); }
});

test('compiled startup works with default configuration when port 3000 is available', async (t) => {
  const child = startChild(t, ['dist/server.js']);
  try {
    await child.waitForOutput(/LISTENING:.*port 3000\./);
  } catch (error) {
    if (child.stderr.includes('EADDRINUSE')) {
      t.skip('Default port 3000 is already occupied; pure configuration defaults are tested separately.');
      return;
    }
    throw error;
  }
  const response = await fetch('http://127.0.0.1:3000/api/health');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

for (const config of [{ PORT: 'private-invalid-port' }, { NODE_ENV: 'private-invalid-environment' }]) {
  test(`compiled startup rejects invalid ${Object.keys(config)[0]} safely`, async (t) => {
    const child = startChild(t, ['dist/server.js'], config);
    assert.equal((await child.completed).code, 1);
    assert.match(child.stderr, /CONFIG_ERROR:/);
    assert.doesNotMatch(child.stderr, /private-invalid|\.js:\d/);
    assert.doesNotMatch(child.stdout, /LISTENING/);
  });
}

test('compiled startup reports occupied ports and exits with status 1', async (t) => {
  const url = await listen(createServer(), t, '0.0.0.0');
  const child = startChild(t, ['--input-type=module', '-e', `${monitorClose}\nawait import('./dist/server.js');`], {
    PORT: new URL(url).port,
  });
  assert.equal((await child.completed).code, 1);
  assert.match(child.stderr, /EADDRINUSE/);
  assert.doesNotMatch(child.stderr, /\.js:\d/);
  assert.equal(child.stdout.match(/DATABASE_CLOSED/g)?.length, 1);
  assert.match(child.stdout, /SHUTDOWN_FAILED/);
});

test('compiled entry point uses registered shutdown handlers without a development loader', async (t) => {
  const reservation = createServer();
  const url = await listen(reservation, t);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const bootstrap = `
    ${monitorClose}
    await import('./dist/server.js');
    process.on('message', () => process.emit('SIGTERM'));
  `;
  const child = startChild(t, ['--input-type=module', '-e', bootstrap], {
    PORT: new URL(url).port, NODE_ENV: 'production',
  });
  await child.waitForOutput(/LISTENING/);
  child.child.send('stop');
  assert.equal((await child.completed).code, 0);
  assert.match(child.stdout, /SHUTDOWN_COMPLETE/);
  assert.equal(child.stdout.match(/DATABASE_CLOSED/g)?.length, 1);
});

for (const path of [undefined, '', 'data/relative.sqlite', ':memory:']) {
  test(`production startup rejects missing/invalid storage ${JSON.stringify(path)}`, async (t) => {
    const child = startChild(t, ['dist/server.js'], { NODE_ENV: 'production', DATABASE_PATH: path });
    assert.equal((await child.completed).code, 1);
    assert.match(child.stderr, /CONFIG_ERROR: DATABASE_PATH/);
    assert.doesNotMatch(child.stdout, /LISTENING/);
  });
}

for (const kind of ['missing-parent', 'directory-file', 'corrupt-file', 'unrelated-schema'] as const) {
  test(`production startup rejects unusable storage: ${kind}`, async (t) => {
    const fixture = serviceFixture(t);
    let path = fixture.config.databasePath;
    if (kind === 'missing-parent') path = join(fixture.directory, 'missing', 'game.sqlite');
    if (kind === 'directory-file') mkdirSync(path);
    if (kind === 'corrupt-file') writeFileSync(path, 'private invalid database');
    if (kind === 'unrelated-schema') {
      const db = fixture.open();
      db.exec('CREATE TABLE unrelated (value TEXT)');
      db.close();
    }
    const child = fixture.start(['dist/server.js'], { NODE_ENV: 'production', DATABASE_PATH: path });
    assert.equal((await child.completed).code, 1);
    assert.match(child.stderr, /DATABASE_(STORAGE|OPEN|SETUP)_ERROR|MIGRATION_HISTORY_ERROR/);
    assert.doesNotMatch(child.stderr, /private|\.js:\d/);
    assert.doesNotMatch(child.stdout, /LISTENING/);
    if (kind === 'missing-parent') assert.equal(existsSync(join(fixture.directory, 'missing')), false);
    if (kind === 'corrupt-file') assert.equal(readFileSync(path, 'utf8'), 'private invalid database');
  });
}

test('a failed migration through the real startup closes the database and never listens', async (t) => {
  const fixture = serviceFixture(t);
  const bootstrap = `
    ${monitorClose}
    import { startService } from './dist/startup.js';
    import { loadConfig } from './dist/config.js';
    try {
      startService(loadConfig(process.env, process.cwd()), [{
        version: 1, name: 'fails', sql: 'CREATE TABLE private_fixture (id INTEGER); INVALID SQL;',
      }]);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  `;
  const child = fixture.start(['--input-type=module', '-e', bootstrap]);
  assert.equal((await child.completed).code, 1);
  assert.match(child.stderr, /MIGRATION_FAILED/);
  assert.doesNotMatch(child.stderr, /private|INVALID SQL|\.js:\d/);
  assert.doesNotMatch(child.stdout, /LISTENING/);
  assert.equal(child.stdout.match(/DATABASE_CLOSED/g)?.length, 1);
  const db = fixture.open();
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(), []);
  assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'private_fixture'").get(), undefined);
});

test('fixture data survives a service-process restart with migrations applied only once', async (t) => {
  const fixture = serviceFixture(t);
  const reservation = createServer();
  const url = await listen(reservation, t);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const bootstrap = `
    ${monitorClose}
    import { startService } from './dist/startup.js';
    import { loadConfig } from './dist/config.js';
    import { migrationCatalog } from './dist/database/migration-catalog.js';
    const service = startService(loadConfig(process.env, process.cwd()), [...migrationCatalog, {
      version: migrationCatalog.length + 1, name: 'fixture', sql: 'CREATE TABLE fixture (value TEXT NOT NULL) STRICT;',
    }]);
    console.info('ROW_COUNT: ' + service.database.prepare('SELECT COUNT(*) AS count FROM fixture').get().count);
    process.on('message', (message) => {
      if (message === 'write') {
        service.database.transaction(() => service.database.prepare('INSERT INTO fixture VALUES (?)').run('persisted')).immediate();
        console.info('COMMITTED');
      } else { service.shutdown(); }
    });
  `;
  const env = { PORT: new URL(url).port, NODE_ENV: 'production' };
  const first = fixture.start(['--input-type=module', '-e', bootstrap], env);
  await first.waitForOutput(/LISTENING/);
  assert.match(first.stdout, /ROW_COUNT: 0/);
  first.child.send('write');
  await first.waitForOutput(/COMMITTED/);
  first.child.send('stop');
  assert.equal((await first.completed).code, 0);

  const second = fixture.start(['--input-type=module', '-e', bootstrap], env);
  await second.waitForOutput(/LISTENING/);
  assert.match(second.stdout, /ROW_COUNT: 1/);
  assert.doesNotMatch(second.stdout, /MIGRATION_APPLIED/);
  second.child.send('stop');
  assert.equal((await second.completed).code, 0);
  const db = fixture.open();
  assert.deepEqual(db.prepare('SELECT value FROM fixture').all(), [{ value: 'persisted' }]);
});

test('source and compiled entry points resolve relative storage identically from another working directory', async (t) => {
  const fixture = serviceFixture(t);
  const reservation = createServer();
  const url = await listen(reservation, t);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  for (const entry of ['src/server.ts', 'dist/server.js']) {
    const entryUrl = pathToFileURL(join(backendDirectory, entry)).href;
    const bootstrap = `await import(${JSON.stringify(entryUrl)}); process.on('message', () => process.emit('SIGTERM'));`;
    const loader = entry.endsWith('.ts') ? [`--import=${import.meta.resolve('tsx')}`] : [];
    const child = fixture.start([...loader, '--input-type=module', '-e', bootstrap], {
      NODE_ENV: 'test', PORT: new URL(url).port,
      DATABASE_PATH: relative(backendDirectory, fixture.config.databasePath),
    }, fixture.directory);
    await child.waitForOutput(/LISTENING/);
    assert.equal(existsSync(fixture.config.databasePath), true);
    child.child.send('stop');
    assert.equal((await child.completed).code, 0);
  }
  const db = fixture.open();
  assert.deepEqual(db.prepare('SELECT version FROM schema_migrations').all(), [{ version: 1 }, { version: 2 }]);
});

test('a fatal error in the actual service still closes its database before failing', async (t) => {
  const reservation = createServer();
  const url = await listen(reservation, t);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const bootstrap = `${monitorClose}
    await import('./dist/server.js');
    process.on('message', () => { throw new Error('private fatal details'); });
  `;
  const child = startChild(t, ['--input-type=module', '-e', bootstrap], { PORT: new URL(url).port });
  await child.waitForOutput(/LISTENING/);
  child.child.send('fail');
  assert.equal((await child.completed).code, 1);
  assert.equal(child.stdout.match(/DATABASE_CLOSED/g)?.length, 1);
  assert.match(child.stdout, /SHUTDOWN_FAILED/);
  assert.doesNotMatch(child.stderr, /private fatal|\.js:\d/);
});

for (const key of ['GOOGLE_CLIENT_ID', 'SESSION_SECRET'] as const) {
  test(`startup requires ${key} without creating a fallback database`, async (t) => {
    const child = startChild(t, ['dist/server.js'], { [key]: undefined });
    assert.equal((await child.completed).code, 1);
    assert.match(child.stderr, new RegExp(`CONFIG_ERROR: ${key}`));
    assert.equal(existsSync(child.databasePath), false);
  });
}

test('authenticated cookies persist across restart; key changes, logout, and expiry prevent reuse', async (t) => {
  const fixture = serviceFixture(t);
  const reservation = createServer();
  const url = await listen(reservation, t);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const bootstrap = `
    import { startService } from './dist/startup.js';
    import { loadConfig } from './dist/config.js';
    import { migrationCatalog } from './dist/database/migration-catalog.js';
    const service = startService(loadConfig(process.env, process.cwd()), migrationCatalog,
      async () => ({ subject: 'restart-subject', email: 'restart@example.test' }));
    if (service.store.database !== service.database) throw new Error('Connections are not shared');
    process.on('message', () => service.shutdown());
  `;
  const env = { PORT: new URL(url).port, NODE_ENV: 'test', SESSION_TTL_SECONDS: '60' };
  const args = ['--input-type=module', '-e', bootstrap];
  let child = fixture.start(args, env);
  const stop = async () => { child.child.send('stop'); assert.equal((await child.completed).code, 0); };
  await child.waitForOutput(/LISTENING/);
  const origin = fixture.config.appOrigin;
  const pre = await fetch(`${url}/api/auth/csrf`);
  const preCookie = pre.headers.getSetCookie()[0]!.split(';')[0]!;
  const csrf = (await pre.json() as { csrfToken: string }).csrfToken;
  const login = await fetch(`${url}/api/auth/google`, { method: 'POST', headers: {
    origin, cookie: preCookie, 'x-csrf-token': csrf, 'content-type': 'application/json',
  }, body: '{"credential":"a.b.c"}' });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie()[0]!.split(';')[0]!;
  const loggedIn = await login.json() as { user: { id: string; username: string | null }; csrfToken: string };
  const setup = await fetch(`${url}/api/auth/username`, { method: 'POST', headers: {
    origin, cookie, 'x-csrf-token': loggedIn.csrfToken, 'content-type': 'application/json',
  }, body: '{"username":"Restart_Player"}' });
  assert.equal(setup.status, 200);
  loggedIn.user.username = 'Restart_Player';
  assert.deepEqual(await setup.json(), { authenticated: true, user: loggedIn.user, requiresOnboarding: false });
  await stop();

  child = fixture.start(args, env);
  await child.waitForOutput(/LISTENING/);
  const restored = await fetch(`${url}/api/auth/session`, { headers: { cookie } });
  assert.deepEqual(await restored.json(), { authenticated: true, user: loggedIn.user, requiresOnboarding: false });
  await stop();

  child = fixture.start(args, { ...env, SESSION_SECRET: 'b'.repeat(64) });
  await child.waitForOutput(/LISTENING/);
  const changedKey = await fetch(`${url}/api/auth/session`, { headers: { cookie } });
  assert.deepEqual(await changedKey.json(), { authenticated: false });
  await stop();

  child = fixture.start(args, env);
  await child.waitForOutput(/LISTENING/);
  const logout = await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: {
    origin, cookie, 'x-csrf-token': loggedIn.csrfToken,
  } });
  assert.equal(logout.status, 204);
  await stop();

  child = fixture.start(args, env);
  await child.waitForOutput(/LISTENING/);
  const loggedOut = await fetch(`${url}/api/auth/session`, { headers: { cookie } });
  assert.deepEqual(await loggedOut.json(), { authenticated: false });
  const nextPre = await fetch(`${url}/api/auth/csrf`);
  const nextCsrf = (await nextPre.json() as { csrfToken: string }).csrfToken;
  const nextLogin = await fetch(`${url}/api/auth/google`, { method: 'POST', headers: {
    origin, cookie: nextPre.headers.getSetCookie()[0]!.split(';')[0]!, 'x-csrf-token': nextCsrf, 'content-type': 'application/json',
  }, body: '{"credential":"a.b.c"}' });
  assert.equal(nextLogin.status, 200);
  const nextCookie = nextLogin.headers.getSetCookie()[0]!.split(';')[0]!;
  assert.deepEqual((await nextLogin.json() as { user: unknown }).user, loggedIn.user);
  await stop();
  const db = fixture.open();
  db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
  db.close();

  child = fixture.start(args, env);
  await child.waitForOutput(/LISTENING/);
  const expired = await fetch(`${url}/api/auth/session`, { headers: { cookie: nextCookie } });
  assert.deepEqual(await expired.json(), { authenticated: false });
  await stop();
});

test('adapter disposal precedes one shared database close, even if disposal fails', async (t) => {
  const reservation = createServer();
  const url = await listen(reservation, t);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const bootstrap = `${monitorClose}
    import { SQLiteSessionStore } from './dist/auth/session-store.js';
    const originalDispose = SQLiteSessionStore.prototype.dispose;
    SQLiteSessionStore.prototype.dispose = function () {
      originalDispose.call(this);
      if (!this.database.open) throw new Error('Closed too early');
      console.info('ADAPTER_DISPOSED');
      throw new Error('private disposal failure');
    };
    await import('./dist/server.js');
    process.on('message', () => process.emit('SIGTERM'));
  `;
  const child = startChild(t, ['--input-type=module', '-e', bootstrap], { PORT: new URL(url).port });
  await child.waitForOutput(/LISTENING/);
  child.child.send('stop');
  assert.equal((await child.completed).code, 1);
  assert.equal(child.stdout.match(/DATABASE_CLOSED/g)?.length, 1);
  assert.match(child.stdout, /ADAPTER_DISPOSED[\s\S]*DATABASE_CLOSED[\s\S]*SHUTDOWN_FAILED/);
  assert.match(child.stderr, /CLEANUP_ERROR/);
  assert.doesNotMatch(child.stderr, /private disposal/);
});

test('session-adapter initialization failure releases the shared database before listening', async (t) => {
  const bootstrap = `${monitorClose}
    import { startService } from './dist/startup.js';
    import { loadConfig } from './dist/config.js';
    try { startService(loadConfig(process.env, process.cwd()), []); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  `;
  const child = startChild(t, ['--input-type=module', '-e', bootstrap]);
  assert.equal((await child.completed).code, 1);
  assert.doesNotMatch(child.stdout, /LISTENING/);
  assert.equal(child.stdout.match(/DATABASE_CLOSED/g)?.length, 1);
  assert.match(child.stderr, /STARTUP_ERROR/);
  assert.doesNotMatch(child.stderr, /\.js:\d/);
});

test('legacy username collisions prevent startup safely without changing account data', async (t) => {
  const fixture = serviceFixture(t);
  const db = fixture.open();
  runMigrations(db, migrationCatalog.slice(0, 1));
  for (const [index, name] of ['PrivateLuna', 'privateluna'].entries()) {
    db.prepare('INSERT INTO users (id, google_id, email, username, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(String(index).repeat(36), `subject-${index}`, 'player@example.test', name, 1);
  }
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  db.close();
  const bootstrap = `${monitorClose}\nawait import('./dist/server.js');`;
  const child = fixture.start(['--input-type=module', '-e', bootstrap]);
  assert.equal((await child.completed).code, 1);
  assert.doesNotMatch(child.stdout, /LISTENING/);
  assert.equal(child.stdout.match(/DATABASE_CLOSED/g)?.length, 1);
  assert.match(child.stderr, /MIGRATION_FAILED/);
  assert.doesNotMatch(child.stderr, /PrivateLuna|privateluna|SQLITE|\.js:\d/);
  const reopened = fixture.open();
  assert.deepEqual(reopened.prepare('SELECT * FROM users ORDER BY id').all(), users);
  assert.deepEqual(reopened.prepare('SELECT version FROM schema_migrations').all(), [{ version: 1 }]);
});
