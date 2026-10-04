import type { ReactNode } from 'react'
import { isConfigured } from '../lib/supabase'
import { useI18n } from '../i18n/I18nProvider'
import { LANGUAGES } from '../i18n/translations'

type Props = { isAdmin: boolean; homeHref: string; children: ReactNode }

export default function Layout({ isAdmin, homeHref, children }: Props) {
  const { t, lang, setLang } = useI18n()
  const otherLang = lang === 'he' ? 'en' : 'he'

  return (
    <div className="min-h-screen bg-linear-to-b from-indigo-50 via-slate-50 to-slate-50 text-slate-800">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-5">
        <a href={homeHref} className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <HouseIcon />
          </span>
          {t.appName}
        </a>
        <div className="flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => setLang(otherLang)}
            lang={otherLang}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            {LANGUAGES[otherLang].label}
          </button>
          {isAdmin ? (
            <a href={homeHref} className="text-slate-500 hover:text-slate-800">
              {t.backToBooking}
            </a>
          ) : (
            <a href="#/admin" className="text-slate-400 hover:text-slate-700">
              {t.adminLink}
            </a>
          )}
        </div>
      </header>

      {!isConfigured && (
        <div className="mx-auto mb-4 max-w-3xl px-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>{t.setupBanner.title}</strong> {t.setupBanner.body}{' '}
            <code className="font-mono">VITE_SUPABASE_URL</code> {t.setupBanner.and}{' '}
            <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
          </div>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-4 pb-16">{children}</main>
    </div>
  )
}

function HouseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  )
}
