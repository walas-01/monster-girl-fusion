import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost:5173' });
Object.defineProperties(globalThis, {
  window: { value: dom.window, configurable: true },
  document: { value: dom.window.document, configurable: true },
  navigator: { value: dom.window.navigator, configurable: true },
  HTMLElement: { value: dom.window.HTMLElement, configurable: true },
  MutationObserver: { value: dom.window.MutationObserver, configurable: true },
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { default: React, StrictMode } = await import('react');
const { render, screen, fireEvent, cleanup, act, waitFor } = await import('@testing-library/react/pure');
const { default: App } = await import('../src/App.tsx');
const { loadGoogle } = await import('../src/auth/google.ts');
const anonymous = { authenticated: false };
const account = { authenticated: true, user: { id: 'a'.repeat(36), username: null }, requiresOnboarding: true };
const clientId = 'test.apps.googleusercontent.com';

afterEach(() => { cleanup(); delete window.google; document.head.querySelectorAll('script').forEach((element) => element.remove()); });
after(() => dom.window.close());

function apiFixture(overrides = {}) {
  let session = anonymous;
  const calls = [];
  const api = {
    session: async () => { calls.push('session'); return session; },
    csrf: async () => { calls.push('csrf'); return 'x'.repeat(43); },
    login: async () => { calls.push('login'); session = account; return account; },
    setUsername: async (username) => { calls.push('username'); session = { ...account, user: { ...account.user, username }, requiresOnboarding: false }; return session; },
    logout: async () => { calls.push('logout'); session = anonymous; }, ...overrides,
  };
  return { api, calls };
}

function mockGoogle() {
  let callback;
  let initializations = 0;
  let disableCalls = 0;
  const sdk = {
    initialize: (options) => { callback = options.callback; initializations++; assert.equal(options.auto_select, false); assert.equal(options.ux_mode, 'popup'); },
    renderButton: (element, options) => {
      const button = document.createElement('button');
      button.textContent = options.locale === 'es' ? 'Acceder con Google' : 'Sign in with Google';
      button.onclick = () => callback({ credential: 'private.credential.signature' });
      element.append(button);
    },
    disableAutoSelect: () => { disableCalls++; },
  };
  window.google = { accounts: { id: sdk } };
  return { sdk, deliver: () => callback({ credential: 'a.b.c' }), get initializations() { return initializations; }, get disableCalls() { return disableCalls; } };
}

test('minimal view supports login, username form, EN/ES switching and logout under StrictMode', async () => {
  const google = mockGoogle();
  const { api, calls } = apiFixture();
  render(<StrictMode><App clientId={clientId} api={api} /></StrictMode>);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }));
  await screen.findByText('You are signed in.');
  assert.ok(screen.getByRole('textbox', { name: 'Choose your username' }));
  assert.equal(screen.queryByText('a'.repeat(36)), null);
  assert.equal(screen.queryByRole('button', { name: 'Sign in with Google' }), null);
  fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'es' } });
  assert.ok(screen.getByText('Has iniciado sesión.'));
  assert.equal(document.documentElement.lang, 'es');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await screen.findByRole('button', { name: 'Acceder con Google' });
  assert.equal(google.initializations, 1);
  assert.ok(google.disableCalls > 0);
  assert.equal(calls.filter((call) => call === 'login').length, 1);
  assert.equal(calls.filter((call) => call === 'logout').length, 1);
});

test('unknown session shows retry, not login; retry restores existing account even without Google configuration', async () => {
  let reads = 0;
  const { api } = apiFixture({ session: async () => { if (++reads <= 2) throw new Error(); return account; } });
  render(<StrictMode><App api={api} /></StrictMode>);
  await screen.findByRole('alert');
  assert.equal(screen.queryByText('Sign in to your account.'), null);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('button', { name: 'Sign out' });
  assert.equal(document.querySelector('script[src*="accounts.google.com"]'), null);
});

