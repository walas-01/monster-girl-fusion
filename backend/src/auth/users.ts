import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ApiError } from '../middleware/api-error.js';

export interface VerifiedIdentity { subject: string; email: string; }
export interface User { id: string; username: string | null; }

export function findUser(db: Database.Database, id: string): User | undefined {
  try {
    return db.prepare<[string], User>('SELECT id, username FROM users WHERE id = ?').get(id);
  } catch { throw new ApiError('AUTH_UNAVAILABLE'); }
}

export function findOrCreateUser(db: Database.Database, identity: VerifiedIdentity): User {
  try {
    return db.transaction(() => db.prepare<[string, string, string, number], User>(`
      INSERT INTO users (id, google_id, email, username, created_at) VALUES (?, ?, ?, NULL, ?)
      ON CONFLICT (google_id) DO UPDATE SET email = excluded.email
      RETURNING id, username
    `).get(randomUUID(), identity.subject, identity.email, Date.now())!).immediate();
  } catch { throw new ApiError('AUTH_UNAVAILABLE'); }
}
