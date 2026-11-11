import express from 'express';
import type { NextFunction, Request, Response } from 'express'; // importes para tipos de TypeScript

export function handleError(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.error('Unhandled request error.');

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error.',
    },
  });
}




export function createApp() {
  const app = express();

  app.disable('x-powered-by'); // remueve cabezera que anuncia que uso Express

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
      },
    });
  });

  app.use(handleError);

  return app;
}
