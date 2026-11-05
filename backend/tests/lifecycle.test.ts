import assert from 'node:assert/strict';
import { createServer, Agent, get } from 'node:http';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { installLifecycle } from '../src/lifecycle.js';
import { closeDatabase } from '../src/database/connection.js';
import { databaseFixture } from './database-helpers.js';
import { listen, startChild } from './helpers.js';

test('closes idle keep-alive connections and unregisters process handlers', async (t) => {
  const server = createServer((_req, res) => res.end('ok'));
  const url = await listen(server, t);
  const agent = new Agent({ keepAlive: true });
  t.after(() => agent.destroy());
  await new Promise<void>((resolve, reject) => {
    get(url, { agent }, (res) => { res.resume(); res.once('end', resolve); }).once('error', reject);
  });
  const events = ['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'] as const;
  const initialCounts = events.map((event) => process.listenerCount(event));
  const result = Promise.withResolvers<number>();
  const shutdown = installLifecycle(server, { timeoutMs: 500, exit: result.resolve });
  events.forEach((event, index) => assert.equal(process.listenerCount(event), initialCounts[index]! + 1));
  shutdown();
  assert.equal(await result.promise, 0);
  events.forEach((event, index) => assert.equal(process.listenerCount(event), initialCounts[index]));
  assert.equal(server.listening, false);
});

test('drains an in-flight request; repeated shutdown is idempotent', async (t) => {
  const db = databaseFixture(t).open();
  let requestFinished = false;
  let cleanupCalls = 0;
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const server = createServer(async (_req, res) => {
    started.resolve();
    await release.promise;
    assert.deepEqual(db.prepare('SELECT 1 AS value').get(), { value: 1 });
    requestFinished = true;
    res.end('completed');
  });
  const url = await listen(server, t);
  const results: number[] = [];
  const done = Promise.withResolvers<void>();
  const shutdown = installLifecycle(server, {
    timeoutMs: 500,
    cleanup: () => {
      assert.equal(requestFinished, true);
      cleanupCalls++;
      closeDatabase(db);
    },
    exit: (code) => { results.push(code); done.resolve(); },
  });
  const response = fetch(url);
  await started.promise;
  shutdown();
  shutdown();
  assert.deepEqual(results, []);
  assert.equal(server.listening, false);
  release.resolve();
  assert.equal(await (await response).text(), 'completed');
  await done.promise;
  await assert.rejects(fetch(url));
  shutdown();
  assert.deepEqual(results, [0]);
  assert.equal(cleanupCalls, 1);
  assert.equal(db.open, false);
});

test('forces stalled requests closed at the deadline with a failing exit code', async (t) => {
  t.mock.method(console, 'error', () => {});
  const db = databaseFixture(t).open();
  let cleanupCalls = 0;
  const started = Promise.withResolvers<void>();
  const server = createServer(() => started.resolve());
  const url = await listen(server, t);
  const request = fetch(url).then(() => 'unexpected response', () => 'closed');
  await started.promise;
  const done = Promise.withResolvers<number>();
  const shutdown = installLifecycle(server, {
    timeoutMs: 50, exit: done.resolve, cleanup: () => { cleanupCalls++; closeDatabase(db); },
  });
  const start = performance.now();
  shutdown();
  assert.equal(await done.promise, 1);
  assert.ok(performance.now() - start < 1_000);
  assert.equal(await request, 'closed');
  assert.equal(cleanupCalls, 1);
  assert.equal(db.open, false);
});

test('fatal failure during draining upgrades the exit status without restarting shutdown', async (t) => {
  const server = createServer((_req, res) => res.end());
  await listen(server, t);
  const done = Promise.withResolvers<number>();
  const shutdown = installLifecycle(server, { exit: done.resolve });
  shutdown();
  shutdown(1);
  assert.equal(await done.promise, 1);
});

const fixture = `
  import { createServer } from 'node:http';
  import { installLifecycle } from './src/lifecycle.ts';
  const server = createServer((req, res) => res.end('ok'));
  installLifecycle(server);
  server.listen(0, '127.0.0.1', () => console.info('READY'));
  process.on('message', (message) => {
    if (message === 'SIGINT' || message === 'SIGTERM') process.emit(message);
    if (message === 'exception') setImmediate(() => { throw new Error('secret detail'); });
    if (message === 'rejection') Promise.reject(new Error('secret detail'));
    if (message === 'server-error') server.emit('error', new Error('secret detail'));
  });
`;