test('loading/mutation states block duplicate credential delivery and language changes', async () => {
  const google = mockGoogle();
  const response = Promise.withResolvers();
  const { api, calls } = apiFixture({ csrf: () => response.promise });
  render(<App clientId={clientId} api={api} />);
  await screen.findByRole('button', { name: 'Sign in with Google' });
  act(() => { google.deliver(); google.deliver(); });
  assert.ok(screen.getByText('Signing in…'));
  assert.equal(screen.getByRole('combobox').disabled, true);
  assert.equal(screen.queryByRole('button', { name: 'Sign in with Google' }), null);
  await act(async () => response.resolve('x'.repeat(43)));
  await screen.findByText('You are signed in.');
  assert.equal(calls.filter((call) => call === 'login').length, 1);
});

test('missing client ID affects only sign-in; localized feedback is shown', async () => {
  const { api } = apiFixture();
  render(<App api={api} />);
  await screen.findByText('Google sign-in is not configured. Please contact the app owner.');
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });
  assert.ok(screen.getByText('El acceso con Google no está configurado. Contacta con el responsable de la aplicación.'));
  assert.equal(document.querySelector('script[src*="accounts.google.com"]'), null);
});

test('SDK script failures permit explicit retry; StrictMode shares a single in-flight script', async () => {
  const { api } = apiFixture();
  render(<StrictMode><App clientId={clientId} api={api} /></StrictMode>);
  await screen.findByText('Loading Google sign-in…');
  await waitFor(() => assert.equal(document.head.querySelectorAll('script').length, 1));
  await act(async () => document.head.querySelector('script').dispatchEvent(new window.Event('error')));
  await screen.findByText('Google sign-in could not load. Please try again.');
  const google = mockGoogle();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('button', { name: 'Sign in with Google' });
  assert.equal(google.initializations, 1);
});

test('SDK loader times out and supports a later successful load without retaining failed scripts', async (t) => {
  const original = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, ms, ...args) => original(callback, ms === 10_000 ? 5 : ms, ...args));
  const first = loadGoogle();
  assert.equal(loadGoogle(), first);
  await assert.rejects(first);
  assert.equal(document.head.querySelectorAll('script').length, 0);
  const next = loadGoogle();
  const google = mockGoogle();
  document.head.querySelector('script').dispatchEvent(new window.Event('load'));
  assert.equal(await next, google.sdk);
});

test('unmount removes the Google button and ignores retained SDK callbacks', async () => {
  const google = mockGoogle();
  const { api, calls } = apiFixture();
  const view = render(<App clientId={clientId} api={api} />);
  await screen.findByRole('button', { name: 'Sign in with Google' });
  view.unmount();
  await act(async () => google.deliver());
  assert.equal(calls.includes('login'), false);
  assert.equal(document.querySelector('main'), null);
});

