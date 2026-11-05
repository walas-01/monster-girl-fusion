import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Config } from '../config.js';
import { ApiError } from '../middleware/api-error.js';

export const newCsrfToken = () => randomBytes(32).toString('base64url');

export function authRequestSecurity(config: Config): RequestHandler {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (config.nodeEnv === 'production' && !req.secure) { next(new ApiError('HTTPS_REQUIRED')); return; }
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site' || (origin !== undefined && origin !== config.appOrigin)
      || (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin !== config.appOrigin)) {
      next(new ApiError('CSRF_INVALID')); return;
    }
    next();
  };
}

export const requireCsrf: RequestHandler = (req, _res, next) => {
  const expected = req.session?.csrfToken;
  const provided = req.get('x-csrf-token');
  if (typeof expected !== 'string' || expected.length !== 43 || provided?.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(provided)
    || !req.session.expiresAt || req.session.expiresAt <= Date.now()
    || !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
    next(new ApiError('CSRF_INVALID')); return;
  }
  next();
};