for (const command of ['SIGINT', 'SIGTERM', 'exception', 'rejection', 'server-error']) {
  test(`registered lifecycle handlers terminate a child process for ${command}`, async (t) => {
    const child = startChild(t, ['--import=tsx', '--input-type=module', '-e', fixture]);
    await child.waitForOutput(/READY/);
    child.child.send(command);
    const result = await child.completed;
    assert.equal(result.code, command.startsWith('SIG') ? 0 : 1);
    assert.match(child.stdout, command.startsWith('SIG') ? /SHUTDOWN_COMPLETE/ : /SHUTDOWN_FAILED/);
    assert.doesNotMatch(child.stderr, /secret detail|\.ts:\d/);
  });
}

for (const kind of ['throw', 'rejection'] as const) {
  test(`cleanup ${kind} is safe, fails shutdown, and runs once`, async (t) => {
    const logs: unknown[][] = [];
    t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
    const server = createServer();
    await listen(server, t);
    const done = Promise.withResolvers<number>();
    let calls = 0;
    const shutdown = installLifecycle(server, {
      cleanup: () => {
        calls++;
        if (kind === 'throw') throw new Error('private cleanup contents');
        return Promise.reject(new Error('private cleanup contents'));
      },
      exit: done.resolve,
    });
    shutdown();
    shutdown();
    assert.equal(await done.promise, 1);
    assert.equal(calls, 1);
    assert.match(JSON.stringify(logs), /CLEANUP_ERROR/);
    assert.doesNotMatch(JSON.stringify(logs), /private/);
  });
}

test('an unsettled cleanup is forced within the original shutdown deadline', async (t) => {
  const logs: unknown[][] = [];
  t.mock.method(console, 'info', (...args: unknown[]) => { logs.push(args); });
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  const server = createServer();
  await listen(server, t);
  const done = Promise.withResolvers<number>();
  let calls = 0;
  const shutdown = installLifecycle(server, {
    timeoutMs: 50, cleanup: () => { calls++; return new Promise(() => {}); }, exit: done.resolve,
  });
  shutdown();
  shutdown();
  assert.equal(await done.promise, 1);
  assert.equal(calls, 1);
  assert.match(JSON.stringify(logs), /SHUTDOWN_FORCED/);
  assert.doesNotMatch(JSON.stringify(logs), /SHUTDOWN_COMPLETE/);
});

test('HTTP draining and async cleanup share one deadline instead of two budgets', async (t) => {
  t.mock.method(console, 'error', () => {});
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const server = createServer(async (_req, res) => {
    started.resolve();
    await release.promise;
    res.end('ok');
  });
  const url = await listen(server, t);
  const cleanupDone = Promise.withResolvers<void>();
  const done = Promise.withResolvers<number>();
  const shutdown = installLifecycle(server, { timeoutMs: 150, cleanup: () => cleanupDone.promise, exit: done.resolve });
  const response = fetch(url);
  await started.promise;
  shutdown();
  await delay(80);
  release.resolve();
  await (await response).text();
  assert.equal(await done.promise, 1);
  cleanupDone.resolve();
});

test('fatal errors while cleanup is pending upgrade the exit code without repeating cleanup', async (t) => {
  const server = createServer();
  await listen(server, t);
  const cleanupStarted = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const done = Promise.withResolvers<number>();
  let calls = 0;
  const shutdown = installLifecycle(server, {
    cleanup: () => { calls++; cleanupStarted.resolve(); return release.promise; }, exit: done.resolve,
  });
  shutdown();
  await cleanupStarted.promise;
  shutdown(1);
  shutdown();
  release.resolve();
  assert.equal(await done.promise, 1);
  assert.equal(calls, 1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`actual ${signal} delivery drains a child process`, {
    skip: process.platform === 'win32' ? 'Windows subprocess.kill terminates instead of delivering POSIX signals.' : false,
  }, async (t) => {
    const child = startChild(t, ['--import=tsx', '--input-type=module', '-e', fixture]);
    await child.waitForOutput(/READY/);
    child.child.kill(signal);
    assert.equal((await child.completed).code, 0);
    assert.match(child.stdout, /SHUTDOWN_COMPLETE/);
  });
}
