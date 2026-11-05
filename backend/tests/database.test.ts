import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { closeDatabase, openDatabase } from '../src/database/connection.js';
import { initializeDatabase } from '../src/database/initialize.js';
import { databaseFixture } from './database-helpers.js';

test('file-backed data and prepared-statement values survive closing and reopening', (t) => {
  const fixture = databaseFixture(t);
  const db = fixture.open();
  db.exec('CREATE TABLE fixture (value TEXT NOT NULL) STRICT');
  const value = "'); DROP TABLE fixture; --";
  db.prepare('INSERT INTO fixture VALUES (?)').run(value);
  closeDatabase(db);
  closeDatabase(db);
  const reopened = fixture.open();
  assert.deepEqual(reopened.prepare('SELECT value FROM fixture').all(), [{ value }]);
  assert.equal(reopened.memory, false);
});

test('connection settings enforce WAL, FULL durability, foreign keys, and a bounded lock wait', (t) => {
  const db = databaseFixture(t).open();
  for (const [name, expected] of [['journal_mode', 'wal'], ['synchronous', 2], ['foreign_keys', 1], ['busy_timeout', 1000]] as const) {
    assert.equal(db.pragma(name, { simple: true }), expected);
  }
  db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (parent_id INTEGER REFERENCES parent(id))');
  assert.throws(() => db.prepare('INSERT INTO child VALUES (?)').run(10), /FOREIGN KEY/);
  db.prepare('INSERT INTO parent VALUES (?)').run(10);
  assert.doesNotThrow(() => db.prepare('INSERT INTO child VALUES (?)').run(10));
});

test('write transactions commit, roll back, and leave the connection usable', (t) => {
  const db = databaseFixture(t).open();
  db.exec('CREATE TABLE fixture (value INTEGER NOT NULL) STRICT');
  const insert = db.prepare('INSERT INTO fixture VALUES (?)');
  db.transaction(() => { insert.run(1); insert.run(2); }).immediate();
  assert.throws(() => db.transaction(() => { insert.run(3); throw new Error('failure'); }).immediate());
  assert.equal(db.inTransaction, false);
  db.transaction(() => insert.run(4)).immediate();
  assert.deepEqual(db.prepare('SELECT value FROM fixture').all(), [{ value: 1 }, { value: 2 }, { value: 4 }]);
});

test('nested transactions use savepoints and uncaught errors roll back the outer write', (t) => {
  const db = databaseFixture(t).open();
  db.exec('CREATE TABLE fixture (value INTEGER)');
  const insert = db.prepare('INSERT INTO fixture VALUES (?)');
  const nested = db.transaction(() => { insert.run(2); throw new Error('nested'); });
  db.transaction(() => { insert.run(1); assert.throws(nested); insert.run(3); }).immediate();
  assert.throws(() => db.transaction(() => { insert.run(4); nested(); }).immediate());
  assert.deepEqual(db.prepare('SELECT value FROM fixture').all(), [{ value: 1 }, { value: 3 }]);
});

test('development creates parents; production refuses missing parents without creating them', (t) => {
  const fixture = databaseFixture(t);
  const path = join(fixture.directory, 'nested', 'game.sqlite');
  assert.throws(() => openDatabase({ nodeEnv: 'production', databasePath: path }), /DATABASE_STORAGE_ERROR/);
  assert.equal(existsSync(join(fixture.directory, 'nested')), false);
  const db = fixture.track(openDatabase({ nodeEnv: 'test', databasePath: path }));
  closeDatabase(db);
  assert.doesNotThrow(() => fixture.track(openDatabase({ nodeEnv: 'production', databasePath: path })));
});

test('unusable paths and corrupt files fail safely without fallback or resetting contents', (t) => {
  const fixture = databaseFixture(t);
  const path = fixture.config.databasePath;
  mkdirSync(path);
  assert.throws(() => fixture.open(), /DATABASE_OPEN_ERROR/);
  rmdirSync(path);
  writeFileSync(path, 'private invalid sqlite content');
  assert.throws(() => fixture.open(), { message: 'DATABASE_SETUP_ERROR: Unable to configure the SQLite database. Check file integrity, locking, and WAL support.' });
  assert.equal(readFileSync(path, 'utf8'), 'private invalid sqlite content');
});

test('connection setup failures close an already-opened handle without exposing internal errors', (t) => {
  const fixture = databaseFixture(t);
  const originalClose = Database.prototype.close;
  let closes = 0;
  t.mock.method(Database.prototype, 'close', function (this: Database.Database) {
    closes++;
    return originalClose.call(this);
  });
  t.mock.method(Database.prototype, 'pragma', () => { throw new Error('private data'); });
  assert.throws(() => fixture.open(), /DATABASE_SETUP_ERROR/);
  assert.equal(closes, 1);
});

test('failed migrations release initialized database handles and retain the file for retry', (t) => {
  const fixture = databaseFixture(t);
  t.mock.method(console, 'error', () => {});
  const originalClose = Database.prototype.close;
  let closes = 0;
  t.mock.method(Database.prototype, 'close', function (this: Database.Database) {
    closes++;
    return originalClose.call(this);
  });
  assert.throws(() => initializeDatabase(fixture.config, [{ version: 1, name: 'fails', sql: 'INVALID SQL' }]), /MIGRATION_FAILED/);
  assert.equal(closes, 1);
  assert.equal(existsSync(fixture.config.databasePath), true);
  const reopened = fixture.track(initializeDatabase(fixture.config, []));
  assert.deepEqual(reopened.prepare('SELECT * FROM schema_migrations').all(), []);
});

test('database close errors are sanitized and can be diagnosed without dumping driver errors', (t) => {
  const db = databaseFixture(t).open();
  const mocked = t.mock.method(db, 'close', () => { throw new Error('private driver detail'); });
  try {
    assert.throws(() => closeDatabase(db), { message: 'DATABASE_CLOSE_ERROR: Unable to close the SQLite database cleanly.' });
  } finally { mocked.mock.restore(); }
  closeDatabase(db);
});

test('lock contention times out and the connection remains usable after the lock is released', (t) => {
  const fixture = databaseFixture(t);
  const first = fixture.open();
  first.exec('CREATE TABLE fixture (value INTEGER)');
  const second = fixture.open();
  first.transaction(() => {
    const started = performance.now();
    assert.throws(() => second.prepare('INSERT INTO fixture VALUES (?)').run(1), { code: 'SQLITE_BUSY' });
    assert.ok(performance.now() - started < 3_000);
  }).immediate();
  assert.doesNotThrow(() => second.prepare('INSERT INTO fixture VALUES (?)').run(2));
});
