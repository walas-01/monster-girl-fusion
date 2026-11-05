import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isIP } from 'node:net';

export interface Config {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  databasePath: string;
  googleClientId: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  appOrigin: string;
  trustProxyCidrs: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv, backendDirectory: string): Config {
  const port = env.PORT ?? '3000';
  if (port === '' || /[^0-9]/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT must be a decimal integer from 1 through 65535.');
  }

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  const databasePath = env.DATABASE_PATH ?? (nodeEnv === 'production' ? '' : 'data/game.sqlite');
  const uriOrDrive = /^[a-z][a-z0-9+.-]*:/i.test(databasePath);
  const nativeAbsoluteDrive = /^[a-z]:[\\/]/i.test(databasePath) && isAbsolute(databasePath);
  if (!databasePath || databasePath.trim() !== databasePath || databasePath.includes('\0')
    || databasePath === ':memory:' || (uriOrDrive && !nativeAbsoluteDrive)
    || (nodeEnv === 'production' && !isAbsolute(databasePath))) {
    throw new Error('DATABASE_PATH must be a nonempty filesystem path, absolute in production; memory databases and URLs are not allowed.');
  }

  const resolvedPath = resolve(backendDirectory, databasePath);
  for (const directory of ['src', 'dist']) {
    const child = relative(resolve(backendDirectory, directory), resolvedPath);
    if (child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))) {
      throw new Error('DATABASE_PATH must be outside the backend source and build directories.');
    }
  }

  const googleClientId = env.GOOGLE_CLIENT_ID ?? '';
  if (googleClientId.trim() !== googleClientId || googleClientId.length > 256
    || !/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
    throw new Error('GOOGLE_CLIENT_ID must be a Google web client ID.');
  }
  const sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length !== 64 || /[^a-fA-F0-9]/.test(sessionSecret)) {
    throw new Error('SESSION_SECRET must be 64 hexadecimal characters generated from 32 random bytes.');
  }
  const ttl = env.SESSION_TTL_SECONDS ?? '604800';
  if (!ttl || /[^0-9]/.test(ttl) || Number(ttl) < 60 || Number(ttl) > 2592000) {
    throw new Error('SESSION_TTL_SECONDS must be an integer from 60 through 2592000.');
  }
  const origin = env.APP_ORIGIN ?? (nodeEnv === 'production' ? '' : 'http://localhost:5173');
  let appOrigin: string;
  try {
    const url = new URL(origin);
    if (origin.trim() !== origin || !['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || origin.includes('?') || origin.includes('#') || url.pathname !== '/'
      || (nodeEnv === 'production' && url.protocol !== 'https:')) throw new Error();
    appOrigin = url.origin;
  } catch {
    throw new Error('APP_ORIGIN must be an HTTP origin without credentials, path, query, or fragment; HTTPS is required in production.');
  }
  const proxy = env.TRUST_PROXY_CIDRS ?? '';
  const trustProxyCidrs = proxy === '' ? [] : proxy.split(',').map((entry) => entry.trim());
  for (const entry of trustProxyCidrs) {
    const [address, prefix, extra] = entry.split('/');
    const family = isIP(address ?? '');
    if (!family || extra !== undefined || (prefix !== undefined
      && (!/^[0-9]+$/.test(prefix) || prefix.trim() !== prefix || Number(prefix) < 1
        || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY_CIDRS must contain only explicit IP addresses or CIDRs, not aliases, hop counts, or /0 ranges.');
    }
  }

  return { port: Number(port), nodeEnv, databasePath: resolvedPath, googleClientId, sessionSecret,
    sessionTtlSeconds: Number(ttl), appOrigin, trustProxyCidrs };
}
