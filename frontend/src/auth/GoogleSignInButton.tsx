import { useEffect, useRef, useState } from 'react';
import { loadGoogle, renderGoogleButton } from './google';
import { text } from '../i18n';
import type { Language } from '../i18n';

export function GoogleSignInButton({ clientId, language, onCredential }: {
  clientId: string; language: Language; onCredential: (credential: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    setStatus('loading');
    void loadGoogle().then((sdk) => {
      if (!active || !container.current) return;
      dispose = renderGoogleButton(sdk, container.current, clientId, language,
        (credential) => { if (active) onCredential(credential); });
      setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; dispose?.(); };
  }, [clientId, language, onCredential, attempt]);
  return <div className="space-y-3">
    <div ref={container} className="flex min-h-11 justify-center" />
    {status === 'loading' && <p role="status">{text(language, 'googleLoading')}</p>}
    {status === 'error' && <>
      <p role="alert">{text(language, 'googleUnavailable')}</p>
      <button type="button" className="action" onClick={() => setAttempt((value) => value + 1)}>{text(language, 'retry')}</button>
    </>}
  </div>;
}
