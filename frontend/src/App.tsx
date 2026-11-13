import { useEffect, useState } from 'react'
import type { ChangeEvent, JSX } from 'react'
import { getInitialLanguage, saveLanguage, translations } from './i18n.ts'

export function App(): JSX.Element {
  const [language, setLanguage] = useState(getInitialLanguage)
  const text = translations[language]

  useEffect((): void => { // cuando cambie el estado
    document.documentElement.lang = language
    document.title = text.documentTitle
  }, [language, text.documentTitle])

  function handleLanguageChange(event: ChangeEvent<HTMLSelectElement>): void {
    const selectedLanguage = event.currentTarget.value

    if (selectedLanguage === 'en' || selectedLanguage === 'es') {
      setLanguage(selectedLanguage)
      saveLanguage(selectedLanguage)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">

        <div className="space-y-4">
          <h1 className="break-words text-3xl font-semibold tracking-tight text-purple-200 sm:text-4xl">
            {text.appName}
          </h1>
          <p className="text-base leading-relaxed text-slate-300">
            {text.preparationMessage}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="language" className="text-sm font-medium text-purple-200">
            {text.languageLabel}
          </label>
          <select id="language" value={language} onChange={handleLanguageChange}
            className="min-h-11 rounded-lg border border-purple-400/40 bg-purple-800 px-3 py-2 text-base text-slate-100"
          >
            <option value="en" lang="en">{text.englishOption}</option>
            <option value="es" lang="es">{text.spanishOption}</option>
          </select>
        </div>
        
      </div>
    </main>
  )
}
