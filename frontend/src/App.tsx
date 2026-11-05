import { useEffect, useState } from 'react';
import { useAuth } from './auth/useAuth';
import { GoogleSignInButton } from './auth/GoogleSignInButton';
import { UsernameForm } from './auth/UsernameForm';
import { disableGoogleAutoSelect } from './auth/google';
import { initialLanguage, text } from './i18n';
import type { Language } from './i18n';
import type { AuthApi } from './auth/api';

export default function App({ clientId, api }: { clientId?: string; api?: AuthApi }) {
  const [language, setLanguage] = useState<Language>(() => initialLanguage(navigator.languages));
  const auth = useAuth(api);
  const [draft, setDraft] = useState({ userId: '', value: '' });
  const account = auth.session?.authenticated ? auth.session.user : null;
  useEffect(() => {
    // Retain the draft through unknown/reconciling state, but never show it for another account.
    if (auth.session === null) return;
    const userId = auth.session.authenticated ? auth.session.user.id : '';
    const hasUsername = auth.session.authenticated && auth.session.user.username !== null;
    setDraft((current) => current.userId !== userId || hasUsername
      ? { userId, value: '' } : current);
  }, [auth.session]);
  const showUsernameForm = account !== null && account.username === null;
  const inlineError = showUsernameForm && (auth.error === 'usernameInvalid' || auth.error === 'usernameTaken');
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = text(language, 'title');
  }, [language]);
  // No SDK state is used as application authentication evidence.
  useEffect(() => {
    if (auth.session?.authenticated === false) disableGoogleAutoSelect();
  }, [auth.session]);

  return <main className="flex min-h-dvh items-center justify-center px-4 py-8">
    <section aria-labelledby="app-title" className="w-full max-w-sm space-y-6 rounded-2xl border border-purple-300/20 bg-[#1b1526] p-5 text-center shadow-xl sm:p-8">
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm text-purple-100/80">
          {text(language, 'language')}
          <select value={language} disabled={auth.pending !== null && auth.pending !== 'checking'}
            onChange={(event) => setLanguage(event.target.value as Language)} className="rounded-md border border-purple-300/30 bg-[#100d18] p-2 text-white">
            <option value="en">{text(language, 'english')}</option>
            <option value="es">{text(language, 'spanish')}</option>
          </select>
        </label>
      </div>
      <h1 id="app-title" className="text-2xl font-semibold tracking-tight text-purple-100">{text(language, 'title')}</h1>
      {auth.pending && <p role="status" aria-live="polite">{text(language, auth.pending)}</p>}
      {auth.error && !inlineError && <p role="alert" className="text-sm text-rose-200">{text(language, auth.error)}</p>}
      {!auth.pending && auth.session === null && <button type="button" className="action" onClick={() => void auth.refresh()}>{text(language, 'retry')}</button>}
      {!auth.pending && auth.session?.authenticated === false && <>
        <p>{text(language, 'introduction')}</p>
        {clientId
          ? <GoogleSignInButton clientId={clientId} language={language} onCredential={auth.login} />
          : <p role="alert" className="text-sm text-rose-200">{text(language, 'configuration')}</p>}
      </>}
      {auth.session?.authenticated && <div className="space-y-4">
        {!auth.pending && <p role="status">{text(language, 'signedIn')}</p>}
        {auth.session.user.username && <p className="break-words font-medium text-purple-100">{auth.session.user.username}</p>}
        {showUsernameForm && <UsernameForm language={language}
          value={draft.userId === account.id ? draft.value : ''}
          onChange={(value) => setDraft({ userId: account.id, value })}
          onSave={auth.setUsername} disabled={auth.pending !== null} error={auth.error} />}
        <button type="button" className="action" disabled={auth.pending !== null} onClick={() => void auth.logout()}>{text(language, 'logout')}</button>
      </div>}
    </section>
  </main>;
}
