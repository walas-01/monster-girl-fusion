import { join } from 'node:path';
import { rmSync } from 'node:fs';
import type { TestContext } from 'node:test';
import type Database from 'better-sqlite3';
import { loadConfig } from '../src/config.js';
import { closeDatabase, openDatabase } from '../src/database/connection.js';
import { backendDirectory, temporaryDirectory, testAuthEnv } from './helpers.js';

export function databaseFixture(t: TestContext) {
  const directory = temporaryDirectory();
  const config = loadConfig({ ...testAuthEnv, NODE_ENV: 'test', DATABASE_PATH: join(directory, 'game.sqlite') }, backendDirectory);
  const handles: Database.Database[] = [];
  t.after(() => {
    for (const db of handles) closeDatabase(db);
    rmSync(directory, { recursive: true, force: true });
  });
  function track(db: Database.Database) { handles.push(db); return db; }
  return { directory, config, track, open: () => track(openDatabase(config)) };
}
