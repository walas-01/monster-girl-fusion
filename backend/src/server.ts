import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { PersistenceError } from './database/errors.js';
import { startService } from './startup.js';
import type { Config } from './config.js';

let config: Config;
try {
  config = loadConfig(process.env, fileURLToPath(new URL('../', import.meta.url)));
} catch (error) {
  // loadConfig only produces fixed diagnostics, never configuration values.
  console.error(`CONFIG_ERROR: ${(error as Error).message}`);
  process.exit(1);
}

try {
  startService(config);
} catch (error) {
  console.error(error instanceof PersistenceError ? error.message : 'STARTUP_ERROR: Unable to initialize the service.');
  process.exit(1);
}
