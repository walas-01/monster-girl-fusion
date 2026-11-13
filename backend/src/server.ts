import { once } from 'node:events';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createApp } from './app.ts';
import { openDatabase } from './database.ts';
import { runMigrations } from './migrations.ts';

export function readPort(value: string | undefined) { // verifica que puerto sea un numero apropiado
  if (value === undefined) {
    return 3000;
  }

  const port = Number(value);

  if (!/^\d+$/.test(value) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
}


export function registerShutdown(server: Server, timeoutMs = 10_000, closeDatabase?: () => void) { //apagado ordenado
  let shutdownPromise: Promise<void> | undefined;

  function shutdown() {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = new Promise<void>((resolve, reject) => {
      let finished = false;
      let timeoutError: Error | undefined;

      const deadline = setTimeout(() => {
        timeoutError = new Error('Server shutdown exceeded its time limit.');
        server.closeAllConnections();
      }, timeoutMs);

      function finish(error?: Error) {
        if (finished) {
          return;
        }

        finished = true;
        clearTimeout(deadline);
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);

        try {
          closeDatabase?.();
        } catch (closeError) {
          if (error) {
            reject(new AggregateError([error, closeError], 'HTTP and database shutdown failed.'));
          } else {
            reject(closeError);
          }

          return;
        }

        if (error) {
          reject(error);
          return;
        }

        resolve();
      }

      server.close((error) => {
        finish(timeoutError ?? error);
      });
    });

    return shutdownPromise;
  }

  async function onSignal() {
    if (shutdownPromise) {
      return;
    }

    console.log('Shutting down HTTP server.');

    try {
      await shutdown();
      console.log('HTTP server stopped.');
    } catch {
      console.error('HTTP server shutdown failed or exceeded its time limit.');
      process.exitCode = 1;
    }
  }

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  return shutdown;
}





export async function startServer() {
  const port = readPort(process.env.PORT);
  const database = openDatabase(process.env.DATABASE_PATH, process.env.NODE_ENV);
  let server: Server;

  try {
    runMigrations(database);
    server = createServer(createApp());
    server.listen(port);
    await once(server, 'listening');
  } catch (error) {
    try {
      database.close();
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'Server startup and database cleanup failed.');
    }

    throw error;
  }

  const shutdown = registerShutdown(server, undefined, () => {
    database.close();
  });

  console.log(`[PORT:${port}]: server is up and listening `);

  return { server, shutdown };
}
