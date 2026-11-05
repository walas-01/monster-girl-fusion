import { accessSync, constants, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Config } from '../config.js';
import { PersistenceError } from './errors.js';

export function closeDatabase(db: Database.Database) {
  try {
    if (db.open) db.close();
  } catch {
    throw new PersistenceError('DATABASE_CLOSE_ERROR');
  }
}

export function openDatabase(config: Pick<Config, 'databasePath' | 'nodeEnv'>) {
  const directory = dirname(config.databasePath);
  try {
    if (config.nodeEnv !== 'production') mkdirSync(directory, { recursive: true });
    if (!statSync(directory).isDirectory()) throw new Error();
    accessSync(directory, constants.W_OK);
  } catch {
    throw new PersistenceError('DATABASE_STORAGE_ERROR');
  }

  let db: Database.Database;
  try {
    db = new Database(config.databasePath, { timeout: 1_000 });
  } catch {
    throw new PersistenceError('DATABASE_OPEN_ERROR');
  }

  try {
    db.pragma('foreign_keys = ON');
    if (db.pragma('foreign_keys', { simple: true }) !== 1) throw new Error();
    if (db.pragma('journal_mode = WAL', { simple: true }) !== 'wal') throw new Error();
    db.pragma('synchronous = FULL');
    if (db.pragma('synchronous', { simple: true }) !== 2) throw new Error();
    return db;
  } catch {
    try { closeDatabase(db); } catch (error) {
      console.error((error as PersistenceError).message);
    }
    throw new PersistenceError('DATABASE_SETUP_ERROR');
  }
}
