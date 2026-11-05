import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';
import { Router } from 'express';
import { loadConfig } from '../src/config.js';
import type { Config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { initializeDatabase } from '../src/database/initialize.js';
import { closeDatabase } from '../src/database/connection.js';
import { SQLiteSessionStore } from '../src/auth/session-store.js';
import { createAuthRouter } from '../src/auth/routes.js';
import type { GoogleVerifier } from '../src/auth/google.js';
import { createSessionMiddleware, applyAbsoluteExpiry } from '../src/auth/session.js';
import { authRequestSecurity } from '../src/auth/csrf.js';
import { requireAuthenticated, requireOnboarded } from '../src/auth/authorization.js';
import { backendDirectory, temporaryDirectory, testAuthEnv } from './helpers.js';

export async function authFixture(t: TestContext, overrides: Partial<Config> = {},
  verify: GoogleVerifier = async () => ({ subject: 'google-subject', email: 'player@example.test' })) {
  const directory = temporaryDirectory();
  const config = { ...loadConfig({ ...testAuthEnv, NODE_ENV: 'test', DATABASE_PATH: join(directory, 'game.sqlite') },
    backendDirectory), ...overrides };
  const database = initializeDatabase(config);
  const store = new SQLiteSessionStore(database);
  const routes = createAuthRouter(config, database, store, verify);
  // These probes exist only in test composition, never in application source/routes.
  const probes = Router();
  probes.use(authRequestSecurity(config), createSessionMiddleware(config, store),
    (req, _res, next) => { applyAbsoluteExpiry(req.session, config); next(); });
  probes.get('/account', requireAuthenticated(database, config), (req, res) => res.json({ id: req.account!.id }));
  probes.get('/onboarded', requireOnboarded(database, config), (_req, res) => res.json({ ok: true }));
  routes.use('/api/probe', probes);
  const server = createServer(createApp(config.nodeEnv, routes, { trustProxyCidrs: config.trustProxyCidrs }));
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
    store.dispose();
    closeDatabase(database);
    rmSync(directory, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let cookie = '';
  let csrfToken = '';
  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has('origin')) headers.set('origin', config.appOrigin);
    if (cookie && !headers.has('cookie')) headers.set('cookie', cookie);
    if (config.nodeEnv === 'production' && !headers.has('x-forwarded-proto')) headers.set('x-forwarded-proto', 'https');
    const response = await fetch(`${url}${path}`, { ...init, headers });
    const setCookie = response.headers.getSetCookie()[0];
    if (setCookie) cookie = setCookie.split(';')[0]!;
    return response;
  }
  async function bootstrap() {
    const response = await request('/api/auth/csrf');
    assert.equal(response.status, 200);
    csrfToken = (await response.json() as { csrfToken: string }).csrfToken;
    return response;
  }
  async function login() {
    await bootstrap();
    const response = await request('/api/auth/google', { method: 'POST', headers: {
      'content-type': 'application/json', 'x-csrf-token': csrfToken,
    }, body: JSON.stringify({ credential: 'header.payload.signature' }) });
    assert.equal(response.status, 200);
    const body = await response.json() as { user: { id: string; username: string | null }; csrfToken: string; requiresOnboarding: boolean };
    csrfToken = body.csrfToken;
    return { response, body };
  }
  return { config, database, store, directory, url, request, bootstrap, login,
    get cookie() { return cookie; }, get csrfToken() { return csrfToken; } };
}
