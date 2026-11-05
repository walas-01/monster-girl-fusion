import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { PersistenceError } from './errors.js';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

interface MigrationRecord {
  version: number;
  name: string;
  sql_hash: string;
  applied_at: number;
}

const metadataSchema = `CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL UNIQUE CHECK (length(name) > 0),
  sql_hash TEXT NOT NULL CHECK (length(sql_hash) = 64),
  applied_at INTEGER NOT NULL CHECK (applied_at >= 0)
) STRICT`;

function normalizeSchema(sql: string) {
  return sql.trim().replace(/;$/, '').replace(/\s+/g, ' ').toLowerCase();
}

function sqlHash(sql: string) {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export function runMigrations(db: Database.Database, catalog: readonly Migration[]) {
  const names = new Set<string>();
  for (const [index, migration] of catalog.entries()) {
    if (migration.version !== index + 1 || !/^[a-z][a-z0-9_-]*$/.test(migration.name)
      || migration.name.trim() !== migration.name
      || names.has(migration.name) || !migration.sql.trim()) {
      throw new PersistenceError('MIGRATION_CATALOG_ERROR');
    }
    names.add(migration.name);
  }

  let appliedCount: number;
  try {
    appliedCount = db.transaction(() => {
      const objects = db.prepare<[], { name: string; type: string; sql: string | null }>(
        "SELECT name, type, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
      ).all();
      const metadata = objects.find((object) => object.name === 'schema_migrations');
      if (!metadata) {
        if (objects.length !== 0) throw new Error();
        db.exec(metadataSchema);
      } else if (metadata.type !== 'table' || metadata.sql === null
        || normalizeSchema(metadata.sql) !== normalizeSchema(metadataSchema)) {
        throw new Error();
      }

      const history = db.prepare<[], MigrationRecord>('SELECT * FROM schema_migrations ORDER BY version').all();
      for (const [index, row] of history.entries()) {
        const migration = catalog[index];
        if (!migration || row.version !== index + 1 || row.name !== migration.name
          || row.sql_hash !== sqlHash(migration.sql)
          || !Number.isSafeInteger(row.applied_at) || row.applied_at < 0) {
          throw new Error();
        }
      }
      return history.length;
    }).immediate();
  } catch {
    throw new PersistenceError('MIGRATION_HISTORY_ERROR');
  }

  for (const migration of catalog.slice(appliedCount)) {
    try {
      db.transaction(() => {
        db.exec(migration.sql);
        if (!db.inTransaction) throw new Error();
        const result = db.prepare('INSERT INTO schema_migrations (version, name, sql_hash, applied_at) VALUES (?, ?, ?, ?)')
          .run(migration.version, migration.name, sqlHash(migration.sql), Date.now());
        if (result.changes !== 1) throw new Error();
      }).immediate();
    } catch {
      console.error(`MIGRATION_FAILED: Version ${migration.version}.`);
      throw new PersistenceError('MIGRATION_FAILED');
    }
    console.info(`MIGRATION_APPLIED: Version ${migration.version}.`);
  }
}
