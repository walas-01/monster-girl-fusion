import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { openDatabase, resolveDatabasePath } from '../src/database.ts';
import { migrations, runMigrations } from '../src/migrations.ts';
import type { Migration } from '../src/migrations.ts';

function temporaryDirectory(context: TestContext) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'monster-database-')));

  context.after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  return directory;
}

function linkDirectory(target: string, path: string) {
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';

  symlinkSync(target, path, linkType);
}

async function databaseFixture(context: TestContext) {
  // Copied modules keep even a broken storage guard away from developer files.
  const directory = temporaryDirectory(context);

  mkdirSync(join(directory, 'src'));
  mkdirSync(join(directory, 'node_modules'));
  writeFileSync(join(directory, 'package.json'), '{ "type": "module" }');
  copyFileSync(new URL('../src/database.ts', import.meta.url), join(directory, 'src', 'database.ts'));
  linkDirectory(
    realpathSync(fileURLToPath(new URL('../node_modules/better-sqlite3', import.meta.url))),
    join(directory, 'node_modules', 'better-sqlite3'),
  );

  const module: typeof import('../src/database.ts') = await import(
    pathToFileURL(join(directory, 'src', 'database.ts')).href
  );

  return { directory, ...module };
}

function assertOpenFailure(open: () => unknown, causePattern?: RegExp) {
  assert.throws(open, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, 'Unable to open or configure SQLite database.');

    if (causePattern) {
      assert.ok(error.cause instanceof Error);
      assert.match(error.cause.message, causePattern);
    }

    return true;
  });
}

test('resolves a relative database path against the backend package', () => {
  const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

  assert.equal(
    resolveDatabasePath('example.sqlite', 'development'),
    join(backendDirectory, 'example.sqlite'),
  );
});

test('opens and closes a temporary database without creating application tables', (context) => {
  const directory = temporaryDirectory(context);

  const database = openDatabase(join(directory, 'test.sqlite'), 'test');

  try {
    assert.equal(database.open, true);
    assert.deepEqual(database.prepare('SELECT 1 AS value').get(), { value: 1 });
    assert.deepEqual(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all(), []);
  } finally {
    database.close();
  }

  assert.equal(database.open, false);
});

test('resolving the absent development path does not create storage', async (context) => {
  const fixture = await databaseFixture(context);

  for (const environment of [undefined, 'development', 'test']) {
    assert.equal(
      fixture.resolveDatabasePath(undefined, environment),
      join(fixture.directory, 'data', 'game.sqlite'),
    );
  }

  assert.equal(existsSync(join(fixture.directory, 'data')), false);
});

test('opening the default path creates data only in the copied package', async (context) => {
  const fixture = await databaseFixture(context);
  const database = fixture.openDatabase(undefined, 'development');

  try {
    assert.equal(database.name, join(fixture.directory, 'data', 'game.sqlite'));
    assert.equal(existsSync(database.name), true);
    assert.deepEqual(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all(), []);
  } finally {
    database.close();
  }
});

test('source and compiled modules resolve paths to the same copied package', async (context) => {
  const fixture = await databaseFixture(context);
  const compiledSource = new URL('../dist/database.js', import.meta.url);

  assert.ok(existsSync(compiledSource), 'Run npm run build before npm test.');
  mkdirSync(join(fixture.directory, 'dist'));
  copyFileSync(compiledSource, join(fixture.directory, 'dist', 'database.js'));

  const compiled: typeof import('../src/database.ts') = await import(
    pathToFileURL(join(fixture.directory, 'dist', 'database.js')).href
  );

  for (const value of [undefined, 'custom.sqlite']) {
    assert.equal(
      compiled.resolveDatabasePath(value, 'development'),
      fixture.resolveDatabasePath(value, 'development'),
    );
  }

  assert.equal(existsSync(join(fixture.directory, 'data')), false);
});

for (const value of ['', ' ', '\t', '\n', ' custom.sqlite', 'custom.sqlite ', ':memory:']) {
  test(`rejects invalid DATABASE_PATH=${JSON.stringify(value)}`, async (context) => {
    const fixture = await databaseFixture(context);

    assert.throws(() => fixture.openDatabase(value, 'test'), {
      message: 'DATABASE_PATH must be a nonempty file path without surrounding whitespace.',
    });
    assert.equal(existsSync(join(fixture.directory, 'data')), false);
  });
}

test('production requires an explicitly configured path', async (context) => {
  const fixture = await databaseFixture(context);

  assert.throws(() => fixture.openDatabase(undefined, 'production'), {
    message: 'DATABASE_PATH must be explicitly configured in production.',
  });
  assert.equal(existsSync(join(fixture.directory, 'data')), false);
});

test('production rejects a relative path without creating a fallback file', async (context) => {
  const fixture = await databaseFixture(context);

  assert.throws(() => fixture.openDatabase('custom.sqlite', 'production'), {
    message: 'DATABASE_PATH must be absolute in production.',
  });
  assert.equal(existsSync(join(fixture.directory, 'custom.sqlite')), false);
  assert.equal(existsSync(join(fixture.directory, 'data')), false);
});

