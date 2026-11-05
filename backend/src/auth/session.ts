import session from 'express-session';
import type { Request, Response } from 'express';
import type { Config } from '../config.js';
import { ApiError } from '../middleware/api-error.js';
import type { SQLiteSessionStore } from './session-store.js';

export const sessionCookieName = 'mgf.sid';

export function cookieOptions(config: Pick<Config, 'nodeEnv'>) {
  return { path: '/api', httpOnly: true, sameSite: 'lax' as const, secure: config.nodeEnv === 'production' };
}

export function clearSessionCookie(res: Response, config: Pick<Config, 'nodeEnv'>) {
  res.clearCookie(sessionCookieName, cookieOptions(config));
}

export function applyAbsoluteExpiry(value: session.Session & Partial<session.SessionData>, config: Pick<Config, 'nodeEnv'>) {
  Object.assign(value.cookie, cookieOptions(config));
  if (value.expiresAt === undefined) return;
  value.cookie.expires = new Date(value.expiresAt);
  // Express calls touch() before writing a cookie. Pin this instance's expiry instead of sliding it.
  Object.defineProperty(value, 'touch', { configurable: true, enumerable: false, value() {
    value.cookie.expires = new Date(value.expiresAt!);
    return value;
  } });
}

export function createSessionMiddleware(config: Config, store: SQLiteSessionStore) {
  return session({ name: sessionCookieName, secret: config.sessionSecret, store,
    saveUninitialized: false, resave: false, rolling: false, cookie: cookieOptions(config) });
}

export function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => error ? reject(new ApiError('SESSION_UNAVAILABLE')) : resolve());
  });
}

export function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(new ApiError('SESSION_UNAVAILABLE')) : resolve());
  });
}

export function destroySession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    if (!req.session) { resolve(); return; }
    req.session.destroy((error) => error ? reject(new ApiError('SESSION_UNAVAILABLE')) : resolve());
  });
}
