import type { Migration } from '../migrations.js';

export const createAuthenticationTables: Migration = {
  version: 1,
  name: 'create_authentication_tables',
  sql: `CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) = 36),
    google_id TEXT NOT NULL UNIQUE CHECK (length(google_id) BETWEEN 1 AND 255),
    email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
    username TEXT UNIQUE CHECK (username IS NULL OR length(username) > 0),
    created_at INTEGER NOT NULL CHECK (created_at >= 0)
  ) STRICT;

  CREATE TABLE sessions (
    sid TEXT PRIMARY KEY NOT NULL CHECK (length(sid) > 0),
    expires_at INTEGER NOT NULL CHECK (expires_at >= 0),
    data TEXT NOT NULL CHECK (json_valid(data))
  ) STRICT;

  CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);`,
};
