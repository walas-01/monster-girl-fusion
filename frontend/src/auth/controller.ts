import { AuthError } from './api';
import type { AuthApi, Session } from './api';
import type { TextKey } from '../i18n';

export interface AuthState {
  session: Session | null;
  pending: 'checking' | 'signingIn' | 'signingOut' | 'savingUsername' | null;
  error: TextKey | null;
}

// A small per-view controller owns async sequencing; it stores no Google credential or CSRF token.
export class AuthController {
  private state: AuthState = { session: null, pending: 'checking', error: null };
  private listeners = new Set<() => void>();
  private active = false;
  private operation: AbortController | undefined;
  private api: AuthApi;
  constructor(api: AuthApi) { this.api = api; }

  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(state: AuthState) { this.state = state; this.listeners.forEach((listener) => listener()); }
  activate() { this.active = true; void this.refresh(); }
  deactivate() { this.active = false; this.operation?.abort(); this.operation = undefined; }
  private current(operation: AbortController) { return this.active && this.operation === operation; }

  refresh = async () => {
    if (!this.active || this.operation) return;
    const operation = this.operation = new AbortController();
    this.update({ session: null, pending: 'checking', error: null });
    try {
      const session = await this.api.session(operation.signal);
      if (this.current(operation)) this.update({ session, pending: null, error: null });
    } catch {
      if (this.current(operation)) this.update({ session: null, pending: null, error: 'unavailable' });
    } finally { if (this.operation === operation) this.operation = undefined; }
  };

  login = (credential: string) => this.mutate('signingIn', credential);
  logout = () => this.mutate('signingOut');
  setUsername = (username: string) => this.mutate('savingUsername', username);

  private async mutate(kind: 'signingIn' | 'signingOut' | 'savingUsername', value?: string) {
    if (!this.active || this.operation || !this.state.session
      || this.state.session.authenticated !== (kind !== 'signingIn')
      || (kind === 'savingUsername' && this.state.session.authenticated && !this.state.session.requiresOnboarding)) return;
    const operation = this.operation = new AbortController();
    this.update({ ...this.state, pending: kind, error: null });
    try {
      const token = await this.api.csrf(operation.signal);
      if (!this.current(operation)) return;
      const session = kind === 'signingIn'
        ? await this.api.login(value!, token, operation.signal)
        : kind === 'savingUsername' ? await this.api.setUsername(value!, token, operation.signal)
          : (await this.api.logout(token, operation.signal), { authenticated: false } as const);
      if (this.current(operation)) this.update({ session, pending: null, error: null });
    } catch (error) {
      if (!this.current(operation)) return;
      // Even a failed/aborted HTTP response may follow a committed server mutation. Never replay it.
      this.update({ session: null, pending: 'checking', error: null });
      try {
        const session = await this.api.session(operation.signal);
        if (this.current(operation)) this.update({ session, pending: null,
          error: kind === 'savingUsername' && session.authenticated && !session.requiresOnboarding
            ? null : error instanceof AuthError ? error.key : 'generic' });
      } catch {
        if (this.current(operation)) this.update({ session: null, pending: null, error: 'unavailable' });
      }
    } finally { if (this.operation === operation) this.operation = undefined; }
  }
}
