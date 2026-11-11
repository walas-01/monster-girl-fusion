import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import express from 'express';
import type { Express } from 'express';
import { createApp, handleError } from '../src/app.ts';

test('creates independent Express applications', () => {
  const firstApp = createApp();
  const secondApp = createApp();

  assert.notEqual(firstApp, secondApp);

  firstApp.set('test-setting', 'first application');

  assert.equal(secondApp.get('test-setting'), undefined);
});

test('keeps proxy trust disabled', () => {
  const app = createApp();

  assert.equal(app.get('trust proxy'), false);
});







async function startTestServer(app: Express, context: TestContext) {
  const server = createServer(app);

  context.after(async () => {
    if (!server.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });

      server.closeAllConnections();
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();

  assert.ok(address && typeof address !== 'string');

  return `http://127.0.0.1:${address.port}`;
}


// ---------------- Pruebas HTTP

test('returns the health response without exposing the Express header', { timeout: 5000 }, async (context) => {
  const baseUrl = await startTestServer(createApp(), context);

  const response = await fetch(`${baseUrl}/api/health`, {
    signal: AbortSignal.timeout(3000),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('returns JSON for an unknown route', { timeout: 5000 }, async (context) => {
  const baseUrl = await startTestServer(createApp(), context);

  const response = await fetch(`${baseUrl}/missing`, {
    signal: AbortSignal.timeout(3000),
  });

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found.',
    },
  });
});

test('returns a generic JSON error for a test-local failure', { timeout: 5000 }, async (context) => {
  const errorLog = context.mock.method(console, 'error', () => {});
  const app = express();
  const failure = new Error('Private failure details.');

  failure.stack = 'Error: Private failure details.\n    at /private/backend/example.ts:1:1';
  Object.assign(failure, { privateToken: 'test-only-secret' });

  app.get('/test-only-failure', () => {
    throw failure;
  });

  app.use(handleError);

  const baseUrl = await startTestServer(app, context);

  const response = await fetch(`${baseUrl}/test-only-failure`, {
    signal: AbortSignal.timeout(3000),
  });

  assert.equal(response.status, 500);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('set-cookie'), null);

  const body = await response.text();

  assert.doesNotMatch(body, /Private failure details|\/private\/backend|test-only-secret/);
  assert.deepEqual(JSON.parse(body), {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
    },
  });
  assert.equal(errorLog.mock.callCount(), 1);
  assert.deepEqual(errorLog.mock.calls[0].arguments, ['Unhandled request error.']);
});
