import type { Config } from '../config.js';
import { closeDatabase, openDatabase } from './connection.js';
import { migrationCatalog } from './migration-catalog.js';
import { runMigrations } from './migrations.js';
import type { Migration } from './migrations.js';
import { PersistenceError } from './errors.js';

export function initializeDatabase(config: Config, catalog: readonly Migration[] = migrationCatalog) {
  const db = openDatabase(config);
  try {
    runMigrations(db, catalog);
    return db;
  } catch (error) {
    try { closeDatabase(db); } catch (cleanupError) {
      console.error((cleanupError as PersistenceError).message);
    }
    throw error;
  }
}
