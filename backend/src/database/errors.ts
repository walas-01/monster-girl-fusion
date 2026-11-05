const messages = {
  DATABASE_STORAGE_ERROR: 'Database storage is unavailable. Check the configured file, parent directory, and permissions.',
  DATABASE_OPEN_ERROR: 'Unable to open the configured SQLite database. Check the file and driver installation.',
  DATABASE_SETUP_ERROR: 'Unable to configure the SQLite database. Check file integrity, locking, and WAL support.',
  DATABASE_CLOSE_ERROR: 'Unable to close the SQLite database cleanly.',
  MIGRATION_CATALOG_ERROR: 'The application migration catalog is invalid.',
  MIGRATION_HISTORY_ERROR: 'Database migration history or bookkeeping schema is incompatible with this application.',
  MIGRATION_FAILED: 'A database migration failed and was not marked complete.',
} as const;

export class PersistenceError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(`${code}: ${messages[code]}`);
    this.name = 'PersistenceError';
  }
}
