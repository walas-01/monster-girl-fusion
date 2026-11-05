import type { Language } from '../i18n';

export interface GoogleId {
  initialize(options: { client_id: string; callback: (response: { credential: string }) => void;
    auto_select: false; ux_mode: 'popup' }): void;
  renderButton(element: HTMLElement, options: { theme: 'outline'; size: 'large'; type: 'standard';
    text: 'signin_with'; locale: Language; width: number }): void;
  disableAutoSelect(): void;
}
declare global { interface Window { google?: { accounts?: { id?: GoogleId } }; } }

let loading: Promise<GoogleId> | undefined;

export function loadGoogle(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const finish = (sdk?: GoogleId) => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (sdk) resolve(sdk);
      else { script.remove(); reject(new Error('Google sign-in could not load.')); }
    };
    const timer = setTimeout(() => finish(), 10_000);
    script.onload = () => finish(window.google?.accounts?.id);
    script.onerror = () => finish();
    document.head.append(script);
  });
  // Reset only on failure, allowing an explicit retry while sharing StrictMode's in-flight load.
  void loading.catch(() => { loading = undefined; });
  return loading;
}

const initialized = new WeakMap<GoogleId, { clientId: string; callback: ((credential: string) => void) | null }>();

export function renderGoogleButton(sdk: GoogleId, element: HTMLElement, clientId: string,
  language: Language, callback: (credential: string) => void) {
  let owner = initialized.get(sdk);
  if (!owner || owner.clientId !== clientId) {
    owner = { clientId, callback: null };
    const configuration = owner;
    sdk.initialize({ client_id: clientId, auto_select: false, ux_mode: 'popup',
      callback: (response) => {
        if (typeof response.credential === 'string' && response.credential.length > 0) configuration.callback?.(response.credential);
      } });
    initialized.set(sdk, owner);
  }
  owner.callback = callback;
  sdk.renderButton(element, { theme: 'outline', size: 'large', type: 'standard', text: 'signin_with', locale: language, width: 240 });
  return () => {
    if (owner.callback === callback) owner.callback = null;
    element.replaceChildren();
  };
}

export function disableGoogleAutoSelect() {
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* Backend logout is already authoritative. */ }
}