test('production accepts an absolute path with an existing parent', async (context) => {
  const directory = temporaryDirectory(context);
  const path = join(directory, 'production.sqlite');
  const database = openDatabase(path, 'production');

  try {
    assert.equal(database.name, path);
    assert.equal(database.memory, false);
    assert.equal(existsSync(path), true);
  } finally {
    database.close();
  }
});

test('opens an explicit relative path inside an existing copied-package directory', async (context) => {
  const fixture = await databaseFixture(context);

  mkdirSync(join(fixture.directory, 'storage'));

  const database = fixture.openDatabase(join('storage', 'custom.sqlite'), 'test');

  try {
    assert.equal(database.name, join(fixture.directory, 'storage', 'custom.sqlite'));
    assert.equal(existsSync(join(fixture.directory, 'data')), false);
  } finally {
    database.close();
  }
});

test('supports spaces inside a configured directory and filename', async (context) => {
  const fixture = await databaseFixture(context);

  mkdirSync(join(fixture.directory, 'custom storage'));

  const database = fixture.openDatabase(join('custom storage', 'game state.sqlite'), 'test');

  try {
    assert.equal(existsSync(database.name), true);
  } finally {
    database.close();
  }
});

test('does not create a missing custom parent directory or use the default instead', async (context) => {
  const fixture = await databaseFixture(context);

  assertOpenFailure(() => fixture.openDatabase(join('missing', 'custom.sqlite'), 'test'));
  assert.equal(existsSync(join(fixture.directory, 'missing')), false);
  assert.equal(existsSync(join(fixture.directory, 'data')), false);
});

test('reports the driver failure for an existing directory target without a fallback', async (context) => {
  const fixture = await databaseFixture(context);

  mkdirSync(join(fixture.directory, 'storage'));
  assertOpenFailure(() => fixture.openDatabase('storage', 'test'));
  assert.equal(existsSync(join(fixture.directory, 'data')), false);
});

for (const name of ['src', 'dist', 'node_modules']) {
  test(`rejects storage inside ${name}`, async (context) => {
    const fixture = await databaseFixture(context);

    assert.throws(() => fixture.openDatabase(join(name, 'blocked.sqlite'), 'test'), {
      message: 'DATABASE_PATH must be outside src, dist, and node_modules.',
    });
    assert.equal(existsSync(join(fixture.directory, name, 'blocked.sqlite')), false);
  });
}

test('normalizes parent traversal before checking a prohibited path', async (context) => {
  const fixture = await databaseFixture(context);

  assert.throws(() => fixture.resolveDatabasePath('storage/../src/blocked.sqlite', 'test'), {
    message: 'DATABASE_PATH must be outside src, dist, and node_modules.',
  });
});

test('does not confuse a src-backups directory with src', async (context) => {
  const fixture = await databaseFixture(context);

  mkdirSync(join(fixture.directory, 'src-backups'));

  const database = fixture.openDatabase(join('src-backups', 'allowed.sqlite'), 'test');

  try {
    assert.equal(existsSync(database.name), true);
  } finally {
    database.close();
  }
});

test('path checks are lexical only and leave directory aliases to operator configuration', async (context) => {
  const fixture = await databaseFixture(context);

  linkDirectory(join(fixture.directory, 'src'), join(fixture.directory, 'shortcut'));
  assert.equal(
    fixture.resolveDatabasePath(join('shortcut', 'game.sqlite'), 'test'),
    join(fixture.directory, 'shortcut', 'game.sqlite'),
  );
  assert.equal(existsSync(join(fixture.directory, 'src', 'game.sqlite')), false);
});

