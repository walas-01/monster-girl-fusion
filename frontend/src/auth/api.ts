import type { TextKey } from '../i18n';

export type Session = { authenticated: false } | {
  authenticated: true;
  user: { id: string; username: string | null };
  requiresOnboarding: boolean;
};

export class AuthError extends Error {
  readonly key: TextKey;
  constructor(code: string) {
    super('Authentication request failed.');
    const messages: Record<string, TextKey> = {
      CSRF_INVALID: 'security', AUTH_REQUIRED: 'security', INVALID_GOOGLE_TOKEN: 'credential',
      AUTH_UNAVAILABLE: 'service', SESSION_UNAVAILABLE: 'service', NETWORK: 'network',
      INVALID_USERNAME: 'usernameInvalid', USERNAME_TAKEN: 'usernameTaken',
      USERNAME_ALREADY_SET: 'usernameAlreadySet', USERNAME_UNAVAILABLE: 'usernameUnavailable',
    };
    this.key = messages[code] ?? 'generic';
  }
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function parseSession(value: unknown): Session {
  if (object(value) && value.authenticated === false) return { authenticated: false };
  if (object(value) && value.authenticated === true && object(value.user)
    && typeof value.user.id === 'string' && value.user.id.length === 36 && /^[0-9a-f-]{36}$/i.test(value.user.id)
    && (value.user.username === null || (typeof value.user.username === 'string' && value.user.username.length > 0))
    && typeof value.requiresOnboarding === 'boolean' && value.requiresOnboarding === (value.user.username === null)) {
    return { authenticated: true, user: { id: value.user.id, username: value.user.username },
      requiresOnboarding: value.requiresOnboarding };
  }
  throw new AuthError('INVALID_RESPONSE');
}

export interface AuthApi {
  session(signal: AbortSignal): Promise<Session>;
  csrf(signal: AbortSignal): Promise<string>;
  login(credential: string, token: string, signal: AbortSignal): Promise<Session>;
  logout(token: string, signal: AbortSignal): Promise<void>;
  setUsername(username: string, token: string, signal: AbortSignal): Promise<Session>;
}

export function createAuthApi(fetcher: typeof fetch = globalThis.fetch, timeoutMs = 10_000): AuthApi {
  async function request(path: string, signal: AbortSignal, body?: { credential: string } | { username: string }, token?: string) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    try {
      const response = await fetcher(`/api/auth/${path}`, {
        method: token === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
        signal: AbortSignal.any([signal, timeout.signal]),
        headers: token === undefined ? undefined : { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        let code = 'UNKNOWN';
        try {
          const value: unknown = await response.json();
          if (object(value) && object(value.error) && typeof value.error.code === 'string') code = value.error.code;
        } catch { /* Never surface raw HTML, proxy diagnostics, or server error text. */ }
        throw new AuthError(code);
      }
      if (path === 'logout') {
        if (response.status !== 204) throw new AuthError('INVALID_RESPONSE');
        return undefined;
      }
      if (response.status !== 200) throw new AuthError('INVALID_RESPONSE');
      return await response.json() as unknown;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw new AuthError('NETWORK');
    } finally { clearTimeout(timer); }
  }
  return {
    session: async (signal) => parseSession(await request('session', signal)),
    csrf: async (signal) => {
      const value = await request('csrf', signal);
      if (!object(value) || typeof value.csrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.csrfToken)
        || value.csrfToken.length !== 43) throw new AuthError('INVALID_RESPONSE');
      return value.csrfToken;
    },
    login: async (credential, token, signal) => {
      const session = parseSession(await request('google', signal, { credential }, token));
      if (!session.authenticated) throw new AuthError('INVALID_RESPONSE');
      return session;
    },
    logout: async (token, signal) => { await request('logout', signal, undefined, token); },
    setUsername: async (username, token, signal) => {
      const session = parseSession(await request('username', signal, { username }, token));
      if (!session.authenticated || session.user.username === null || session.requiresOnboarding) throw new AuthError('INVALID_RESPONSE');
      return session;
    },
  };
}

export const authApi = createAuthApi();
