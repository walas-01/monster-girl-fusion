export type Language = 'en' | 'es'

const english = {
  appName: 'MonsterFusion',
  documentTitle: 'MonsterFusion — Getting ready',
  preparationMessage: 'We are preparing the foundation of the game. There is nothing to play yet.',
  languageLabel: 'Language',
  englishOption: 'English',
  spanishOption: 'Español',
}

export const translations: Record<Language, typeof english> = {
  en: english,
  es: {
    appName: 'MonsterFusion',
    documentTitle: 'MonsterFusion — Preparando el juego',
    preparationMessage: 'Estamos preparando la base del juego. Todavía no hay contenido jugable.',
    languageLabel: 'Idioma',
    englishOption: 'English',
    spanishOption: 'Español',
  },
}

const languageStorageKey = 'monster-girl.language'

export function getInitialLanguage(): Language {
  try {
    const savedLanguage = window.localStorage.getItem(languageStorageKey)

    if (savedLanguage === 'en' || savedLanguage === 'es') {
      return savedLanguage
    }
  } catch {
    // Storage restrictions must not prevent browser-language detection.
  }

  const preferences = window.navigator.languages
  const browserLanguages = preferences.length > 0 ? preferences : [window.navigator.language]

  for (const preference of browserLanguages) {
    const language = preference.toLowerCase().split('-')[0]

    if (language === 'en' || language === 'es') {
      return language
    }
  }

  return 'en'
}

export function saveLanguage(language: Language): void {
  try {
    window.localStorage.setItem(languageStorageKey, language)
  } catch {
    // The selected language still works for this page when storage is unavailable.
  }
}
