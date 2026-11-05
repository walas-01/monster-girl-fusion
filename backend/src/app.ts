import express, { Router } from 'express';
import { errorHandler } from './middleware/error-handler.js';
import type { Config } from './config.js';

export function createApp(nodeEnv: Config['nodeEnv'], routes = Router(), options: { trustProxyCidrs?: string[] } = {}) {
  const app = express();
  app.set('env', nodeEnv);
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxyCidrs?.length ? options.trustProxyCidrs : false);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use(routes);
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });
  app.use(errorHandler);

  return app;
}
