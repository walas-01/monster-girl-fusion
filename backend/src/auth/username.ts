import type Database from 'better-sqlite3';
import { ApiError } from '../middleware/api-error.js';
import type { User } from './users.js';

export function normalizeUsername(value: string): string {
  const username = value.trim();
  if (value.length > 256 || username.length < 3 || username.length > 20
    || /[^A-Za-z0-9_]/.test(username) || !/[A-Za-z0-9]/.test(username)) {
    throw new ApiError('INVALID_USERNAME');
  }
  return username;
}

export function setUsername(db: Database.Database, userId: string, value: string): User {
  const username = normalizeUsername(value);
  try {
    return db.transaction(() => {
      const user = db.prepare<[string], User>('SELECT id, username FROM users WHERE id = ?').get(userId);
      if (!user) throw new ApiError('AUTH_REQUIRED');
      if (user.username !== null) {
        if (user.username.toLowerCase() === username.toLowerCase()) return user;
        throw new ApiError('USERNAME_ALREADY_SET');
      }
      const updated = db.prepare<[string, string], User>(
        'UPDATE users SET username = ? WHERE id = ? AND username IS NULL RETURNING id, username',
      ).get(username, userId);
      if (!updated) throw new ApiError('USERNAME_UNAVAILABLE');
      return updated;
    }).immediate();
  } catch (error) {
    // Classify only after rollback; never leak driver messages or match their text.
    if (error instanceof ApiError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ApiError('USERNAME_TAKEN');
    }
    throw new ApiError('USERNAME_UNAVAILABLE');
  }
}