test('failed logout remains authenticated after reconciliation and displays translated safe feedback', async () => {
  const { AuthError } = await import('../src/auth/api.ts');
  const { api } = apiFixture({ session: async () => account, logout: async () => { throw new AuthError('SESSION_UNAVAILABLE'); } });
  render(<App api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  await screen.findByText('Sign-in is temporarily unavailable. Please try again.');
  assert.ok(screen.getByText('You are signed in.'));
  assert.equal(screen.getByRole('button', { name: 'Sign out' }).disabled, false);
});

test('username form validates locally, preserves draft/language, and displays saved name only after confirmation', async () => {
  const { api, calls } = apiFixture({ session: async () => account });
  render(<App api={api} />);
  const input = await screen.findByRole('textbox', { name: 'Choose your username' });
  fireEvent.change(input, { target: { value: '___' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save username' }));
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(document.activeElement, input);
  assert.equal(calls.includes('username'), false);
  fireEvent.change(input, { target: { value: ' Luna_7 ' } });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });
  assert.equal(screen.getByRole('textbox').value, ' Luna_7 ');
  assert.ok(screen.getByText('Tu nombre de usuario es permanente y no se puede cambiar.'));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre de usuario' }));
  await screen.findByText('Luna_7');
  assert.equal(screen.queryByRole('textbox'), null);
  assert.equal(calls.filter(call => call === 'username').length, 1);
});

test('pending username saves disable form, logout and language controls and prevent duplicate submits', async () => {
  const pending = Promise.withResolvers();
  let writes = 0;
  const { api } = apiFixture({ session: async () => account, setUsername: async () => { writes++; return pending.promise; } });
  render(<App api={api} />);
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Luna' } });
  const button = screen.getByRole('button', { name: 'Save username' });
  fireEvent.click(button);
  fireEvent.submit(button.closest('form'));
  await screen.findByText('Saving your username…');
  assert.equal(screen.getByRole('textbox').disabled, true);
  assert.equal(screen.getByRole('combobox').disabled, true);
  assert.equal(screen.getByRole('button', { name: 'Sign out' }).disabled, true);
  await act(async () => pending.resolve({ ...account, user: { ...account.user, username: 'Luna' }, requiresOnboarding: false }));
  await screen.findByText('Luna');
  assert.equal(writes, 1);
});

test('taken username is localized inline and retains/focuses draft through reconciliation', async () => {
  const { AuthError } = await import('../src/auth/api.ts');
  const { api } = apiFixture({ session: async () => account, setUsername: async () => { throw new AuthError('USERNAME_TAKEN'); } });
  render(<App api={api} />);
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Luna' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save username' }));
  await screen.findByText('That username is already taken. Please choose another.');
  const input = screen.getByRole('textbox');
  assert.equal(input.value, 'Luna');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(document.activeElement, input);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });
  assert.ok(screen.getByText('Ese nombre de usuario ya está en uso. Elige otro.'));
  assert.equal(screen.getByRole('textbox').value, 'Luna');
});

test('unknown mutation outcome hides draft, blocks saves and restores the draft only after a confirmed same-account read', async () => {
  const { AuthError } = await import('../src/auth/api.ts');
  let reads = 0;
  const { api } = apiFixture({ session: async () => { if (++reads === 2) throw new Error(); return account; },
    setUsername: async () => { throw new AuthError('NETWORK'); } });
  render(<App api={api} />);
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Luna' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save username' }));
  await screen.findByRole('button', { name: 'Try again' });
  assert.equal(screen.queryByRole('textbox'), null);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  assert.equal((await screen.findByRole('textbox')).value, 'Luna');
});

test('confirmed different-account reconciliation clears the previous account draft', async () => {
  const { AuthError } = await import('../src/auth/api.ts');
  let reads = 0;
  const different = { ...account, user: { id: 'b'.repeat(36), username: null } };
  const { api } = apiFixture({ session: async () => ++reads === 1 ? account : different,
    setUsername: async () => { throw new AuthError('AUTH_REQUIRED'); } });
  render(<App api={api} />);
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'PrivateDraft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save username' }));
  await screen.findByText('Your session security check failed. Please try again.');
  assert.equal(screen.getByRole('textbox').value, '');
});

test('another-tab or lost-response completion shows the saved username, not stale form errors', async () => {
  const { AuthError } = await import('../src/auth/api.ts');
  let reads = 0;
  const saved = { ...account, user: { ...account.user, username: 'OtherTab' }, requiresOnboarding: false };
  const { api } = apiFixture({ session: async () => ++reads === 1 ? account : saved,
    setUsername: async () => { throw new AuthError('USERNAME_ALREADY_SET'); } });
  render(<App api={api} />);
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Luna' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save username' }));
  await screen.findByText('OtherTab');
  assert.equal(screen.queryByRole('textbox'), null);
  assert.equal(screen.queryByRole('alert'), null);
});

test('logout clears an unfinished draft before the same account signs in again', async () => {
  mockGoogle();
  const { api } = apiFixture();
  render(<App clientId={clientId} api={api} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }));
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'PrivateDraft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }));
  assert.equal((await screen.findByRole('textbox')).value, '');
});
