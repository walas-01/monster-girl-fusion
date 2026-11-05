import type { ErrorRequestHandler } from 'express';
import { ApiError } from './api-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  let expected = error instanceof ApiError ? error : undefined;
  if (!expected && error && typeof error === 'object' && 'type' in error) {
    if (error.type === 'entity.parse.failed') expected = new ApiError('INVALID_JSON');
    if (error.type === 'entity.too.large') expected = new ApiError('BODY_TOO_LARGE');
    if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') expected = new ApiError('UNSUPPORTED_MEDIA_TYPE');
  }
  if (!expected || expected.status >= 500) console.error(`REQUEST_ERROR: ${expected?.code ?? 'INTERNAL_ERROR'}`);

  if (res.headersSent) {
    // The final handler must not receive the original error's message or stack.
    next({ status: 500, message: 'An unexpected error occurred.' });
    return;
  }

  if (expected) {
    res.status(expected.status).json({ error: { code: expected.code, message: expected.message } });
    return;
  }
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
};
