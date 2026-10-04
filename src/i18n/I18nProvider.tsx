import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_LANGUAGE } from '../config'
import type { ErrorParams } from '../lib/supabase'
import { LANGUAGES, translations, type Lang, type Translation } from './translations'

const STORAGE_KEY = 'apartment-viewing-lang'

type I18n = { lang: Lang; dir: 'rtl' | 'ltr'; t: Translation; setLang: (lang: Lang) => void }

const I18nContext = createContext<I18n | null>(null)

const isLang = (value: unknown): value is Lang => typeof value === 'string' && value in translations

function initialLanguage(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    // storage unavailable — fall through to the default
  }
  return DEFAULT_LANGUAGE
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLanguage)
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

export function useI18n(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>')
  return value
}

/** Turns a thrown error into a message in the active language. */
export function errorText(err: unknown, t: Translation): string {
  const { code, params, message } = (err ?? {}) as { code?: string; params?: ErrorParams; message?: string }
  const format = code ? (t.errors as Record<string, ((p: ErrorParams) => string) | undefined>)[code] : undefined
  return format ? format(params || {}) : message || String(err)
}
