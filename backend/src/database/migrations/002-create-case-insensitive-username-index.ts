import type { Migration } from '../migrations.js';

export const createCaseInsensitiveUsernameIndex: Migration = {
  version: 2,
  name: 'create_case_insensitive_username_index',
  sql: `CREATE UNIQUE INDEX users_username_nocase_idx
ON users (username COLLATE NOCASE)
WHERE username IS NOT NULL;`,
};
