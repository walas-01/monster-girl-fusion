import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import type { RequestListener, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';
import { openDatabase } from '../src/database.ts';
import { runMigrations } from '../src/migrations.ts';
import { readPort, registerShutdown, startServer } from '../src/server.ts';

test('uses port 3000 when PORT is not defined', () => {
  assert.equal(readPort(undefined), 3000);
});

const validPorts = [
  { value: '1', expected: 1 },
  { value: '3000', expected: 3000 },
  { value: '4000', expected: 4000 },
  { value: '65535', expected: 65535 },
];

for (const { value, expected } of validPorts) {
  test(`accepts PORT=${value}`, () => {
    assert.equal(readPort(value), expected);
  });
}

const invalidPorts = [
  '',
  ' ',
  '\t',
  '\n',
  '0',
  '-1',
  '65536',
  '1.5',
  '3000junk',
  ' 3000',
  '3000 ',
  '3000\n',
  '3000\r\n',
  '+3000',
  '3e3',
  '0xBB8',
  'NaN',
  'Infinity',
  '9007199254740992',
];

for (const value of invalidPorts) {
  test(`rejects PORT=${JSON.stringify(value)}`, () => {
    assert.throws(() => readPort(value), {
      name: 'Error',
      message: 'PORT must be an integer between 1 and 65535.',
    });
  });
}

async function reserveTestPort(context: TestContext) {
  const listener = createServer((req, res) => {
    res.end('Reserved test port.');
  });

  context.after(async () => {
    if (!listener.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      listener.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });

      listener.closeAllConnections();
    });
  });

  // Match the backend's bind address; Windows can allow loopback and wildcard binds to coexist.
  listener.listen(0);
  await once(listener, 'listening');

  const address = listener.address();

  assert.ok(address && typeof address !== 'string');

  return { listener, address };
}

function registerChildCleanup(context: TestContext, child: ChildProcess, directory: string) {
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close', { signal: AbortSignal.timeout(2000) });

      child.kill('SIGKILL');
      await closed;
    }

    rmSync(directory, { recursive: true, force: true });
  });
}

for (const entry of ['src/index.ts', 'dist/index.js']) {
  test(`${entry} exits with an error when another listener owns the port`, { timeout: 10_000 }, async (context) => {
    if (entry === 'dist/index.js') {
      assert.ok(existsSync(new URL('../dist/index.js', import.meta.url)), 'Run npm run build before npm test.');
    }

    const { address } = await reserveTestPort(context);
    const directory = mkdtempSync(join(tmpdir(), 'monster-child-'));
    const runFile = promisify(execFile);
    const backendRun = runFile(process.execPath, [entry], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, PORT: String(address.port), DATABASE_PATH: join(directory, 'game.sqlite') },
      timeout: 5000,
      killSignal: 'SIGKILL',
      encoding: 'utf8',
    });

    registerChildCleanup(context, backendRun.child, directory);

    await assert.rejects(backendRun, {
      code: 1,
      killed: false,
      signal: null,
      stdout: '',
      stderr: /Unable to start HTTP server:.*EADDRINUSE/,
    });
    assert.equal(existsSync(join(directory, 'game.sqlite')), true);

    const loopbackHost = address.family === 'IPv6' ? '[::1]' : '127.0.0.1';
    const response = await fetch(`http://${loopbackHost}:${address.port}`, {
      signal: AbortSignal.timeout(2000),
    });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'Reserved test port.');
  });
}

for (const value of ['', 'invalid']) {
  test(`compiled entry rejects PORT=${JSON.stringify(value)} without starting`, { timeout: 10_000 }, async (context) => {
    assert.ok(existsSync(new URL('../dist/index.js', import.meta.url)), 'Run npm run build before npm test.');

    const directory = mkdtempSync(join(tmpdir(), 'monster-child-'));
    const runFile = promisify(execFile);
    const backendRun = runFile(process.execPath, ['dist/index.js'], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, PORT: value, DATABASE_PATH: join(directory, 'game.sqlite') },
      timeout: 5000,
      killSignal: 'SIGKILL',
      encoding: 'utf8',
    });

    registerChildCleanup(context, backendRun.child, directory);

    await assert.rejects(backendRun, {
      code: 1,
      killed: false,
      signal: null,
      stdout: '',
      stderr: 'Unable to start HTTP server: PORT must be an integer between 1 and 65535.\n',
    });
    assert.equal(existsSync(join(directory, 'game.sqlite')), false);
  });
}

