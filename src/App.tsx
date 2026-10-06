import { useState, type ReactNode } from 'react'
import { DEFAULT_PROPERTY_SLUG } from './config'
import { useRoute } from './hooks/useRoute'
import { useSession } from './hooks/useSession'
import { useI18n } from './i18n/I18nProvider'
import Layout from './components/Layout'
import Home from './components/Home'
import BookingPage from './components/BookingPage'
import LoginForm from './components/LoginForm'
import SignupPage from './components/SignupPage'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'
import AccountGate from './components/AccountGate'
import PropertyList from './components/PropertyList'
import NewProperty from './components/NewProperty'
import PropertyEditor from './components/PropertyEditor'
import AgencyPage from './components/AgencyPage'
import CalendarPage from './components/CalendarPage'
import JoinRoute from './components/JoinPage'
import { Card, Link, Loading, Redirect } from './components/ui'

// A malformed link (e.g. "/p/%") can't be decoded; the raw text then simply
// matches nothing, and the page says so.
function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default function App() {
  const { t } = useI18n()
  const route = useRoute()
  const session = useSession()
  const path = route.replace(/\/+$/, '') || '/'

  const linkSlug = path.match(/^\/p\/([^/]+)$/)?.[1]
  const slug = linkSlug ?? (path === '/' ? DEFAULT_PROPERTY_SLUG : '')
  const editorId = path.match(/^\/dashboard\/p\/([^/]+)$/)?.[1]
  const inviteCode = path.match(/^\/join\/([^/]+)$/)?.[1]

  // On a property's page, the logo leads back to the last property opened by
  // its own link, e.g. after a visit to another page.
  const [homeSlug, setHomeSlug] = useState(linkSlug)
  if (linkSlug && linkSlug !== homeSlug) setHomeSlug(linkSlug)

  // Login and sign-up are only for visitors without a session.
  const guestOnly = (page: ReactNode) =>
    session === undefined ? <Loading label={t.dashboard.loading} /> : session ? <Redirect to="/dashboard" /> : page

  let page: ReactNode
  if (slug) page = <BookingPage key={slug} slug={decodeSegment(slug)} />
  else if (path === '/') page = <Home loggedIn={Boolean(session)} />
  else if (path === '/login') page = guestOnly(<LoginForm />)
  else if (path === '/signup') page = guestOnly(<SignupPage />)
  else if (path === '/forgot-password') page = <ForgotPassword />
  else if (path === '/reset-password') page = <ResetPassword />
  else if (path === '/admin') page = <Redirect to="/dashboard" />
  else if (path === '/dashboard') page = <AccountGate><PropertyList /></AccountGate>
  else if (path === '/dashboard/new') page = <AccountGate><NewProperty /></AccountGate>
  else if (path === '/dashboard/agency') page = <AccountGate><AgencyPage /></AccountGate>
  else if (path === '/dashboard/calendar') page = <AccountGate><CalendarPage /></AccountGate>
  else if (inviteCode) page = <JoinRoute key={inviteCode} code={decodeSegment(inviteCode)} />
  else if (editorId) page = <AccountGate><PropertyEditor key={editorId} propertyId={decodeSegment(editorId)} /></AccountGate>
  else page = <NotFound />

  const nav = slug ? { href: '/dashboard', label: session ? t.nav.myProperties : t.nav.owners } : null
  const logoHref = slug ? (homeSlug ? `/p/${homeSlug}` : '/') : session ? '/dashboard' : '/'

  return (
    <Layout logoHref={logoHref} nav={nav}>
      {page}
    </Layout>
  )
}

function NotFound() {
  const { t } = useI18n()
  return (
    <Card className="mx-auto mt-8 max-w-md text-center">
      <h1 className="text-xl font-semibold text-slate-900">{t.notFound.title}</h1>
      <p className="mt-2 text-slate-500">{t.notFound.body}</p>
      <Link href="/" className="mt-4 inline-block font-medium text-indigo-600 hover:underline">
        {t.notFound.home}
      </Link>
    </Card>
  )
}
