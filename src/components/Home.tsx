import { useI18n } from '../i18n/I18nProvider'
import { Link } from './ui'

const primary =
  'inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'
const secondary =
  'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'

/** The site root: what the app does, and the way in for owners and agents. */
export default function Home({ loggedIn }: { loggedIn: boolean }) {
  const { t } = useI18n()
  return (
    <div className="pt-10 text-center sm:pt-16">
      <h1 className="text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">{t.home.title}</h1>
      <p className="mx-auto mt-4 max-w-xl text-balance text-lg text-slate-500">{t.home.subtitle}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {loggedIn ? (
          <Link href="/dashboard" className={primary}>
            {t.home.dashboard}
          </Link>
        ) : (
          <>
            <Link href="/signup" className={primary}>
              {t.home.signup}
            </Link>
            <Link href="/login" className={secondary}>
              {t.home.login}
            </Link>
          </>
        )}
      </div>
      <ul className="mt-14 grid gap-4 text-start sm:grid-cols-3">
        {t.home.features.map((feature) => (
          <li key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">{feature.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{feature.body}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