test('compiled entry starts and serves health without TypeScript execution', { timeout: 10_000 }, async (context) => {
  assert.ok(existsSync(new URL('../dist/index.js', import.meta.url)), 'Run npm run build before npm test.');

  const { listener, address } = await reserveTestPort(context);

  // Release our reservation; a competing bind must fail startup, not trigger a port fallback.
  await new Promise<void>((resolve, reject) => {
    listener.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  const directory = mkdtempSync(join(tmpdir(), 'monster-child-'));
  const child = spawn(process.execPath, ['--no-strip-types', 'dist/index.js'], {
    cwd: new URL('../', import.meta.url),
    env: {
      ...process.env,
      PORT: String(address.port),
      NODE_ENV: 'production',
      DATABASE_PATH: join(directory, 'game.sqlite'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  registerChildCleanup(context, child, directory);
  assert.ok(child.stdout);
  assert.ok(child.stderr);

  let stderr = '';

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  const outputLines = createInterface({ input: child.stdout });

  context.after(() => {
    outputLines.close();
  });

  const [startupLine] = await once(outputLines, 'line', { signal: AbortSignal.timeout(3000) });

  assert.ok(startupLine.includes(String(address.port)));

  const loopbackHost = address.family === 'IPv6' ? '[::1]' : '127.0.0.1';
  const response = await fetch(`http://${loopbackHost}:${address.port}/api/health`, {
    headers: { Connection: 'close' },
    signal: AbortSignal.timeout(2000),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(child.exitCode, null);
  assert.equal(stderr, '');
  assert.equal(existsSync(join(directory, 'game.sqlite')), true);
});

for (const { entry, module, flags } of [
  { entry: 'src/index.ts', module: 'src/server.ts', flags: [] },
  { entry: 'dist/index.js', module: 'dist/server.js', flags: ['--no-strip-types'] },
]) {
  test(`${module} preserves data and migration history across two process starts`, { timeout: 15_000 }, async (context) => {
    assert.ok(existsSync(new URL(`../${module}`, import.meta.url)), 'Run npm run build before npm test.');

    const path = lifecycleStorage(context);
    const { listener, address } = await reserveTestPort(context);

    await promisify(listener.close.bind(listener))();

    const script = `
      import assert from 'node:assert/strict';
      import { startServer } from './${module}';

      const { server, shutdown } = await startServer();

      try {
        const address = server.address();
        const host = address.family === 'IPv6' ? '[::1]' : '127.0.0.1';
        const response = await fetch('http://' + host + ':' + address.port + '/api/health', {
          headers: { Connection: 'close' },
          signal: AbortSignal.timeout(2000),
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'ok' });
      } finally {
        await shutdown();
      }

      assert.equal(server.listening, false);
    `;
    let previous: unknown;

    for (const round of [1, 2]) {
      // This short-lived child exits itself after shutdown; SIGKILL is timeout cleanup only.
      const result = spawnSync(process.execPath, [...flags, '--input-type=module', '--eval', script], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, PORT: String(address.port), NODE_ENV: 'production', DATABASE_PATH: path },
        timeout: 5000,
        killSignal: 'SIGKILL',
        encoding: 'utf8',
      });

      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      assert.equal(result.stdout, `[PORT:${address.port}]: server is up and listening \n`);

      const database = new Database(path, { fileMustExist: true });

      try {
        if (round === 1) {
          assert.equal(database.prepare("SELECT count(*) FROM sqlite_schema WHERE type = 'table'").pluck().get(), 9);
          assert.deepEqual(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all(), [{ version: 1 }, { version: 2 }]);

          for (const table of ['users', 'player_progress', 'sessions', 'monster_species', 'enemy_species', 'monsters', 'monster_recipes', 'eggs']) {
            assert.deepEqual(database.prepare(`SELECT * FROM ${table}`).all(), []);
          }

          // Disposable persistence probe, not player initialization or game content.
          database.prepare(`
            INSERT INTO users (id, google_id, email, username, crystals, mushrooms, souls, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run('00000000-0000-4000-8000-000000000001', 'restart-probe', 'probe@example.invalid', 'Probe', 42, 0, 0, 0);
        }

        const snapshot = {
          schema: database.prepare('SELECT type, name, sql FROM sqlite_schema ORDER BY name').all(),
          history: database.prepare('SELECT * FROM schema_migrations ORDER BY version').all(),
          users: database.prepare('SELECT * FROM users ORDER BY id').all(),
        };

        if (round === 1) {
          previous = snapshot;
        } else {
          assert.deepEqual(snapshot, previous);
        }
      } finally {
        database.close();
      }
    }

    // The process has exited and its HTTP port must be available again.
    listener.listen(address.port);
    await once(listener, 'listening', { signal: AbortSignal.timeout(2000) });
  });

  for (const failure of ['missing parent', 'invalid file', 'unknown schema', 'changed history']) {
    test(`${entry} rejects ${failure} before HTTP bind and preserves existing storage`, { timeout: 10_000 }, async (context) => {
      assert.ok(existsSync(new URL(`../${entry}`, import.meta.url)), 'Run npm run build before npm test.');

      const path = lifecycleStorage(context);
      const { address } = await reserveTestPort(context);
      let configuredPath = path;
      let expectedError = /Unable to start HTTP server: Unable to open or configure SQLite database\./;
      let previous: unknown;
      let rowsSql = '';

      if (failure === 'missing parent') {
        configuredPath = join(path, 'missing', 'game.sqlite');
      } else if (failure === 'invalid file') {
        writeFileSync(path, 'Not a SQLite database.');
      } else {
        const database = new Database(path);

        try {
          if (failure === 'unknown schema') {
            database.exec("CREATE TABLE unknown_probe (value TEXT); INSERT INTO unknown_probe VALUES ('preserve');");
            rowsSql = 'SELECT * FROM unknown_probe';
            expectedError = /Unable to start HTTP server: Refusing to migrate a database with an unknown existing schema\./;
          } else {
            runMigrations(database);
            database.prepare('UPDATE schema_migrations SET sql_hash = ?').run('z'.repeat(64));
            rowsSql = 'SELECT * FROM schema_migrations ORDER BY version';
            expectedError = /Unable to start HTTP server: Incompatible migration history\./;
          }

          previous = {
            schema: database.prepare('SELECT type, name, sql FROM sqlite_schema ORDER BY name').all(),
            rows: database.prepare(rowsSql).all(),
          };
        } finally {
          database.close();
        }
      }

      // An occupied port makes the expected DB error prove initialization precedes binding.
      const result = spawnSync(process.execPath, [...flags, entry], {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, PORT: String(address.port), NODE_ENV: 'production', DATABASE_PATH: configuredPath },
        timeout: 5000,
        killSignal: 'SIGKILL',
        encoding: 'utf8',
      });

      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, expectedError);
      assert.doesNotMatch(result.stderr, /EADDRINUSE|probe@example|restart-probe/);

      if (failure === 'missing parent') {
        assert.equal(existsSync(path), false);
      } else if (failure === 'invalid file') {
        assert.equal(readFileSync(path, 'utf8'), 'Not a SQLite database.');
      } else {
        const database = new Database(path, { fileMustExist: true });

        try {
          assert.deepEqual({
            schema: database.prepare('SELECT type, name, sql FROM sqlite_schema ORDER BY name').all(),
            rows: database.prepare(rowsSql).all(),
          }, previous);
        } finally {
          database.close();
        }
      }
    });
  }
}

async function startShutdownTestServer(
  context: TestContext,
  handler: RequestListener,
  timeoutMs = 3000,
  closeDatabase?: () => void,
) {
  const server = createServer(handler);
  const shutdown = registerShutdown(server, timeoutMs, closeDatabase);

  context.after(async () => {
    server.closeAllConnections();

    try {
      await shutdown();
    } catch {
      // Timeout tests assert the rejection themselves; cleanup must still release connections.
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening', { signal: AbortSignal.timeout(2000) });

  const address = server.address();

  assert.ok(address && typeof address !== 'string');

  return { server, shutdown, baseUrl: `http://127.0.0.1:${address.port}` };
}

test('lets an active response finish while refusing new connections', { timeout: 5000 }, async (context) => {
  let pendingResponse: ServerResponse | undefined;

  const { server, shutdown, baseUrl } = await startShutdownTestServer(context, (req, res) => {
    pendingResponse = res;
  });
  const forcedClose = context.mock.method(server, 'closeAllConnections');
  const received = once(server, 'request', { signal: AbortSignal.timeout(2000) });
  // End this client connection with the response instead of waiting for an idle keep-alive timeout.
  const responseResult = fetch(baseUrl, {
    headers: { Connection: 'close' },
    signal: AbortSignal.timeout(4000),
  })
    .then(async (res) => ({ status: res.status, body: await res.text() }))
    .catch((error: unknown) => ({ error }));

  await received;
  assert.ok(pendingResponse);

  let shutdownFinished = false;
  const shutdownResult = shutdown().then(() => {
    shutdownFinished = true;
    return { closed: true };
  }).catch((error: unknown) => ({ error }));

  assert.equal(server.listening, false);

  await assert.rejects(fetch(baseUrl, { signal: AbortSignal.timeout(1000) }), TypeError);
  assert.equal(shutdownFinished, false);

  pendingResponse.end('Completed before shutdown.');

  assert.deepEqual(await responseResult, { status: 200, body: 'Completed before shutdown.' });
  assert.deepEqual(await shutdownResult, { closed: true });
  assert.equal(forcedClose.mock.callCount(), 0);
});

test('forces an unfinished response closed when the shutdown deadline expires', { timeout: 5000 }, async (context) => {
  let pendingResponse: ServerResponse | undefined;

  const { server, shutdown, baseUrl } = await startShutdownTestServer(context, (req, res) => {
    pendingResponse = res;
    res.write('An unfinished response.');
  }, 50);
  const forcedClose = context.mock.method(server, 'closeAllConnections');
  const response = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });

  assert.ok(pendingResponse);
  assert.equal(response.status, 200);

  const connectionClosed = once(pendingResponse, 'close', { signal: AbortSignal.timeout(2000) });
  const bodyResult = response.text()
    .then((body) => ({ body }))
    .catch((error: unknown) => ({ error }));

  await assert.rejects(shutdown(), {
    name: 'Error',
    message: 'Server shutdown exceeded its time limit.',
  });

  await connectionClosed;

  const result = await bodyResult;

  assert.ok('error' in result);
  assert.ok(result.error instanceof TypeError);
  assert.equal(forcedClose.mock.callCount(), 1);
  assert.equal(server.listening, false);
});

test('shares one shutdown promise and removes its signal listeners', { timeout: 5000 }, async (context) => {
  const previousSigintListeners = process.listeners('SIGINT');
  const previousSigtermListeners = process.listeners('SIGTERM');
  const { server, shutdown } = await startShutdownTestServer(context, (req, res) => {
    res.end('Test response.');
  });
  const close = context.mock.method(server, 'close');
  const forcedClose = context.mock.method(server, 'closeAllConnections');

  const firstShutdown = shutdown();
  const secondShutdown = shutdown();

  assert.equal(firstShutdown, secondShutdown);
  await firstShutdown;

  assert.equal(shutdown(), firstShutdown);
  assert.equal(close.mock.callCount(), 1);
  assert.equal(forcedClose.mock.callCount(), 0);
  assert.equal(server.listening, false);
  assert.deepEqual(process.listeners('SIGINT'), previousSigintListeners);
  assert.deepEqual(process.listeners('SIGTERM'), previousSigtermListeners);
});

const signalChildScript = `
  import { once } from 'node:events';
  import { createServer } from 'node:http';
  import { createApp } from './src/app.ts';
  import { registerShutdown } from './src/server.ts';

  const server = createServer(createApp());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  registerShutdown(server);

  // Report the assigned port only after the real signal handlers are registered.
  process.send({ port: server.address().port }, () => {
    process.disconnect();
  });
`;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`shuts down cleanly after a real ${signal}`, {
    timeout: 10_000,
    skip: process.platform === 'win32'
      ? 'Windows child.kill force-terminates the process; POSIX signal handling is unverified here.'
      : false,
  }, async (context) => {
    // IPC reports an already-bound port, avoiding a reserve/release race.
    const directory = mkdtempSync(join(tmpdir(), 'monster-child-'));
    const child = spawn(process.execPath, ['--input-type=module', '--eval', signalChildScript], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, DATABASE_PATH: join(directory, 'game.sqlite') },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    registerChildCleanup(context, child, directory);

    assert.ok(child.stdout);
    assert.ok(child.stderr);

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const [ready] = await once(child, 'message', { signal: AbortSignal.timeout(3000) });

    assert.ok(Number.isInteger(ready.port));

    const response = await fetch(`http://127.0.0.1:${ready.port}/api/health`, {
      headers: { Connection: 'close' },
      signal: AbortSignal.timeout(2000),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    const closed = once(child, 'close', { signal: AbortSignal.timeout(3000) });

    assert.equal(child.kill(signal), true);

    const [exitCode, terminatingSignal] = await closed;

    assert.equal(exitCode, 0);
    assert.equal(terminatingSignal, null);
    assert.equal(stdout, 'Shutting down HTTP server.\nHTTP server stopped.\n');
    assert.equal(stderr, '');
    assert.equal(existsSync(join(directory, 'game.sqlite')), false);
  });
}

function lifecycleStorage(context: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'monster-lifecycle-'));

  context.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  return join(directory, 'game.sqlite');
}

function configureLifecycleStartup(context: TestContext) {
  const path = lifecycleStorage(context);
  const previous = {
    PORT: process.env.PORT,
    DATABASE_PATH: process.env.DATABASE_PATH,
    NODE_ENV: process.env.NODE_ENV,
  };

  context.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  process.env.PORT = '3000';
  process.env.DATABASE_PATH = path;
  process.env.NODE_ENV = 'test';

  return path;
}

test('lifecycle: invalid PORT does not open SQLite or start HTTP', async (context) => {
  const path = configureLifecycleStartup(context);
  const pragma = context.mock.method(Database.prototype, 'pragma');
  const listen = context.mock.method(Server.prototype, 'listen');

  process.env.PORT = 'invalid';

  await assert.rejects(startServer(), /PORT must be an integer/);
  assert.equal(existsSync(path), false);
  assert.equal(pragma.mock.callCount(), 0);
  assert.equal(listen.mock.callCount(), 0);
});

test('lifecycle: database configuration failure prevents HTTP startup', async (context) => {
  const path = configureLifecycleStartup(context);
  const listen = context.mock.method(Server.prototype, 'listen');
  const log = context.mock.method(console, 'log', () => {});

  process.env.DATABASE_PATH = join(path, 'missing', 'game.sqlite');

  await assert.rejects(startServer(), /Unable to open or configure SQLite database/);
  assert.equal(existsSync(path), false);
  assert.equal(listen.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 0);
});

test('lifecycle: migration failure closes SQLite before any HTTP listener is created', async (context) => {
  configureLifecycleStartup(context);

  const originalExec = Database.prototype.exec;
  const close = context.mock.method(Database.prototype, 'close');
  const listen = context.mock.method(Server.prototype, 'listen');
  const log = context.mock.method(console, 'log', () => {});
  const sigint = process.listeners('SIGINT');
  const sigterm = process.listeners('SIGTERM');

  context.mock.method(Database.prototype, 'exec', function (this: Database.Database, sql: string) {
    if (sql.includes('CREATE TABLE users')) {
      throw new Error('Injected startup migration failure.');
    }

    return originalExec.call(this, sql);
  });

  await assert.rejects(startServer(), /Injected startup migration failure/);
  assert.equal(close.mock.callCount(), 1);
  assert.equal((close.mock.calls[0].this as Database.Database).open, false);
  assert.equal(listen.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 0);
  assert.deepEqual(process.listeners('SIGINT'), sigint);
  assert.deepEqual(process.listeners('SIGTERM'), sigterm);
});

test('lifecycle: failed HTTP bind closes SQLite and does not register signal handlers', async (context) => {
  configureLifecycleStartup(context);

  const { address } = await reserveTestPort(context);
  const close = context.mock.method(Database.prototype, 'close');
  const log = context.mock.method(console, 'log', () => {});
  const sigint = process.listeners('SIGINT');
  const sigterm = process.listeners('SIGTERM');

  process.env.PORT = String(address.port);

  await assert.rejects(startServer(), { code: 'EADDRINUSE' });
  assert.equal(close.mock.callCount(), 1);
  assert.equal((close.mock.calls[0].this as Database.Database).open, false);
  assert.equal(log.mock.callCount(), 0);
  assert.deepEqual(process.listeners('SIGINT'), sigint);
  assert.deepEqual(process.listeners('SIGTERM'), sigterm);
});

test('lifecycle: startup preserves bind and database cleanup errors', async (context) => {
  configureLifecycleStartup(context);

  const { address } = await reserveTestPort(context);
  const originalClose = Database.prototype.close;
  const cleanupError = new Error('Injected startup cleanup failure.');

  process.env.PORT = String(address.port);
  context.mock.method(Database.prototype, 'close', function (this: Database.Database) {
    originalClose.call(this);
    throw cleanupError;
  });

  await assert.rejects(startServer(), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors[0].code, 'EADDRINUSE');
    assert.equal(error.errors[1], cleanupError);

    return true;
  });
});

test('lifecycle: startup migrates before readiness and repeated shutdown closes HTTP then SQLite once', async (context) => {
  configureLifecycleStartup(context);

  const { listener, address } = await reserveTestPort(context);

  await new Promise<void>((resolve, reject) => {
    listener.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  process.env.PORT = String(address.port);

  const pragma = context.mock.method(Database.prototype, 'pragma');
  const originalClose = Database.prototype.close;
  const events: string[] = [];
  const close = context.mock.method(Database.prototype, 'close', function (this: Database.Database) {
    events.push('database');

    return originalClose.call(this);
  });
  const { server, shutdown } = await startServer();
  const database = pragma.mock.calls[0].this as Database.Database;

  server.once('close', () => {
    events.push('http');
  });

  try {
    assert.equal(database.open, true);
    assert.equal(database.prepare("SELECT count(*) FROM sqlite_schema WHERE type = 'table'").pluck().get(), 9);
    assert.deepEqual(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all(), [{ version: 1 }, { version: 2 }]);

    const prepare = context.mock.method(Database.prototype, 'prepare');
    const loopbackHost = address.family === 'IPv6' ? '[::1]' : '127.0.0.1';
    const response = await fetch(`http://${loopbackHost}:${address.port}/api/health`, {
      headers: { Connection: 'close' },
      signal: AbortSignal.timeout(2000),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    assert.equal(prepare.mock.callCount(), 0);

    const firstShutdown = shutdown();

    assert.equal(shutdown(), firstShutdown);
    await firstShutdown;
    assert.equal(shutdown(), firstShutdown);
    assert.equal(database.open, false);
    assert.equal(close.mock.callCount(), 1);
    assert.deepEqual(events, ['http', 'database']);
  } finally {
    await shutdown();
  }
});

test('lifecycle: an active HTTP response keeps SQLite open until draining completes', { timeout: 5000 }, async (context) => {
  const database = openDatabase(lifecycleStorage(context), 'test');
  let pendingResponse: ServerResponse | undefined;
  let httpClosed = false;
  const closeDatabase = context.mock.fn(() => {
    assert.equal(httpClosed, true);
    database.close();
  });
  const { server, shutdown, baseUrl } = await startShutdownTestServer(context, (req, res) => {
    pendingResponse = res;
    res.write('Active response.');
  }, 3000, closeDatabase);

  server.once('close', () => {
    httpClosed = true;
  });

  try {
    const response = await fetch(baseUrl, {
      headers: { Connection: 'close' }, signal: AbortSignal.timeout(3000),
    });
    const body = response.text();
    const stopping = shutdown();

    assert.equal(database.open, true);
    assert.equal(closeDatabase.mock.callCount(), 0);
    assert.ok(pendingResponse);
    pendingResponse.end(' Completed.');

    assert.equal(await body, 'Active response. Completed.');
    await stopping;
    assert.equal(database.open, false);
    assert.equal(closeDatabase.mock.callCount(), 1);
  } finally {
    pendingResponse?.end();

    try {
      await shutdown();
    } finally {
      if (database.open) {
        database.close();
      }
    }
  }
});

for (const failDatabaseClose of [false, true]) {
  test(`lifecycle: forced HTTP closure precedes SQLite closure (close error: ${failDatabaseClose})`, { timeout: 5000 }, async (context) => {
    const database = openDatabase(lifecycleStorage(context), 'test');
    const closeError = new Error('Injected database close failure.');
    const events: string[] = [];
    const closeDatabase = context.mock.fn(() => {
      events.push('database');
      database.close();

      if (failDatabaseClose) {
        throw closeError;
      }
    });
    const { server, shutdown, baseUrl } = await startShutdownTestServer(context, (req, res) => {
      res.write('Unfinished response.');
    }, 50, closeDatabase);
    const originalForceClose = server.closeAllConnections;

    context.mock.method(server, 'closeAllConnections', function (this: Server) {
      events.push('force');
      originalForceClose.call(this);
    });
    server.once('close', () => {
      events.push('http');
    });

    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
      const body = response.text().catch((error: unknown) => error);
      const stopping = shutdown();

      await assert.rejects(stopping, (error: unknown) => {
        if (failDatabaseClose) {
          assert.ok(error instanceof AggregateError);
          assert.match(error.errors[0].message, /Server shutdown exceeded its time limit/);
          assert.equal(error.errors[1], closeError);
        } else {
          assert.ok(error instanceof Error);
          assert.equal(error.message, 'Server shutdown exceeded its time limit.');
        }

        return true;
      });
      const bodyResult = await body;

      assert.ok(bodyResult instanceof TypeError);
      assert.equal(shutdown(), stopping);
      assert.equal(closeDatabase.mock.callCount(), 1);
      assert.equal(database.open, false);
      assert.deepEqual(events, ['force', 'http', 'database']);
    } finally {
      server.closeAllConnections();
      await shutdown().catch(() => {
        // This test already asserted the timeout and optional cleanup failure.
      });

      if (database.open) {
        database.close();
      }
    }
  });
}

test('lifecycle: database close errors reject once and remove signal listeners', async (context) => {
  const sigint = process.listeners('SIGINT');
  const sigterm = process.listeners('SIGTERM');
  const database = openDatabase(lifecycleStorage(context), 'test');
  const closeError = new Error('Injected database close failure.');
  const closeDatabase = context.mock.fn(() => {
    database.close();
    throw closeError;
  });
  const { server, shutdown } = await startShutdownTestServer(context, (req, res) => {
    res.end('Test response.');
  }, 3000, closeDatabase);
  const forcedClose = context.mock.method(server, 'closeAllConnections');
  const stopping = shutdown();

  await assert.rejects(stopping, closeError);
  assert.equal(shutdown(), stopping);
  assert.equal(closeDatabase.mock.callCount(), 1);
  assert.equal(database.open, false);
  assert.equal(forcedClose.mock.callCount(), 0);
  assert.deepEqual(process.listeners('SIGINT'), sigint);
  assert.deepEqual(process.listeners('SIGTERM'), sigterm);
});
