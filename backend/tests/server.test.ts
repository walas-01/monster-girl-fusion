import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { RequestListener, ServerResponse } from 'node:http';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { promisify } from 'node:util';
import { readPort, registerShutdown } from '../src/server.ts';

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

function registerChildCleanup(context: TestContext, child: ChildProcess) {
  context.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }

    const closed = once(child, 'close', { signal: AbortSignal.timeout(2000) });

    child.kill('SIGKILL');
    await closed;
  });
}

for (const entry of ['src/index.ts', 'dist/index.js']) {
  test(`${entry} exits with an error when another listener owns the port`, { timeout: 10_000 }, async (context) => {
    if (entry === 'dist/index.js') {
      assert.ok(existsSync(new URL('../dist/index.js', import.meta.url)), 'Run npm run build before npm test.');
    }

    const { address } = await reserveTestPort(context);
    const runFile = promisify(execFile);
    const backendRun = runFile(process.execPath, [entry], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, PORT: String(address.port) },
      timeout: 5000,
      killSignal: 'SIGKILL',
      encoding: 'utf8',
    });

    registerChildCleanup(context, backendRun.child);

    await assert.rejects(backendRun, {
      code: 1,
      killed: false,
      signal: null,
      stdout: '',
      stderr: /Unable to start HTTP server:.*EADDRINUSE/,
    });

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

    const runFile = promisify(execFile);
    const backendRun = runFile(process.execPath, ['dist/index.js'], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, PORT: value },
      timeout: 5000,
      killSignal: 'SIGKILL',
      encoding: 'utf8',
    });

    registerChildCleanup(context, backendRun.child);

    await assert.rejects(backendRun, {
      code: 1,
      killed: false,
      signal: null,
      stdout: '',
      stderr: 'Unable to start HTTP server: PORT must be an integer between 1 and 65535.\n',
    });
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

  const child = spawn(process.execPath, ['--no-strip-types', 'dist/index.js'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: String(address.port), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  registerChildCleanup(context, child);
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
});

async function startShutdownTestServer(
  context: TestContext,
  handler: RequestListener,
  timeoutMs = 3000,
) {
  const server = createServer(handler);
  const shutdown = registerShutdown(server, timeoutMs);

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
    const child = spawn(process.execPath, ['--input-type=module', '--eval', signalChildScript], {
      cwd: new URL('../', import.meta.url),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    context.after(async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }

      const closed = once(child, 'close', { signal: AbortSignal.timeout(2000) });

      child.kill('SIGKILL');
      await closed;
    });

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
  });
}
