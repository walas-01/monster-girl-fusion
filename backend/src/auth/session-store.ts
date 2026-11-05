import session from 'express-session';
import type Database from 'better-sqlite3';
import { ApiError } from '../middleware/api-error.js';

type Callback<T = void> = (error: Error | null, result?: T) => void;

function validSession(value: unknown, expiry?: number): value is session.SessionData & { expiresAt: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as session.SessionData;
  if (Object.keys(data).some((key) => !['cookie', 'csrfToken', 'expiresAt', 'userId'].includes(key))) return false;
  return Number.isSafeInteger(data.expiresAt) && data.expiresAt! > 0
    && (expiry === undefined || expiry === data.expiresAt)
    && typeof data.csrfToken === 'string' && data.csrfToken.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(data.csrfToken)
    && (data.userId === undefined || (typeof data.userId === 'string' && data.userId.length === 36))
    && !!data.cookie && data.cookie.path === '/api' && data.cookie.httpOnly === true
    && data.cookie.sameSite === 'lax' && typeof data.cookie.secure === 'boolean'
    && data.cookie.domain === undefined
    && new Date(data.cookie.expires as unknown as string).getTime() === data.expiresAt;
}

export class SQLiteSessionStore extends session.Store {
  private disposed = false;
  private readonly timer: NodeJS.Timeout;

  constructor(readonly database: Database.Database, cleanupIntervalMs = 15 * 60_000) {
    super();
    this.purgeExpired();
    this.timer = setInterval(() => {
      try { this.purgeExpired(); } catch { console.error('SESSION_CLEANUP_ERROR: Expired-session cleanup failed.'); }
    }, cleanupIntervalMs);
    this.timer.unref();
  }

  private perform<T>(operation: () => T, callback: Callback<T>) {
    let result: T;
    try {
      if (this.disposed) throw new Error();
      result = operation();
    } catch {
      callback(new ApiError('SESSION_UNAVAILABLE'));
      return;
    }
    // Never catch a consumer callback exception and invoke that callback a second time.
    callback(null, result);
  }

  get(sid: string, callback: Callback<session.SessionData | undefined>) {
    this.perform(() => {
      const row = this.database.prepare<[string], { expires_at: number; data: string }>(
        'SELECT expires_at, data FROM sessions WHERE sid = ?',
      ).get(sid);
      if (!row || row.expires_at <= Date.now()) return undefined;
      const value: unknown = JSON.parse(row.data);
      if (!validSession(value, row.expires_at)) throw new Error();
      return value;
    }, callback);
  }

  set(sid: string, value: session.SessionData, callback: Callback = () => {}) {
    this.perform(() => {
      const data = JSON.stringify(value);
      const parsed: unknown = JSON.parse(data);
      if (!validSession(parsed) || parsed.expiresAt <= Date.now()) throw new Error();
      this.database.prepare(`INSERT INTO sessions (sid, expires_at, data) VALUES (?, ?, ?)
        ON CONFLICT (sid) DO UPDATE SET expires_at = excluded.expires_at, data = excluded.data`)
        .run(sid, parsed.expiresAt, data);
    }, callback);
  }

  destroy(sid: string, callback: Callback = () => {}) {
    this.perform(() => { this.database.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); }, callback);
  }

  touch(_sid: string, _value: session.SessionData, callback: Callback = () => {}) {
    this.perform(() => {}, callback);
  }

  private purgeExpired() {
    this.database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
  }
}
