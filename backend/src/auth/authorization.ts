import type { Request, Response, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import type { Config } from '../config.js';
import { ApiError } from '../middleware/api-error.js';
import { findUser } from './users.js';
import { clearSessionCookie, destroySession } from './session.js';

export async function currentAccount(req: Request, res: Response, db: Database.Database, config: Config) {
  if (!req.session?.userId) return undefined;
  const account = req.session.expiresAt && req.session.expiresAt > Date.now() ? findUser(db, req.session.userId) : undefined;
  if (!account) {
    clearSessionCookie(res, config);
    await destroySession(req);
  }
  return account;
}

export function requireAuthenticated(db: Database.Database, config: Config): RequestHandler {
  return async (req, res, next) => {
    const account = await currentAccount(req, res, db, config);
    if (!account) throw new ApiError('AUTH_REQUIRED');
    req.account = account;
    next();
  };
}

// This guards username completion only, not future starter grants or game-entry eligibility.
export function requireOnboarded(db: Database.Database, config: Config): RequestHandler {
  return async (req, res, next) => {
    const account = await currentAccount(req, res, db, config);
    if (!account) throw new ApiError('AUTH_REQUIRED');
    if (account.username === null) throw new ApiError('ONBOARDING_REQUIRED');
    req.account = account;
    next();
  };
}
