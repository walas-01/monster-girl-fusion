import type { IncomingMessage, Server, ServerResponse } from 'node:http';

interface LifecycleOptions {
  timeoutMs?: number;
  exit?: (code: number) => void;
  cleanup?: () => void | Promise<void>;
}

export function installLifecycle(server: Server, options: LifecycleOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let shuttingDown = false;
  let finished = false;
  let exitCode = 0;
  let timer: NodeJS.Timeout | undefined;
  let cleanupStarted = false;
  let forced = false;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    process.off('uncaughtException', onException);
    process.off('unhandledRejection', onRejection);
    server.off('error', onServerError);
    server.off('request', onRequest);
    console.info(forced ? 'SHUTDOWN_FORCED' : exitCode === 0 ? 'SHUTDOWN_COMPLETE' : 'SHUTDOWN_FAILED');
    exit(exitCode);
  }

  function cleanup() {
    if (cleanupStarted || finished) return;
    cleanupStarted = true;
    function failed() {
      if (finished) return;
      exitCode = 1;
      console.error('CLEANUP_ERROR: Unable to release service resources cleanly.');
      finish();
    }
    try {
      const result = options.cleanup?.();
      void Promise.resolve(result).then(finish, failed);
    } catch {
      failed();
    }
  }

  function shutdown(code = 0) {
    if (finished) return;
    if (code !== 0) exitCode = 1;
    if (shuttingDown) return;
    shuttingDown = true;
    console.info('SHUTDOWN_STARTED');

    timer = setTimeout(() => {
      exitCode = 1;
      forced = true;
      console.error('SHUTDOWN_TIMEOUT: HTTP draining or resource cleanup exceeded the shutdown deadline.');
      server.closeAllConnections();
      cleanup();
      finish();
    }, timeoutMs);

    server.close((error) => {
      if (error) exitCode = 1;
      cleanup();
    });
  }

  function onSignal() {
    shutdown();
  }

  function onRequest(_req: IncomingMessage, res: ServerResponse) {
    res.once('finish', () => {
      if (!shuttingDown || finished) return;
      // Let Node mark the just-finished connection idle before reaping it.
      setImmediate(() => { if (!finished) server.closeIdleConnections(); });
    });
  }

  function onException() {
    console.error('UNCAUGHT_EXCEPTION: Terminating the service.');
    shutdown(1);
  }

  function onRejection() {
    console.error('UNHANDLED_REJECTION: Terminating the service.');
    shutdown(1);
  }

  function onServerError(error: NodeJS.ErrnoException) {
    const reason = error.code === 'EADDRINUSE'
      ? 'EADDRINUSE: Configured port is already in use.'
      : error.code === 'EACCES'
        ? 'EACCES: Permission denied for the configured port.'
        : 'Unable to operate the HTTP server.';
    console.error(`SERVER_ERROR: ${reason}`);
    shutdown(1);
  }

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('uncaughtException', onException);
  process.on('unhandledRejection', onRejection);
  server.on('error', onServerError);
  server.prependListener('request', onRequest);

  return shutdown;
}
