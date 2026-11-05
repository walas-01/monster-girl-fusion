import express, { Router } from 'express';
import type Database from 'better-sqlite3';
import type { Config } from '../config.js';
import { ApiError } from '../middleware/api-error.js';
import type { GoogleVerifier } from './google.js';
import { authRequestSecurity, newCsrfToken, requireCsrf } from './csrf.js';
import { currentAccount, requireAuthenticated } from './authorization.js';
import { setUsername } from './username.js';
import { findOrCreateUser } from './users.js';
import { applyAbsoluteExpiry, clearSessionCookie, createSessionMiddleware,
  destroySession, regenerateSession, saveSession } from './session.js';
import type { SQLiteSessionStore } from './session-store.js';

export function createAuthRouter(config: Config, database: Database.Database, store: SQLiteSessionStore,
  verifyGoogle: GoogleVerifier) {
  const routes = Router();
  const auth = Router();
  auth.use(authRequestSecurity(config), createSessionMiddleware(config, store));
  auth.use((req, _res, next) => { applyAbsoluteExpiry(req.session, config); next(); });

  auth.get('/csrf', async (req, res) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = newCsrfToken();
      req.session.expiresAt = Date.now() + 15 * 60_000;
      applyAbsoluteExpiry(req.session, config);
      try { await saveSession(req); } catch (error) {
        clearSessionCookie(res, config);
        try { await destroySession(req); } catch { /* The response still fails closed. */ }
        throw error;
      }
    }
    res.json({ csrfToken: req.session.csrfToken });
  });

  auth.post('/google', requireCsrf, (req, _res, next) => {
    if (req.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      next(new ApiError('UNSUPPORTED_MEDIA_TYPE')); return;
    }
    next();
  }, express.json({ limit: '16kb', strict: true }), async (req, res) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
      || !('credential' in body) || typeof body.credential !== 'string' || body.credential.length > 8192
      || body.credential.trim() !== body.credential || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.credential)) {
      throw new ApiError('INVALID_REQUEST');
    }
    const identity = await verifyGoogle(body.credential);
    const user = findOrCreateUser(database, identity);
    try {
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.csrfToken = newCsrfToken();
      req.session.expiresAt = Date.now() + config.sessionTtlSeconds * 1000;
      applyAbsoluteExpiry(req.session, config);
      await saveSession(req);
    } catch (error) {
      clearSessionCookie(res, config);
      try { await destroySession(req); } catch { /* Do not expose a partial session on failure. */ }
      throw error;
    }
    res.json({ authenticated: true, user, requiresOnboarding: user.username === null, csrfToken: req.session.csrfToken });
  });

  auth.get('/session', async (req, res) => {
    const user = await currentAccount(req, res, database, config);
    res.json(user ? { authenticated: true, user, requiresOnboarding: user.username === null } : { authenticated: false });
  });

  auth.post('/username', requireAuthenticated(database, config), requireCsrf, (req, _res, next) => {
    if (req.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      next(new ApiError('UNSUPPORTED_MEDIA_TYPE')); return;
    }
    next();
  }, express.json({ limit: '2kb', strict: true }), (req, res) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
      || !('username' in body) || typeof body.username !== 'string') throw new ApiError('INVALID_REQUEST');
    const user = setUsername(database, req.account!.id, body.username);
    res.json({ authenticated: true, user, requiresOnboarding: false });
  });

  auth.post('/logout', requireCsrf, async (req, res) => {
    await destroySession(req);
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  routes.use('/api/auth', auth);
  return routes;
}
