import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { loadConfig as parseConfig } from '../src/config.js';
import { backendDirectory, testAuthEnv } from './helpers.js';

const loadConfig = (env: NodeJS.ProcessEnv) => parseConfig({ ...testAuthEnv, APP_ORIGIN: undefined, ...env }, backendDirectory);
const localDatabase = resolve(backendDirectory, 'data/game.sqlite');

test('configuration defaults do not depend on the process environment', () => {
  const { sessionSecret, ...config } = loadConfig({});
  assert.equal(sessionSecret.length, 64);
  assert.deepEqual(config, { port: 3000, nodeEnv: 'development', databasePath: localDatabase,
    googleClientId: testAuthEnv.GOOGLE_CLIENT_ID, sessionTtlSeconds: 604800,
    appOrigin: 'http://localhost:5173', trustProxyCidrs: [] });
});

test('accepts custom ports and all supported environments', () => {
  for (const nodeEnv of ['development', 'test', 'production'] as const) {
    for (const port of [1, 4321, 65535]) {
      const config = loadConfig({ PORT: String(port), NODE_ENV: nodeEnv, DATABASE_PATH: localDatabase,
        APP_ORIGIN: 'https://game.example.test' });
      assert.deepEqual({ port: config.port, nodeEnv: config.nodeEnv, databasePath: config.databasePath },
        { port, nodeEnv, databasePath: localDatabase });
    }
  }
});

for (const port of ['', ' ', ' 3000', '3000 ', '3000\n', '0', '-1', '+80', '1.5', '1e3', '0x50', 'abc', '65536', '9'.repeat(400)]) {
  const label = port.length > 30 ? '(oversized integer)' : JSON.stringify(port);
  test(`rejects invalid PORT ${label} without echoing it`, () => {
    assert.throws(() => loadConfig({ PORT: port }), {
      message: 'PORT must be a decimal integer from 1 through 65535.',
    });
  });
}

test('resolves relative storage against the package directory and requires absolute production paths', () => {
  assert.equal(loadConfig({ DATABASE_PATH: 'storage/game.sqlite' }).databasePath,
    resolve(backendDirectory, 'storage/game.sqlite'));
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_PATH/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_PATH: 'data/game.sqlite' }), /DATABASE_PATH/);
});

for (const path of ['', ' ', ' data/game.sqlite', 'data/game.sqlite ', ':memory:', 'file:game.sqlite',
  'https://example.test/game.sqlite', 'bad\0path', 'src/game.sqlite', 'dist/game.sqlite', 'src', 'dist',
  'data/../src/nested/game.sqlite']) {
  test(`rejects unsafe database path ${JSON.stringify(path)}`, () => {
    assert.throws(() => loadConfig({ DATABASE_PATH: path }), /DATABASE_PATH/);
  });
}

for (const nodeEnv of ['', 'Production', ' staging', 'staging']) {
  test(`rejects unsupported NODE_ENV ${JSON.stringify(nodeEnv)}`, () => {
    assert.throws(() => loadConfig({ NODE_ENV: nodeEnv }), {
      message: 'NODE_ENV must be development, test, or production.',
    });
  });
}

for (const [key, value] of [
  ['GOOGLE_CLIENT_ID', undefined], ['GOOGLE_CLIENT_ID', 'invalid'], ['GOOGLE_CLIENT_ID', 'x.apps.googleusercontent.com\n'],
  ['SESSION_SECRET', undefined], ['SESSION_SECRET', 'short'], ['SESSION_SECRET', 'g'.repeat(64)],
  ['SESSION_TTL_SECONDS', '0'], ['SESSION_TTL_SECONDS', '59'], ['SESSION_TTL_SECONDS', '2592001'],
  ['SESSION_TTL_SECONDS', '60.5'], ['SESSION_TTL_SECONDS', ' 60'], ['SESSION_TTL_SECONDS', ''],
  ['APP_ORIGIN', 'null'], ['APP_ORIGIN', 'https://user:pass@example.test'], ['APP_ORIGIN', 'https://example.test/path'],
  ['APP_ORIGIN', 'https://example.test?q=x'], ['APP_ORIGIN', 'https://example.test#fragment'],
  ['APP_ORIGIN', 'https://example.test?'], ['APP_ORIGIN', 'https://example.test#'],
  ['TRUST_PROXY_CIDRS', 'true'], ['TRUST_PROXY_CIDRS', '1'], ['TRUST_PROXY_CIDRS', 'loopback'],
  ['TRUST_PROXY_CIDRS', '0.0.0.0/0'], ['TRUST_PROXY_CIDRS', '::/0'], ['TRUST_PROXY_CIDRS', '127.0.0.1/33'],
  ['TRUST_PROXY_CIDRS', '::1/129'], ['TRUST_PROXY_CIDRS', '127.0.0.1,'],
] as const) {
  test(`rejects invalid ${key} configuration without echoing values`, () => {
    assert.throws(() => loadConfig({ [key]: value }), new RegExp(key));
  });
}

test('production requires an explicit HTTPS origin; proxy trust accepts only explicit addresses/subnets', () => {
  for (const origin of [undefined, 'http://game.example.test']) {
    assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_PATH: localDatabase, APP_ORIGIN: origin }), /APP_ORIGIN/);
  }
  const config = loadConfig({ TRUST_PROXY_CIDRS: '127.0.0.1/32, ::1/128, 10.2.0.4' });
  assert.deepEqual(config.trustProxyCidrs, ['127.0.0.1/32', '::1/128', '10.2.0.4']);
  assert.equal(loadConfig({ SESSION_TTL_SECONDS: '60' }).sessionTtlSeconds, 60);
});
