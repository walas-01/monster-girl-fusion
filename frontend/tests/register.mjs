import { register } from 'tsx/esm/api';
import { fileURLToPath } from 'node:url';

// Select the application JSX transform explicitly instead of the solution-only tsconfig.
register({ tsconfig: fileURLToPath(new URL('../tsconfig.app.json', import.meta.url)) });
