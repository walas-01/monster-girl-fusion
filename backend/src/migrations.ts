import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

const historySql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER NOT NULL PRIMARY KEY
    CHECK (version BETWEEN 1 AND 9007199254740991),
  name TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 128),
  sql_hash TEXT NOT NULL CHECK (length(sql_hash) = 64),
  applied_at INTEGER NOT NULL CHECK (applied_at BETWEEN 0 AND 9007199254740991)
) STRICT;
`;

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'create_initial_schema',
    sql: `
CREATE TABLE users (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
  google_id TEXT NOT NULL UNIQUE CHECK (length(google_id) BETWEEN 1 AND 255),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  username TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(username) BETWEEN 3 AND 20),
  crystals INTEGER NOT NULL CHECK (crystals BETWEEN 0 AND 9007199254740991),
  mushrooms INTEGER NOT NULL CHECK (mushrooms BETWEEN 0 AND 9007199254740991),
  souls INTEGER NOT NULL CHECK (souls BETWEEN 0 AND 9007199254740991),
  created_at INTEGER NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991)
) STRICT;

CREATE TABLE player_progress (
  user_id TEXT NOT NULL PRIMARY KEY,
  monster_capacity_level INTEGER NOT NULL
    CHECK (monster_capacity_level BETWEEN 0 AND 9007199254740991),
  egg_capacity_level INTEGER NOT NULL
    CHECK (egg_capacity_level BETWEEN 0 AND 9007199254740991),
  incubation_speed_level INTEGER NOT NULL
    CHECK (incubation_speed_level BETWEEN 0 AND 9007199254740991),
  highest_expedition_difficulty INTEGER NOT NULL
    CHECK (highest_expedition_difficulty BETWEEN 1 AND 4),
  starters_granted_at INTEGER
    CHECK (starters_granted_at BETWEEN 0 AND 9007199254740991),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE TABLE sessions (
  sid TEXT NOT NULL PRIMARY KEY CHECK (length(sid) > 0),
  expires_at INTEGER NOT NULL CHECK (expires_at BETWEEN 0 AND 9007199254740991),
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object')
) STRICT;

CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE monster_species (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 6),
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 64),
  aspect TEXT CHECK (length(aspect) BETWEEN 1 AND 64),
  base_hp INTEGER NOT NULL CHECK (base_hp BETWEEN 1 AND 9007199254740991),
  base_atk INTEGER NOT NULL CHECK (base_atk BETWEEN 0 AND 9007199254740991),
  base_spd INTEGER NOT NULL CHECK (base_spd BETWEEN 0 AND 9007199254740991),
  base_aim INTEGER NOT NULL CHECK (base_aim BETWEEN 0 AND 9007199254740991),
  image_path TEXT NOT NULL CHECK (length(image_path) BETWEEN 1 AND 255)
) STRICT;

CREATE TABLE enemy_species (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 4),
  type TEXT NOT NULL CHECK (length(type) BETWEEN 1 AND 64),
  aspect TEXT CHECK (length(aspect) BETWEEN 1 AND 64),
  base_hp INTEGER NOT NULL CHECK (base_hp BETWEEN 1 AND 9007199254740991),
  base_atk INTEGER NOT NULL CHECK (base_atk BETWEEN 0 AND 9007199254740991),
  base_spd INTEGER NOT NULL CHECK (base_spd BETWEEN 0 AND 9007199254740991),
  base_aim INTEGER NOT NULL CHECK (base_aim BETWEEN 0 AND 9007199254740991),
  image_path TEXT NOT NULL CHECK (length(image_path) BETWEEN 1 AND 255)
) STRICT;

CREATE INDEX enemy_species_difficulty_idx ON enemy_species(difficulty);

