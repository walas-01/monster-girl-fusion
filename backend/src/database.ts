import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const backendDirectory = fileURLToPath(new URL('../', import.meta.url));

function isInsideDirectory(path: string, directory: string) {
  const relativePath = relative(directory, path);

  return relativePath === '' || (
    !isAbsolute(relativePath)
    && relativePath !== '..'
    && !relativePath.startsWith(`..${sep}`)
  );
}

function checkStorageLocation(path: string) {
  for (const name of ['src', 'dist', 'node_modules']) {
    const directory = join(backendDirectory, name);

    if (isInsideDirectory(path, directory)) {
      throw new Error('DATABASE_PATH must be outside src, dist, and node_modules.');
    }
  }
}

export function resolveDatabasePath(value: string | undefined, nodeEnv: string | undefined) {
  if (value === undefined) {
    if (nodeEnv === 'production') {
      throw new Error('DATABASE_PATH must be explicitly configured in production.');
    }

    return join(backendDirectory, 'data', 'game.sqlite');
  }

  if (value === '' || value !== value.trim() || value === ':memory:') {
    throw new Error('DATABASE_PATH must be a nonempty file path without surrounding whitespace.');
  }

  if (nodeEnv === 'production' && !isAbsolute(value)) {
    throw new Error('DATABASE_PATH must be absolute in production.');
  }

  const databasePath = resolve(backendDirectory, value);

  checkStorageLocation(databasePath);

  return databasePath;
}

export function openDatabase(value: string | undefined, nodeEnv: string | undefined) {
  const databasePath = resolveDatabasePath(value, nodeEnv);
  let database: Database.Database | undefined;

  try {
    if (value === undefined) {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    database = new Database(databasePath, { timeout: 1000 }); // aqui se crea la base de datos usando el PATH

    database.pragma('foreign_keys = ON');
    const journalMode = database.pragma('journal_mode = WAL', { simple: true });
    database.pragma('synchronous = FULL');

    const foreignKeys = database.pragma('foreign_keys', { simple: true });
    const synchronous = database.pragma('synchronous', { simple: true });
    const busyTimeout = database.pragma('busy_timeout', { simple: true });

    if (journalMode !== 'wal' || foreignKeys !== 1 || synchronous !== 2 || busyTimeout !== 1000) {
      throw new Error('Required SQLite connection settings could not be enabled.');
    }

    return database; // returna base de datos
  } catch (error) {
    try {
      if (database?.open) {
        database.close();
      }
    } finally {
      throw new Error('Unable to open or configure SQLite database.', { cause: error });
    }
  }
}
