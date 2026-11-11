import { startServer } from './server.ts';

try {
  await startServer();
} catch (error) {
  if (error instanceof Error) {
    console.error(`Unable to start HTTP server: ${error.message}`);
  } else {
    console.error('Unable to start HTTP server.');
  }

  process.exitCode = 1;
}