CREATE TABLE monsters (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
  user_id TEXT NOT NULL,
  species_id TEXT NOT NULL,
  max_hp INTEGER NOT NULL CHECK (max_hp BETWEEN 1 AND 9007199254740991),
  atk INTEGER NOT NULL CHECK (atk BETWEEN 0 AND 9007199254740991),
  spd INTEGER NOT NULL CHECK (spd BETWEEN 0 AND 9007199254740991),
  aim INTEGER NOT NULL CHECK (aim BETWEEN 0 AND 9007199254740991),
  tired_until INTEGER NOT NULL DEFAULT 0
    CHECK (tired_until BETWEEN 0 AND 9007199254740991),
  created_at INTEGER NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (species_id) REFERENCES monster_species(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX monsters_user_id_idx ON monsters(user_id);
CREATE INDEX monsters_species_id_idx ON monsters(species_id);

CREATE TABLE monster_recipes (
  input_a_species_id TEXT NOT NULL,
  input_b_species_id TEXT NOT NULL,
  result_species_id TEXT NOT NULL,
  PRIMARY KEY (input_a_species_id, input_b_species_id),
  CHECK (input_a_species_id < input_b_species_id),
  FOREIGN KEY (input_a_species_id) REFERENCES monster_species(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (input_b_species_id) REFERENCES monster_species(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (result_species_id) REFERENCES monster_species(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX monster_recipes_input_b_idx ON monster_recipes(input_b_species_id);
CREATE INDEX monster_recipes_result_idx ON monster_recipes(result_species_id);

CREATE TABLE eggs (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) = 36),
  user_id TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
  created_at INTEGER NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991),
  ready_at INTEGER NOT NULL CHECK (ready_at BETWEEN 0 AND 9007199254740991),
  CHECK (ready_at >= created_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) STRICT;

CREATE INDEX eggs_user_id_idx ON eggs(user_id);
`,
  },
  {
    version: 2,
    name: 'add_species_localized_names',
    sql: `
ALTER TABLE monster_species ADD COLUMN name_en TEXT NOT NULL CHECK (length(name_en) > 0);
ALTER TABLE monster_species ADD COLUMN name_es TEXT NOT NULL CHECK (length(name_es) > 0);
ALTER TABLE enemy_species ADD COLUMN name_en TEXT NOT NULL CHECK (length(name_en) > 0);
ALTER TABLE enemy_species ADD COLUMN name_es TEXT NOT NULL CHECK (length(name_es) > 0);
`,
  },
];

type HistoryRow = {
  version: bigint;
  name: string;
  sql_hash: string;
  applied_at: bigint;
};

export function runMigrations(database: Database.Database, definitions: readonly Migration[] = migrations) {
  const names = new Set<string>();
  const prepared = definitions.map((migration, index) => {
    if (
      !Number.isSafeInteger(migration.version)
      || migration.version !== index + 1
      || migration.name.trim().length === 0
      || migration.name.length > 128
      || names.has(migration.name)
      || migration.sql.trim().length === 0
    ) {
      throw new Error('Invalid migration definitions.');
    }

    names.add(migration.name);

    const sql = migration.sql.replace(/\r\n?/g, '\n');
    const hash = createHash('sha256').update(sql).digest('hex');

    return { ...migration, sql, hash };
  });

  const migrate = database.transaction(() => {
    database.exec(historySql);

    // Read exact integers so unsafe history values cannot be rounded by JavaScript.
    const history = database.prepare<[], HistoryRow>(
      'SELECT version, name, sql_hash, applied_at FROM schema_migrations ORDER BY version',
    ).safeIntegers().all();

    for (const [index, row] of history.entries()) {
      const expected = prepared[index];

      if (
        !expected
        || row.version !== BigInt(expected.version)
        || row.name !== expected.name
        || row.sql_hash !== expected.hash
        || typeof row.applied_at !== 'bigint'
        || row.applied_at < 0n
        || row.applied_at > BigInt(Number.MAX_SAFE_INTEGER)
      ) {
        throw new Error('Incompatible migration history.');
      }
    }

    if (history.length === 0) {
      const existingObject = database.prepare(`
        SELECT name FROM sqlite_schema
        WHERE type IN ('table', 'view', 'trigger')
          AND name NOT GLOB 'sqlite_*'
          AND name != 'schema_migrations'
        LIMIT 1
      `).get();

      if (existingObject) {
        throw new Error('Refusing to migrate a database with an unknown existing schema.');
      }
    }

    const record = database.prepare(`
      INSERT INTO schema_migrations (version, name, sql_hash, applied_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const migration of prepared.slice(history.length)) {
      database.exec(migration.sql);
      record.run(migration.version, migration.name, migration.hash, Date.now());
    }
  });

  migrate.immediate();
}
