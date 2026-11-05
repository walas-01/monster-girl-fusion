import { useEffect, useRef, useState } from 'react';
import { normalizeUsername } from './username';
import { text } from '../i18n';
import type { Language, TextKey } from '../i18n';

export function UsernameForm({ language, value, onChange, onSave, disabled, error }: {
  language: Language; value: string; onChange: (value: string) => void;
  onSave: (username: string) => void; disabled: boolean; error: TextKey | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);
  const fieldError = invalid ? 'usernameInvalid'
    : error === 'usernameInvalid' || error === 'usernameTaken' ? error : null;
  useEffect(() => {
    if (error === 'usernameInvalid' || error === 'usernameTaken') input.current?.focus();
  }, [error]);

  return <form className="space-y-3 text-left" noValidate onSubmit={(event) => {
    event.preventDefault();
    if (disabled) return;
    const username = normalizeUsername(value);
    if (username === undefined) { setInvalid(true); input.current?.focus(); return; }
    setInvalid(false);
    onSave(username);
  }}>
    <label htmlFor="username" className="block font-medium text-purple-100">{text(language, 'usernameLabel')}</label>
    <input id="username" ref={input} name="username" type="text" value={value} required maxLength={256}
      autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={disabled}
      aria-invalid={fieldError !== null} aria-describedby={`username-rules username-permanent${fieldError ? ' username-error' : ''}`}
      className="min-h-11 w-full rounded-lg border border-purple-300/30 bg-[#100d18] px-3 py-2 text-white disabled:opacity-55"
      onChange={(event) => { setInvalid(false); onChange(event.target.value); }} />
    <p id="username-rules" className="text-sm">{text(language, 'usernameRules')}</p>
    <p id="username-permanent" className="text-sm text-purple-100">{text(language, 'usernamePermanent')}</p>
    {fieldError && <p id="username-error" role="alert" className="text-sm text-rose-200">{text(language, fieldError)}</p>}
    <button type="submit" disabled={disabled} className="action w-full">{text(language, 'usernameSave')}</button>
  </form>;
}
