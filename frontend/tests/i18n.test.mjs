import assert from 'node:assert/strict'
import test from 'node:test'
import { getInitialLanguage, saveLanguage, translations } from '../src/i18n.ts'

// Fake only the browser objects these helpers use; no DOM or real storage is needed.
function installBrowser(context, { savedLanguage = null, languages = ['en'], language = 'en' } = {}) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const values = new Map()

  if (savedLanguage !== null) {
    values.set('monster-girl.language', savedLanguage)
  }

  const browser = {
    navigator: { languages, language },
    localStorage: {
      getItem(key) { return values.get(key) ?? null },
      setItem(key, value) { values.set(key, value) },
    },
  }

  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser })
  context.after(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow)
    } else {
      delete globalThis.window
    }
  })

  return { browser, values }
}

for (const [savedLanguage, languages] of [['en', ['es-AR']], ['es', ['en-GB']]]) {
  test(`saved ${savedLanguage} takes priority over browser preferences`, (context) => {
    installBrowser(context, { savedLanguage, languages })
    assert.equal(getInitialLanguage(), savedLanguage)
  })
}

for (const savedLanguage of [null, '', 'fr', 'ES', 'es-AR', 'invalid']) {
  test(`absent/invalid saved value ${JSON.stringify(savedLanguage)} uses the browser`, (context) => {
    installBrowser(context, { savedLanguage, languages: ['fr-FR', 'es-AR', 'en-GB'] })
    assert.equal(getInitialLanguage(), 'es')
  })
}

for (const [languages, expected] of [
  [['es-AR', 'en-GB'], 'es'],
  [['en-GB', 'es-AR'], 'en'],
  [['fr-FR', 'ES-mx'], 'es'],
  [['fr-FR', 'EN-us'], 'en'],
  [['de', 'ja'], 'en'],
  [['esperanto', 'english'], 'en'],
]) {
  test(`ordered browser languages ${languages.join(', ')} resolve to ${expected}`, (context) => {
    installBrowser(context, { languages })
    assert.equal(getInitialLanguage(), expected)
  })
}

test('an empty browser language list falls back to navigator.language', (context) => {
  installBrowser(context, { languages: [], language: 'es-ES' })
  assert.equal(getInitialLanguage(), 'es')
})

test('no compatible browser preferences fall back to English', (context) => {
  installBrowser(context, { languages: [], language: 'fr' })
  assert.equal(getInitialLanguage(), 'en')
})

test('initial detection does not write a preference', (context) => {
  const { values } = installBrowser(context, { languages: ['es'] })
  assert.equal(getInitialLanguage(), 'es')
  assert.equal(values.size, 0)
})

test('manual choices save only the language and are used on the next initialization', (context) => {
  const { values } = installBrowser(context, { languages: ['en'] })
  saveLanguage('es')
  assert.deepEqual([...values], [['monster-girl.language', 'es']])
  assert.equal(getInitialLanguage(), 'es')
  saveLanguage('en')
  assert.deepEqual([...values], [['monster-girl.language', 'en']])
  assert.equal(getInitialLanguage(), 'en')
})

test('a blocked localStorage getter still detects language and permits manual selection', (context) => {
  const { browser } = installBrowser(context, { languages: ['es-AR'] })
  Object.defineProperty(browser, 'localStorage', {
    get() { throw new Error('Storage access denied') },
  })
  assert.equal(getInitialLanguage(), 'es')
  assert.doesNotThrow(() => saveLanguage('en'))
})

test('storage read errors fall back to browser preferences', (context) => {
  const { browser } = installBrowser(context, { languages: ['es'] })
  browser.localStorage.getItem = () => { throw new Error('Read denied') }
  assert.equal(getInitialLanguage(), 'es')
})

test('storage write errors do not escape to the interface', (context) => {
  const { browser } = installBrowser(context)
  browser.localStorage.setItem = () => { throw new Error('Storage full') }
  assert.doesNotThrow(() => saveLanguage('es'))
})

test('both interface dictionaries provide the same nonempty text keys', () => {
  assert.deepEqual(Object.keys(translations.es).sort(), Object.keys(translations.en).sort())
  for (const dictionary of Object.values(translations)) {
    for (const value of Object.values(dictionary)) {
      assert.equal(typeof value, 'string')
      assert.notEqual(value.trim(), '')
    }
  }
})
