import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

export const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
export const testAuthEnv: NodeJS.ProcessEnv = {
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  SESSION_SECRET: randomBytes(32).toString('hex'),
  APP_ORIGIN: 'https://game.example.test',
};

export function temporaryDirectory() {
  const root = join(tmpdir(), 'opencode');
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, 'monster-persistence-'));
}

export async function listen(server: Server, t: TestContext, host = '127.0.0.1') {
  t.after(async () => {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  server.listen(0, host);
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  return `http://127.0.0.1:${port}`;
}

export function startChild(t: TestContext, args: string[], config: NodeJS.ProcessEnv = {}, cwd = backendDirectory) {
  const directory = temporaryDirectory();
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, { ...testAuthEnv, DATABASE_PATH: join(directory, 'game.sqlite') }, config);

  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout!.setEncoding('utf8').on('data', (data: string) => { stdout += data; });
  child.stderr!.setEncoding('utf8').on('data', (data: string) => { stderr += data; });
  const completed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 8_000);
  void completed.then(() => clearTimeout(deadline), () => clearTimeout(deadline));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    try { await completed; } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  async function waitForOutput(pattern: RegExp) {
    if (pattern.test(stdout)) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error(`Missing output: ${pattern}\n${stderr}`)), 5_000);
      function finish(error?: Error) {
        clearTimeout(timer);
        child.stdout!.off('data', check);
        child.off('close', closed);
        if (error) reject(error);
        else resolve();
      }
      function check() { if (pattern.test(stdout)) finish(); }
      function closed() { finish(new Error(`Process exited before ${pattern}\n${stderr}`)); }
      child.stdout!.on('data', check);
      child.once('close', closed);
      if (child.exitCode !== null || child.signalCode !== null) closed();
    });
  }

  return { child, directory, databasePath: env.DATABASE_PATH!, completed, waitForOutput,
    get stdout() { return stdout; }, get stderr() { return stderr; } };
}
