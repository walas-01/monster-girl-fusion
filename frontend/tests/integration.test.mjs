import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer as httpServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';
import configuration, { developmentSettings } from '../vite.config.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
async function listen(server, host = '127.0.0.1') {
  server.listen(0, host);
  await once(server, 'listening');
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
function environment(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
}

test('dev configuration validates ports/targets and preserves Origin without exposing private settings', () => {
  assert.deepEqual(developmentSettings({}), { port: 5173, target: 'http://localhost:3000' });
  for (const port of ['', '0', '65536', ' 5173', '1.2', '5173\n']) {
    assert.throws(() => developmentSettings({ DEV_PORT: port }), /DEV_PORT/);
  }
  for (const target of ['invalid', 'ftp://localhost', 'http://user:secret@localhost', 'https://example.test/path',
    'https://example.test?', 'https://example.test#', ' https://example.test']) {
    assert.throws(() => developmentSettings({ DEV_API_TARGET: target }), /DEV_API_TARGET/);
  }
});

test('actual Vite proxy preserves /api, Origin and cookies; origin/security failures are not rewritten away', async (t) => {
  const received = [];
  let origin;
  const backend = httpServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ path: req.url, method: req.method, origin: req.headers.origin, cookie: req.headers.cookie,
      csrf: req.headers['x-csrf-token'], forwarded: req.headers['x-forwarded-proto'], body });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && req.headers.origin !== origin) {
      res.writeHead(403).end(JSON.stringify({ error: { code: 'CSRF_INVALID' } })); return;
    }
    if (req.url === '/api/auth/csrf') {
      res.setHeader('Set-Cookie', 'mgf.sid=test; Path=/api; HttpOnly; SameSite=Lax');
      res.end(JSON.stringify({ csrfToken: 'x'.repeat(43) })); return;
    }
    res.end(JSON.stringify({ ok: true }));
  });
  const backendPort = await listen(backend);
  t.after(() => close(backend));
  const reservation = httpServer();
  const port = await listen(reservation, 'localhost');
  await close(reservation);
  environment(t, { DEV_API_TARGET: `http://127.0.0.1:${backendPort}`, DEV_PORT: String(port) });
  const config = configuration({ command: 'serve', mode: 'test', isPreview: false });
  const vite = await createServer({ ...config, root, configFile: false, envFile: false, logLevel: 'silent' });
  t.after(() => vite.close());
  await vite.listen();
  origin = `http://localhost:${port}`;
  assert.match(await (await fetch(origin)).text(), /src\/main.tsx/);
  const bootstrap = await fetch(origin + '/api/auth/csrf');
  assert.match(bootstrap.headers.get('set-cookie'), /HttpOnly/);
  const token = (await bootstrap.json()).csrfToken;
  const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
  const response = await fetch(origin + '/api/auth/google', { method: 'POST', headers: {
    Origin: origin, Cookie: cookie, 'X-CSRF-Token': token, 'Content-Type': 'application/json',
  }, body: '{"credential":"a.b.c"}' });
  assert.equal(response.status, 200);
  await response.arrayBuffer();
  const hostile = await fetch(origin + '/api/auth/google', { method: 'POST', headers: { Origin: 'https://evil.test' } });
  assert.equal(hostile.status, 403);
  await hostile.arrayBuffer();
  assert.deepEqual(received[1], { path: '/api/auth/google', method: 'POST', origin, cookie, csrf: token,
    forwarded: undefined, body: '{"credential":"a.b.c"}' });
  assert.equal(received[2].origin, 'https://evil.test');
  const conflicting = await createServer({ ...config, root, configFile: false, envFile: false, logLevel: 'silent' });
  try { await assert.rejects(conflicting.listen(), /already in use/); } finally { await conflicting.close(); }
});

test('static production build excludes private settings and is served without the Vite dev runtime', async (t) => {
  await mkdir(join(tmpdir(), 'opencode'), { recursive: true });
  const output = await mkdtemp(join(tmpdir(), 'opencode', 'monster-frontend-build-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const secret = 'PRIVATE_SESSION_SENTINEL_004';
  const target = 'http://PRIVATE_DEV_TARGET_SENTINEL_004:9999';
  environment(t, { SESSION_SECRET: secret, DEV_API_TARGET: target, VITE_GOOGLE_CLIENT_ID: 'build-test.apps.googleusercontent.com' });
  const config = configuration({ command: 'build', mode: 'test', isPreview: false });
  await build({ ...config, root, configFile: false, envFile: false, logLevel: 'silent', build: { outDir: output } });
  let contents = await readFile(join(output, 'index.html'), 'utf8');
  const assets = await readdir(join(output, 'assets'));
  for (const asset of assets) contents += await readFile(join(output, 'assets', asset), 'utf8');
  assert.ok(!contents.includes(secret));
  assert.ok(!contents.includes(target));
  assert.ok(!contents.includes('PRIVATE_DEV_TARGET_SENTINEL_004'));
  assert.match(contents, /build-test.apps.googleusercontent.com/);
  assert.doesNotMatch(contents, /react\.svg|vite\.svg|hero\.png|Get started|@vite\/client/);
  assert.ok(assets.some((name) => name.endsWith('.css')));
  const server = await preview({ root, configFile: false, envFile: false, logLevel: 'silent', build: { outDir: output },
    preview: { host: '127.0.0.1', port: 0 } });
  t.after(() => close(server.httpServer));
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const html = await (await fetch(base)).text();
  assert.match(html, /assets\/index-/);
  assert.doesNotMatch(html, /src\/main.tsx|@vite\/client/);
  const js = assets.find((name) => name.endsWith('.js'));
  assert.equal((await fetch(`${base}/assets/${js}`)).status, 200);
});
