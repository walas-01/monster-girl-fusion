import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { listen } from './helpers.js';

test('health is public JSON with no framework disclosure', async (t) => {
  const url = await listen(createServer(createApp('test')), t);
  const response = await fetch(`${url}/api/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type')!, /^application\/json/);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('unknown routes and unsupported methods return the JSON 404 envelope', async (t) => {
  const url = await listen(createServer(createApp('test')), t);
  for (const [path, method] of [['/api/missing', 'GET'], ['/missing', 'GET'], ['/api/health', 'POST']] as const) {
    const response = await fetch(`${url}${path}`, { method });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  }
});

for (const nodeEnv of ['development', 'production'] as const) {
  test(`handles sync/async errors safely in ${nodeEnv} and remains available`, async (t) => {
    const logs: unknown[][] = [];
    t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
    const routes = Router();
    routes.get('/sync', () => { throw new Error('private token at C:/private/source.ts'); });
    routes.get('/async', async () => { throw new Error('private token at /private/source.ts'); });
    const url = await listen(createServer(createApp(nodeEnv, routes)), t);
    for (const path of ['/sync', '/async']) {
      const response = await fetch(`${url}${path}?secret=private`);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), {
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
      });
      assert.equal((await fetch(`${url}/api/health`)).status, 200);
    }
    assert.equal(logs.length, 2);
    assert.doesNotMatch(JSON.stringify(logs), /private|source\.ts|secret/);
  });
}

test('does not trust spoofed proxy headers', async (t) => {
  const routes = Router();
  routes.get('/inspect', (req, res) => {
    res.json({ protocol: req.protocol, ip: req.ip, secure: req.secure });
  });
  const app = createApp('production', routes);
  assert.equal(app.get('trust proxy'), false);
  const url = await listen(createServer(app), t);
  const response = await fetch(`${url}/inspect`, {
    headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.99' },
  });
  assert.deepEqual(await response.json(), { protocol: 'http', ip: '127.0.0.1', secure: false });
});

test('already-started responses delegate only a sanitized error to Express', (t) => {
  t.mock.method(console, 'error', () => {});
  let delegated: unknown;
  errorHandler(new Error('secret'), {} as Request, { headersSent: true } as Response, (error: unknown) => {
    delegated = error;
  });
  assert.deepEqual(delegated, { status: 500, message: 'An unexpected error occurred.' });
});