test('enables the required foreign-key, WAL, durability and lock-wait settings', (context) => {
  const directory = temporaryDirectory(context);
  const database = openDatabase(join(directory, 'settings.sqlite'), 'test');

  try {
    assert.equal(database.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(database.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(database.pragma('synchronous', { simple: true }), 2);
    assert.equal(database.pragma('busy_timeout', { simple: true }), 1000);
  } finally {
    database.close();
  }
});

test('enforces foreign keys on disposable technical tables', (context) => {
  const directory = temporaryDirectory(context);
  const database = openDatabase(join(directory, 'foreign-keys.sqlite'), 'test');

  try {
    database.exec(`
      CREATE TABLE probe_parent (id INTEGER PRIMARY KEY);
      CREATE TABLE probe_child (parent_id INTEGER REFERENCES probe_parent(id));
    `);

    const insertChild = database.prepare('INSERT INTO probe_child (parent_id) VALUES (?)');

    assert.throws(() => insertChild.run(123), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
    database.prepare('INSERT INTO probe_parent (id) VALUES (?)').run(123);
    assert.equal(insertChild.run(123).changes, 1);
  } finally {
    database.close();
  }
});

test('preserves disposable data after closing and reopening the file', (context) => {
  const directory = temporaryDirectory(context);
  const path = join(directory, 'persistence.sqlite');
  const database = openDatabase(path, 'test');

  try {
    database.exec('CREATE TABLE connection_probe (value INTEGER NOT NULL)');
    database.prepare('INSERT INTO connection_probe (value) VALUES (?)').run(42);
  } finally {
    database.close();
  }

  const reopened = openDatabase(path, 'test');

  try {
    assert.deepEqual(reopened.prepare('SELECT value FROM connection_probe').all(), [{ value: 42 }]);
  } finally {
    reopened.close();
  }
});

test('does not overwrite a non-SQLite file when initialization fails', (context) => {
  const directory = temporaryDirectory(context);
  const path = join(directory, 'invalid.sqlite');
  const original = 'This is not a SQLite database.';

  writeFileSync(path, original);
  assertOpenFailure(() => openDatabase(path, 'test'));
  assert.equal(readFileSync(path, 'utf8'), original);
});

test('closes an acquired connection if a configuration call throws', (context) => {
  const directory = temporaryDirectory(context);
  const close = context.mock.method(Database.prototype, 'close');

  context.mock.method(Database.prototype, 'pragma', () => {
    throw new Error('Injected configuration failure.');
  });

  assertOpenFailure(
    () => openDatabase(join(directory, 'failed.sqlite'), 'test'),
    /Injected configuration failure/,
  );
  assert.equal(close.mock.callCount(), 1);

  const closedDatabase = close.mock.calls[0].this as Database.Database;

  assert.equal(closedDatabase.open, false);
});

for (const query of ['journal_mode = WAL', 'foreign_keys', 'synchronous', 'busy_timeout']) {
  test(`rejects an unexpected ${query} result and closes the connection`, (context) => {
    const directory = temporaryDirectory(context);
    const originalPragma = Database.prototype.pragma;
    const close = context.mock.method(Database.prototype, 'close');

    context.mock.method(Database.prototype, 'pragma', function (
      this: Database.Database,
      source: string,
      options?: Database.PragmaOptions,
    ) {
      const result = originalPragma.call(this, source, options);

      if (source === query) {
        return -1;
      }

      return result;
    });

    assertOpenFailure(
      () => openDatabase(join(directory, 'mismatch.sqlite'), 'test'),
      /Required SQLite connection settings could not be enabled/,
    );
    assert.equal(close.mock.callCount(), 1);

    const closedDatabase = close.mock.calls[0].this as Database.Database;

    assert.equal(closedDatabase.open, false);
  });
}

// All rows below are disposable constraint probes, not an authored game catalog.
const probeUserId = '00000000-0000-4000-8000-000000000001';
const probeItemId = '00000000-0000-4000-8000-000000000002';
type ProbeRow = Record<string, string | number | null>;

const probeRows: Record<string, ProbeRow> = {
  users: {
    id: probeUserId, google_id: 'probe-subject', email: 'probe@example.invalid', username: 'Probe',
    crystals: 0, mushrooms: 0, souls: 0, created_at: 0,
  },
  player_progress: {
    user_id: probeUserId, monster_capacity_level: 0, egg_capacity_level: 0,
    incubation_speed_level: 0, highest_expedition_difficulty: 1, starters_granted_at: null,
  },
  sessions: { sid: 'probe-session', expires_at: 0, data: '{}' },
  monster_species: {
    id: 'probe-a', tier: 1, type: 'normal', aspect: null,
    base_hp: 1, base_atk: 0, base_spd: 0, base_aim: 0, image_path: 'probe.png',
    name_en: 'Probe species', name_es: 'Especie de prueba',
  },
  enemy_species: {
    id: 'probe-enemy', difficulty: 1, type: 'normal', aspect: null,
    base_hp: 1, base_atk: 0, base_spd: 0, base_aim: 0, image_path: 'probe.png',
    name_en: 'Probe enemy', name_es: 'Enemigo de prueba',
  },
  monsters: {
    id: probeItemId, user_id: probeUserId, species_id: 'probe-a',
    max_hp: 1, atk: 0, spd: 0, aim: 0, tired_until: 0, created_at: 0,
  },
  monster_recipes: {
    input_a_species_id: 'probe-a', input_b_species_id: 'probe-b', result_species_id: 'probe-c',
  },
  eggs: { id: probeItemId, user_id: probeUserId, tier: 1, created_at: 0, ready_at: 0 },
};

function insertProbe(database: Database.Database, table: string, row: ProbeRow = probeRows[table]) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => '?').join(', ');

  return database.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`)
    .run(...Object.values(row));
}

function migratedDatabase(context: TestContext, definitions: readonly Migration[] = migrations) {
  let database: Database.Database | undefined;

  context.after(() => {
    if (database?.open) {
      database.close();
    }
  });

  const directory = temporaryDirectory(context);

  database = openDatabase(join(directory, 'schema.sqlite'), 'test');
  runMigrations(database, definitions);

  return database;
}

function insertProbeParents(database: Database.Database) {
  insertProbe(database, 'users');

  for (const id of ['probe-a', 'probe-b', 'probe-c']) {
    insertProbe(database, 'monster_species', { ...probeRows.monster_species, id });
  }
}

function databaseSnapshot(database: Database.Database) {
  const tables = database.prepare<[], { name: string }>(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
  ).all();

  return {
    schema: database.prepare('SELECT type, name, sql FROM sqlite_schema ORDER BY name').all(),
    rows: tables.map(({ name }) => ({
      name,
      rows: database.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all(),
    })),
  };
}

test('current migrations create nine STRICT tables, seven explicit indexes and no game rows', (context) => {
  const database = migratedDatabase(context);
  const expectedTables = [...Object.keys(probeRows), 'schema_migrations'].sort();

  assert.deepEqual(
    database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all(),
    expectedTables.map((name) => ({ name })),
  );

  const tables = database.pragma('table_list') as { name: string; strict: number }[];

  for (const table of expectedTables) {
    assert.equal(tables.find(({ name }) => name === table)?.strict, 1);
  }

  for (const table of Object.keys(probeRows)) {
    assert.deepEqual(database.prepare(`SELECT * FROM ${table}`).all(), []);
  }

  assert.deepEqual(
    database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND sql IS NOT NULL ORDER BY name").all(),
    [
      'eggs_user_id_idx', 'enemy_species_difficulty_idx', 'monster_recipes_input_b_idx',
      'monster_recipes_result_idx', 'monsters_species_id_idx', 'monsters_user_id_idx', 'sessions_expires_at_idx',
    ].map((name) => ({ name })),
  );
  assert.deepEqual(database.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all(), [
    { version: 1, name: 'create_initial_schema' },
    { version: 2, name: 'add_species_localized_names' },
  ]);
});

for (const table of Object.keys(probeRows)) {
  test(`${table} accepts valid probes and rejects null for every required column`, (context) => {
    const database = migratedDatabase(context);

    insertProbeParents(database);

    if (table === 'users' || table === 'monster_species') {
      database.prepare(`DELETE FROM ${table}`).run();
    }

    const columns = database.pragma(`table_info(${table})`) as { name: string; notnull: number }[];

    for (const column of columns) {
      if (column.notnull === 1) {
        assert.throws(
          () => insertProbe(database, table, { ...probeRows[table], [column.name]: null }),
          { code: 'SQLITE_CONSTRAINT_NOTNULL' },
          `${table}.${column.name}`,
        );
      }
    }

    assert.equal(insertProbe(database, table).changes, 1);
  });
}

const numericColumns = [
  { table: 'users', columns: ['crystals', 'mushrooms', 'souls', 'created_at'], min: 0, max: Number.MAX_SAFE_INTEGER },
  { table: 'player_progress', columns: ['monster_capacity_level', 'egg_capacity_level', 'incubation_speed_level', 'starters_granted_at'], min: 0, max: Number.MAX_SAFE_INTEGER },
  { table: 'player_progress', columns: ['highest_expedition_difficulty'], min: 1, max: 4 },
  { table: 'sessions', columns: ['expires_at'], min: 0, max: Number.MAX_SAFE_INTEGER },
  { table: 'monster_species', columns: ['tier'], min: 1, max: 6 },
  { table: 'enemy_species', columns: ['difficulty'], min: 1, max: 4 },
  { table: 'monsters', columns: ['max_hp'], min: 1, max: Number.MAX_SAFE_INTEGER },
  { table: 'monsters', columns: ['atk', 'spd', 'aim', 'tired_until', 'created_at'], min: 0, max: Number.MAX_SAFE_INTEGER },
  { table: 'eggs', columns: ['tier'], min: 1, max: 4 },
  { table: 'eggs', columns: ['created_at', 'ready_at'], min: 0, max: Number.MAX_SAFE_INTEGER },
];

for (const table of ['monster_species', 'enemy_species']) {
  numericColumns.push(
    { table, columns: ['base_hp'], min: 1, max: Number.MAX_SAFE_INTEGER },
    { table, columns: ['base_atk', 'base_spd', 'base_aim'], min: 0, max: Number.MAX_SAFE_INTEGER },
  );
}

for (const { table, columns, min, max } of numericColumns) {
  for (const column of columns) {
    test(`${table}.${column} enforces integer bounds ${min}..${max}`, (context) => {
      const database = migratedDatabase(context);

      insertProbeParents(database);

      if (table === 'users' || table === 'monster_species') {
        database.prepare(`DELETE FROM ${table}`).run();
      }

      for (const value of [min - 1, max + 1, 1.5, 'invalid']) {
        assert.throws(() => insertProbe(database, table, { ...probeRows[table], [column]: value }));
      }

      // Roll back each accepted boundary so the same unique IDs remain reusable.
      for (const value of [min, max]) {
        const row = { ...probeRows[table], [column]: value };

        if (table === 'eggs' && column === 'created_at') {
          row.ready_at = value;
        }

        database.exec('SAVEPOINT boundary_probe');
        assert.equal(insertProbe(database, table, row).changes, 1);
        database.exec('ROLLBACK TO boundary_probe');
        database.exec('RELEASE boundary_probe');
      }
    });
  }
}

test('identity and progression keys are unique and usernames are ASCII case-insensitive', (context) => {
  const database = migratedDatabase(context);

  insertProbe(database, 'users');
  assert.throws(() => insertProbe(database, 'users', {
    ...probeRows.users, google_id: 'other-subject', username: 'Different',
  }), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
  assert.throws(() => insertProbe(database, 'users', {
    ...probeRows.users, id: probeItemId, username: 'Different',
  }), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  assert.throws(() => insertProbe(database, 'users', {
    ...probeRows.users, id: probeItemId, google_id: 'other-subject', username: 'pRoBe',
  }), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
  insertProbe(database, 'player_progress');
  assert.throws(() => insertProbe(database, 'player_progress'), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
});

test('text length constraints reject empty, short or oversized identifiers and paths', (context) => {
  const database = migratedDatabase(context);
  const cases = [
    { table: 'users', column: 'id', invalid: ['', 'x'.repeat(35), 'x'.repeat(37)] },
    { table: 'users', column: 'google_id', invalid: ['', 'x'.repeat(256)] },
    { table: 'users', column: 'email', invalid: ['ab', 'x'.repeat(321)] },
    { table: 'users', column: 'username', invalid: ['ab', 'x'.repeat(21)] },
    { table: 'sessions', column: 'sid', invalid: [''] },
    { table: 'monsters', column: 'id', invalid: ['', 'x'.repeat(37)] },
    { table: 'eggs', column: 'id', invalid: ['', 'x'.repeat(37)] },
  ];

  for (const table of ['monster_species', 'enemy_species']) {
    for (const column of ['id', 'type', 'aspect']) {
      cases.push({ table, column, invalid: ['', 'x'.repeat(65)] });
    }

    cases.push({ table, column: 'image_path', invalid: ['', 'x'.repeat(256)] });
    cases.push({ table, column: 'name_en', invalid: [''] });
    cases.push({ table, column: 'name_es', invalid: [''] });
  }

  for (const { table, column, invalid } of cases) {
    for (const value of invalid) {
      assert.throws(() => insertProbe(database, table, { ...probeRows[table], [column]: value }),
        { code: 'SQLITE_CONSTRAINT_CHECK' }, `${table}.${column}`);
    }
  }
});

test('sessions accept JSON objects but reject malformed JSON, arrays and primitives', (context) => {
  const database = migratedDatabase(context);

  for (const data of ['{', '[]', 'null', 'true', '42', '"text"']) {
    assert.throws(() => insertProbe(database, 'sessions', { ...probeRows.sessions, data }));
  }

  assert.equal(insertProbe(database, 'sessions', {
    ...probeRows.sessions, data: JSON.stringify({ userId: probeUserId }),
  }).changes, 1);
});

test('only aspects and the starter marker are nullable; tired state uses one deadline', (context) => {
  const database = migratedDatabase(context);

  insertProbeParents(database);
  insertProbe(database, 'enemy_species');
  insertProbe(database, 'player_progress');

  const monster = { ...probeRows.monsters };

  delete monster.tired_until;
  insertProbe(database, 'monsters', monster);
  assert.deepEqual(database.prepare('SELECT tired_until FROM monsters').get(), { tired_until: 0 });
  assert.deepEqual(database.prepare('SELECT starters_granted_at FROM player_progress').get(), { starters_granted_at: null });
  assert.deepEqual(database.prepare('SELECT type, aspect FROM enemy_species').get(), { type: 'normal', aspect: null });

  database.prepare('UPDATE player_progress SET starters_granted_at = ?').run(123);
  database.prepare('UPDATE monster_species SET aspect = ?').run('probe-aspect');
  assert.deepEqual(database.prepare('SELECT starters_granted_at FROM player_progress').get(), { starters_granted_at: 123 });

  const nullable = Object.keys(probeRows).flatMap((table) => {
    const columns = database.pragma(`table_info(${table})`) as { name: string; notnull: number }[];

    return columns.filter((column) => column.notnull === 0).map((column) => `${table}.${column.name}`);
  });

  assert.deepEqual(nullable.sort(), ['enemy_species.aspect', 'monster_species.aspect', 'player_progress.starters_granted_at']);
});

for (const { table, columns } of [
  { table: 'player_progress', columns: ['user_id'] },
  { table: 'monsters', columns: ['user_id', 'species_id'] },
  { table: 'monster_recipes', columns: ['input_a_species_id', 'input_b_species_id', 'result_species_id'] },
  { table: 'eggs', columns: ['user_id'] },
]) {
  for (const column of columns) {
    test(`${table}.${column} rejects missing parents and restricts parent deletion/update`, (context) => {
      const database = migratedDatabase(context);

      insertProbeParents(database);

      // Keep canonical recipe ordering valid while testing the foreign key itself.
      let missing = 'missing-parent';

      if (column === 'input_b_species_id') {
        missing = 'zz-missing-parent';
      }

      assert.throws(() => insertProbe(database, table, { ...probeRows[table], [column]: missing }),
        { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
      insertProbe(database, table);

      const parentTable = column === 'user_id' ? 'users' : 'monster_species';
      const parentId = probeRows[table][column];

      assert.throws(() => database.prepare(`DELETE FROM ${parentTable} WHERE id = ?`).run(parentId),
        { code: 'SQLITE_CONSTRAINT_TRIGGER' });
      assert.throws(() => database.prepare(`UPDATE ${parentTable} SET id = ? WHERE id = ?`)
        .run('00000000-0000-4000-8000-000000000099', parentId),
      { code: 'SQLITE_CONSTRAINT_TRIGGER' });
    });
  }
}

test('recipes require distinct ordered parents, unique pairs and allow shared results', (context) => {
  const database = migratedDatabase(context);

  insertProbeParents(database);
  insertProbe(database, 'monster_recipes');
  assert.throws(() => insertProbe(database, 'monster_recipes'), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });

  for (const [a, b] of [['probe-b', 'probe-a'], ['probe-a', 'probe-a']]) {
    assert.throws(() => insertProbe(database, 'monster_recipes', {
      input_a_species_id: a, input_b_species_id: b, result_species_id: 'probe-c',
    }), { code: 'SQLITE_CONSTRAINT_CHECK' });
  }

  assert.equal(insertProbe(database, 'monster_recipes', {
    input_a_species_id: 'probe-a', input_b_species_id: 'probe-c', result_species_id: 'probe-c',
  }).changes, 1);
});

test('egg readiness cannot precede acquisition', (context) => {
  const database = migratedDatabase(context);

  insertProbeParents(database);
  assert.throws(() => insertProbe(database, 'eggs', { ...probeRows.eggs, created_at: 2, ready_at: 1 }),
    { code: 'SQLITE_CONSTRAINT_CHECK' });
});

test('reopening and rerunning current migrations preserves all schema, rows and history', (context) => {
  const database = migratedDatabase(context);
  const path = database.name;

  insertProbeParents(database);

  for (const table of ['player_progress', 'sessions', 'enemy_species', 'monsters', 'monster_recipes', 'eggs']) {
    insertProbe(database, table);
  }

  const before = databaseSnapshot(database);

  runMigrations(database);
  assert.deepEqual(databaseSnapshot(database), before);
  database.close();

  const reopened = openDatabase(path, 'test');

  try {
    runMigrations(reopened);
    assert.deepEqual(databaseSnapshot(reopened), before);
  } finally {
    reopened.close();
  }
});

test('a new migration applies once without rewriting previous history or data', (context) => {
  const database = migratedDatabase(context);
  const before = database.prepare('SELECT * FROM schema_migrations').all();
  const definitions = [...migrations, {
    version: 3, name: 'probe_next_version', sql: 'CREATE TABLE migration_probe (value INTEGER) STRICT;',
  }];

  runMigrations(database, definitions);
  assert.deepEqual(database.prepare('SELECT * FROM schema_migrations WHERE version <= 2').all(), before);
  assert.deepEqual(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all(), [
    { version: 1 }, { version: 2 }, { version: 3 },
  ]);

  const snapshot = databaseSnapshot(database);

  runMigrations(database, definitions);
  assert.deepEqual(databaseSnapshot(database), snapshot);
});

test('failure on a fresh database rolls back schema and the bootstrap history table', (context) => {
  const directory = temporaryDirectory(context);
  const database = openDatabase(join(directory, 'rollback.sqlite'), 'test');

  try {
    assert.throws(() => runMigrations(database, [...migrations, {
      version: 3, name: 'probe_failure', sql: 'CREATE TABLE rollback_probe (id INTEGER); INVALID SQL;',
    }]));
    assert.deepEqual(database.prepare('SELECT name FROM sqlite_schema').all(), []);
    assert.equal(database.inTransaction, false);
    runMigrations(database);
    assert.equal(database.prepare('SELECT count(*) FROM schema_migrations').pluck().get(), 2);
  } finally {
    database.close();
  }
});

test('a failed pending batch rolls back every new version and preserves committed state', (context) => {
  const database = migratedDatabase(context);

  insertProbeParents(database);

  const before = databaseSnapshot(database);

  assert.throws(() => runMigrations(database, [...migrations,
    { version: 3, name: 'probe_write', sql: 'UPDATE users SET crystals = 123; CREATE TABLE rollback_probe (id INTEGER);' },
    { version: 4, name: 'probe_failure', sql: 'INVALID SQL;' },
  ]));
  assert.deepEqual(databaseSnapshot(database), before);
  assert.equal(database.inTransaction, false);
});

for (const sql of [
  'DELETE FROM schema_migrations',
  'DROP TABLE schema_migrations',
  'UPDATE schema_migrations SET version = 3 WHERE version = 2',
  "UPDATE schema_migrations SET name = 'changed' WHERE version = 1",
  "UPDATE schema_migrations SET sql_hash = replace(sql_hash, substr(sql_hash, 1, 1), 'z')",
]) {
  test(`rejects incompatible history without modifying storage: ${sql}`, (context) => {
    const database = migratedDatabase(context);

    insertProbeParents(database);
    database.exec(sql);

    const before = databaseSnapshot(database);

    assert.throws(() => runMigrations(database));
    assert.deepEqual(databaseSnapshot(database), before);
  });
}

test('rejects gapped and newer history even when later migrations are available', (context) => {
  const database = migratedDatabase(context);
  const definitions = [...migrations,
    { version: 3, name: 'probe_three', sql: 'SELECT 3;' },
    { version: 4, name: 'probe_four', sql: 'SELECT 4;' },
  ];

  runMigrations(database, definitions);
  assert.throws(() => runMigrations(database), /Incompatible migration history/);
  database.exec('DELETE FROM schema_migrations WHERE version = 3');

  const before = databaseSnapshot(database);

  assert.throws(() => runMigrations(database, definitions), /Incompatible migration history/);
  assert.deepEqual(databaseSnapshot(database), before);
});

test('changed migration SQL is rejected while CRLF and LF produce the same checksum', (context) => {
  const database = migratedDatabase(context);

  runMigrations(database, migrations.map((migration) => ({
    ...migration, sql: migration.sql.replace(/\n/g, '\r\n'),
  })));

  const before = databaseSnapshot(database);

  assert.throws(() => runMigrations(database, migrations.map((migration) => ({
    ...migration, sql: `${migration.sql}\n-- changed`,
  }))), /Incompatible migration history/);
  assert.deepEqual(databaseSnapshot(database), before);
});

for (const sql of [
  'CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES (\'preserve\');',
  'CREATE VIEW unrelated AS SELECT 1;',
  'CREATE TABLE sqlitex_probe (value TEXT);',
]) {
  test(`refuses unknown existing schemas: ${sql}`, (context) => {
    const directory = temporaryDirectory(context);
    const database = openDatabase(join(directory, 'unknown.sqlite'), 'test');

    try {
      database.exec(sql);

      const before = databaseSnapshot(database);

      assert.throws(() => runMigrations(database), /unknown existing schema/);
      assert.deepEqual(databaseSnapshot(database), before);
    } finally {
      database.close();
    }
  });
}

test('rejects invalid migration definitions before touching storage', (context) => {
  const database = migratedDatabase(context);
  const before = databaseSnapshot(database);
  const invalid: Migration[][] = [
    [{ version: 0, name: 'probe', sql: 'SELECT 1;' }],
    [{ version: 2, name: 'probe', sql: 'SELECT 1;' }],
    [{ version: 1.5, name: 'probe', sql: 'SELECT 1;' }],
    [{ version: 1, name: '', sql: 'SELECT 1;' }],
    [{ version: 1, name: 'x'.repeat(129), sql: 'SELECT 1;' }],
    [{ version: 1, name: 'probe', sql: ' ' }],
    [{ version: 1, name: 'probe', sql: 'SELECT 1;' }, { version: 2, name: 'probe', sql: 'SELECT 2;' }],
  ];

  for (const definitions of invalid) {
    assert.throws(() => runMigrations(database, definitions), /Invalid migration definitions/);
    assert.deepEqual(databaseSnapshot(database), before);
  }
});

test('compiled and source runners use identical schema and checksums', async (context) => {
  const database = migratedDatabase(context);
  const before = databaseSnapshot(database);
  const compiled: typeof import('../src/migrations.ts') = await import(
    new URL('../dist/migrations.js', import.meta.url).href
  );

  compiled.runMigrations(database);
  assert.deepEqual(databaseSnapshot(database), before);
});

test('history constraints reject invalid versions, names, hashes and timestamps', (context) => {
  const database = migratedDatabase(context);
  const row = { version: 3, name: 'probe_history', sql_hash: 'a'.repeat(64), applied_at: 0 };
  const cases = [
    { column: 'version', values: [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1] },
    { column: 'name', values: ['', 'x'.repeat(129)] },
    { column: 'sql_hash', values: ['', 'a'.repeat(63), 'a'.repeat(65)] },
    { column: 'applied_at', values: [-1, 1.5, Number.MAX_SAFE_INTEGER + 1] },
  ];

  for (const { column, values } of cases) {
    // INTEGER PRIMARY KEY allocates an ID for NULL; the runner always binds a validated version.
    const invalidValues = column === 'version' ? values : [...values, null];

    for (const value of invalidValues) {
      assert.throws(() => insertProbe(database, 'schema_migrations', { ...row, [column]: value }));
    }
  }
});

for (const value of ['-1', '9007199254740992', "'invalid'"]) {
  test(`runner rejects invalid stored history timestamps: ${value}`, (context) => {
    const database = migratedDatabase(context);

    if (value === "'invalid'") {
      // Simulate incompatible history from a non-STRICT external schema.
      database.exec(`
        ALTER TABLE schema_migrations RENAME TO old_history;
        CREATE TABLE schema_migrations (version INTEGER, name TEXT, sql_hash TEXT, applied_at);
        INSERT INTO schema_migrations SELECT * FROM old_history;
        DROP TABLE old_history;
      `);
    } else {
      database.pragma('ignore_check_constraints = ON');
    }

    database.exec(`UPDATE schema_migrations SET applied_at = ${value}`);
    database.pragma('ignore_check_constraints = OFF');

    // Preserve exact out-of-range values in the comparison as well.
    const before = database.prepare('SELECT * FROM schema_migrations').safeIntegers().all();

    assert.throws(() => runMigrations(database), /Incompatible migration history/);
    assert.deepEqual(database.prepare('SELECT * FROM schema_migrations').safeIntegers().all(), before);
  });
}

test('indexes cover the intended lookup columns without redundant primary-key indexes', (context) => {
  const database = migratedDatabase(context);
  const indexes = {
    sessions_expires_at_idx: 'expires_at',
    enemy_species_difficulty_idx: 'difficulty',
    monsters_user_id_idx: 'user_id',
    monsters_species_id_idx: 'species_id',
    monster_recipes_input_b_idx: 'input_b_species_id',
    monster_recipes_result_idx: 'result_species_id',
    eggs_user_id_idx: 'user_id',
  };

  for (const [name, column] of Object.entries(indexes)) {
    const columns = database.pragma(`index_info(${name})`) as { name: string }[];

    assert.deepEqual(columns.map((entry) => entry.name), [column]);
  }
});

test('domain primary keys prevent duplicate sessions, catalog entries and owned items', (context) => {
  const database = migratedDatabase(context);

  insertProbeParents(database);
  assert.throws(() => insertProbe(database, 'monster_species'), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });

  for (const table of ['sessions', 'enemy_species', 'monsters', 'eggs']) {
    insertProbe(database, table);
    assert.throws(() => insertProbe(database, table), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
  }
});

test('no game initialization defaults are introduced except the tired deadline sentinel', (context) => {
  const database = migratedDatabase(context);
  const defaults = Object.keys(probeRows).flatMap((table) => {
    const columns = database.pragma(`table_info(${table})`) as { name: string; dflt_value: string | null }[];

    return columns.filter((column) => column.dflt_value !== null).map((column) => ({
      column: `${table}.${column.name}`, value: column.dflt_value,
    }));
  });

  assert.deepEqual(defaults, [{ column: 'monsters.tired_until', value: '0' }]);
});

test('migration 2 upgrades empty legacy catalogs without changing version 1 history or player rows', (context) => {
  const database = migratedDatabase(context, migrations.slice(0, 1));

  for (const table of ['users', 'player_progress', 'sessions', 'eggs']) {
    insertProbe(database, table);
  }

  const history = database.prepare('SELECT * FROM schema_migrations WHERE version = 1').all();
  const rows = databaseSnapshot(database).rows.filter(({ name }) => name !== 'schema_migrations');

  runMigrations(database);
  assert.deepEqual(database.prepare('SELECT * FROM schema_migrations WHERE version = 1').all(), history);
  assert.deepEqual(databaseSnapshot(database).rows.filter(({ name }) => name !== 'schema_migrations'), rows);
  assert.deepEqual(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all(), [
    { version: 1 }, { version: 2 },
  ]);

  const upgraded = databaseSnapshot(database);

  runMigrations(database);
  assert.deepEqual(databaseSnapshot(database), upgraded);
});

for (const table of ['monster_species', 'enemy_species']) {
  test(`migration 2 refuses unnamed legacy ${table} rows without partial schema changes or data loss`, (context) => {
    const database = migratedDatabase(context, migrations.slice(0, 1));
    const legacy = { ...probeRows[table] };

    delete legacy.name_en;
    delete legacy.name_es;
    insertProbe(database, table, legacy);

    const before = databaseSnapshot(database);

    assert.throws(() => runMigrations(database), /NOT NULL/);
    assert.deepEqual(databaseSnapshot(database), before);
    assert.equal(database.inTransaction, false);
  });

  test(`${table} requires both localized names and preserves Unicode without making names unique`, (context) => {
    const database = migratedDatabase(context);

    for (const column of ['name_en', 'name_es']) {
      const missing = { ...probeRows[table] };

      delete missing[column];
      assert.throws(() => insertProbe(database, table, missing), { code: 'SQLITE_CONSTRAINT_NOTNULL' });
    }

    const row: ProbeRow = { ...probeRows[table], name_en: 'Probe 🐇', name_es: 'Prueba áéíóú' };

    insertProbe(database, table, row);
    insertProbe(database, table, { ...row, id: 'probe-duplicate-name' });
    assert.deepEqual(database.prepare(`SELECT id, name_en, name_es FROM ${table} WHERE id = ?`).get(row.id), {
      id: row.id, name_en: 'Probe 🐇', name_es: 'Prueba áéíóú',
    });
  });
}
