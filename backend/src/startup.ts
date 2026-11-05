import { createServer } from 'node:http';
import { createApp } from './app.js';
import type { Config } from './config.js';
import { closeDatabase } from './database/connection.js';
import { initializeDatabase } from './database/initialize.js';
import { migrationCatalog } from './database/migration-catalog.js';
import type { Migration } from './database/migrations.js';
import { installLifecycle } from './lifecycle.js';
import { SQLiteSessionStore } from './auth/session-store.js';
import { createAuthRouter } from './auth/routes.js';
import { createGoogleVerifier } from './auth/google.js';
import type { GoogleVerifier } from './auth/google.js';

export function startService(config: Config, catalog: readonly Migration[] = migrationCatalog,
  verifyGoogle: GoogleVerifier = createGoogleVerifier(config)) {
  const database = initializeDatabase(config, catalog);
  let server: ReturnType<typeof createServer>;
  let store: SQLiteSessionStore | undefined;
  const cleanup = () => {
    try { store?.dispose(); } finally { closeDatabase(database); }
  };
  try {
    store = new SQLiteSessionStore(database);
    server = createServer(createApp(config.nodeEnv, createAuthRouter(config, database, store, verifyGoogle),
      { trustProxyCidrs: config.trustProxyCidrs }));
  } catch {
    cleanup();
    throw new Error('STARTUP_ERROR: Unable to construct the HTTP service.');
  }

  const shutdown = installLifecycle(server, { cleanup });
  try {
    server.listen(config.port, '0.0.0.0', () => {
      console.info(`LISTENING: HTTP server accepting requests on port ${config.port}.`);
    });
  } catch {
    console.error('SERVER_ERROR: Unable to start the HTTP listener.');
    shutdown(1);
  }

  return { server, database, store, shutdown };
}
