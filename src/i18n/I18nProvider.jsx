import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANGUAGE } from '../config'
import { LANGUAGES, translations } from './translations'

const STORAGE_KEY = 'apartment-viewing-lang'
const I18nContext = createContext(null)

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && translations[saved]) return saved
  } catch {
    // storage unavailable — fall through to the default
  }
  return translations[DEFAULT_LANGUAGE] ? DEFAULT_LANGUAGE : 'en'
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(initialLanguage)
  const { dir } = LANGUAGES[lang]

  // Reflect the language on <html> so the whole page (including native
  // controls and dialogs) switches direction.
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
    document.title = translations[lang].appName
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // ignore — the choice just won't be remembered
    }
  }, [lang, dir])

  const value = useMemo(() => ({ lang, dir, t: translations[lang], setLang }), [lang, dir])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

/** Turns a thrown error into a message in the active language. */
export function errorText(err, t) {
  const format = err?.code && t.errors[err.code]
  return format ? format(err.params || {}) : err?.message || String(err)
}
