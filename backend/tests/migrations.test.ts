import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runMigrations } from '../src/database/migrations.js';
import type { Migration } from '../src/database/migrations.js';
import { databaseFixture } from './database-helpers.js';

const first: Migration = {
  version: 1, name: 'create_fixture',
  sql: 'CREATE TABLE fixture (value TEXT NOT NULL) STRICT;\nINSERT INTO fixture VALUES (\'first\');',
};
const second: Migration = { version: 2, name: 'append_fixture', sql: "INSERT INTO fixture VALUES ('second');" };

test('fresh initialization creates only bookkeeping with an empty, repeatable catalog', (t) => {
  const db = databaseFixture(t).open();
  runMigrations(db, []);
  runMigrations(db, []);
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").all(), [
    { name: 'schema_migrations' },
  ]);
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations').all(), []);
});

test('pending migrations run in order and completed work is never applied twice', (t) => {
  const db = databaseFixture(t).open();
  runMigrations(db, [first]);
  runMigrations(db, [first, second]);
  runMigrations(db, [first, second]);
  assert.deepEqual(db.prepare('SELECT value FROM fixture').all(), [{ value: 'first' }, { value: 'second' }]);
  const history = db.prepare<[], { version: number; name: string; sql_hash: string; applied_at: number }>(
    'SELECT * FROM schema_migrations ORDER BY version',
  ).all();
  assert.deepEqual(history.map((row) => row.version), [1, 2]);
  for (const row of history) {
    assert.match(row.sql_hash, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(row.applied_at) && row.applied_at > 0);
  }
});

test('a failed migration rolls back DDL, writes, and its history while preserving earlier work', (t) => {
  const fixture = databaseFixture(t);
  const db = fixture.open();
  const logs: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logs.push(args); });
  const fails: Migration = {
    version: 2, name: 'retry_fixture',
    sql: "CREATE TABLE private_fixture (id INTEGER); INSERT INTO fixture VALUES ('private'); INVALID SQL;",
  };
  assert.throws(() => runMigrations(db, [first, fails]), /MIGRATION_FAILED/);
  assert.equal(db.inTransaction, false);
  assert.deepEqual(db.prepare('SELECT value FROM fixture').all(), [{ value: 'first' }]);
  assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'private_fixture'").get(), undefined);
  assert.deepEqual(db.prepare('SELECT version FROM schema_migrations').all(), [{ version: 1 }]);
  assert.doesNotMatch(JSON.stringify(logs), /private|INVALID SQL/);
  db.close();
  const reopened = fixture.open();
  runMigrations(reopened, [first, { ...fails, sql: "INSERT INTO fixture VALUES ('corrected');" }]);
  assert.deepEqual(reopened.prepare('SELECT value FROM fixture').all(), [{ value: 'first' }, { value: 'corrected' }]);
  assert.deepEqual(reopened.prepare('SELECT version FROM schema_migrations ORDER BY version').all(), [{ version: 1 }, { version: 2 }]);
});

test('CRLF and LF representations have the same migration hash', (t) => {
  const db = databaseFixture(t).open();
  runMigrations(db, [first]);
  assert.doesNotThrow(() => runMigrations(db, [{ ...first, sql: first.sql.replace(/\n/g, '\r\n') }]));
});

for (const [label, catalog] of [
  ['zero version', [{ ...first, version: 0 }]],
  ['gap', [first, { ...second, version: 3 }]],
  ['duplicate version', [first, { ...second, version: 1 }]],
  ['duplicate name', [first, { ...second, name: first.name }]],
  ['unsorted', [second, first]],
  ['invalid name', [{ ...first, name: 'invalid\n' }]],
  ['empty SQL', [{ ...first, sql: ' ' }]],
] as const) {
  test(`invalid catalog (${label}) is rejected before modifying the schema`, (t) => {
    const db = databaseFixture(t).open();
    assert.throws(() => runMigrations(db, catalog), /MIGRATION_CATALOG_ERROR/);
    assert.deepEqual(db.prepare('SELECT name FROM sqlite_schema').all(), []);
  });
}

for (const [label, update, catalog] of [
  ['edited applied SQL', '', [{ ...first, sql: first.sql + '\nSELECT 1;' }, second]],
  ['edited name', '', [{ ...first, name: 'changed' }, second]],
  ['unknown/newer history', '', [first]],
  ['gapped history', 'DELETE FROM schema_migrations WHERE version = 1', [first, second]],
  ['changed hash', "UPDATE schema_migrations SET sql_hash = '" + '0'.repeat(64) + "' WHERE version = 1", [first, second]],
  ['unsafe timestamp', 'UPDATE schema_migrations SET applied_at = 9007199254740992 WHERE version = 1', [first, second]],
] as const) {
  test(`incompatible history (${label}) stops before pending work`, (t) => {
    const db = databaseFixture(t).open();
    runMigrations(db, [first, second]);
    if (update) db.exec(update);
    assert.throws(() => runMigrations(db, catalog), /MIGRATION_HISTORY_ERROR/);
    assert.deepEqual(db.prepare('SELECT value FROM fixture').all(), [{ value: 'first' }, { value: 'second' }]);
  });
}

for (const sql of [
  'CREATE TABLE unrelated (id INTEGER)',
  'CREATE TABLE sqlitex_fixture (id INTEGER)',
  'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, sql_hash TEXT, applied_at INTEGER)',
  'CREATE VIEW schema_migrations AS SELECT 1 AS version',
]) {
  test(`refuses unrelated or incompatible database schema: ${sql}`, (t) => {
    const db = databaseFixture(t).open();
    db.exec(sql);
    const before = db.prepare('SELECT * FROM sqlite_schema').all();
    assert.throws(() => runMigrations(db, []), /MIGRATION_HISTORY_ERROR/);
    assert.deepEqual(db.prepare('SELECT * FROM sqlite_schema').all(), before);
  });
}
