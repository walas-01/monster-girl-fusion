import type { Migration } from './migrations.js';
import { createAuthenticationTables } from './migrations/001-create-authentication-tables.js';
import { createCaseInsensitiveUsernameIndex } from './migrations/002-create-case-insensitive-username-index.js';

export const migrationCatalog: readonly Migration[] = [createAuthenticationTables, createCaseInsensitiveUsernameIndex];
