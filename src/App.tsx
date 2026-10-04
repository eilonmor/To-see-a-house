import { useState } from 'react'
import { DEFAULT_PROPERTY_SLUG } from './config'
import { useHashRoute } from './hooks/useHashRoute'
import { useI18n } from './i18n/I18nProvider'
import Layout from './components/Layout'
import BookingPage from './components/BookingPage'
import AdminPage from './components/AdminPage'
import { Card } from './components/ui'

// A malformed link (e.g. "#/p/%") can't be decoded; the raw text then simply
// matches no property, and the page says so.
function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export default function App() {
  const route = useHashRoute()
  const isAdmin = route.startsWith('/admin')
  const linkSlug = route.match(/^\/p\/([^/?#]+)/)?.[1]
  const slug = linkSlug || DEFAULT_PROPERTY_SLUG

  // The header links lead back to the last property opened by its own link,
  // e.g. after visiting the admin page.
  const [homeSlug, setHomeSlug] = useState(linkSlug)
  if (linkSlug && linkSlug !== homeSlug) setHomeSlug(linkSlug)
  const homeHref = homeSlug ? `#/p/${homeSlug}` : '#/'

  let page
  if (isAdmin) page = <AdminPage />
  else if (slug) page = <BookingPage key={slug} slug={decodeSlug(slug)} />
  else page = <NoProperty />

  return (
    <Layout isAdmin={isAdmin} homeHref={homeHref}>
      {page}
    </Layout>
  )
}

function NoProperty() {
  const { t } = useI18n()
  return (
    <Card className="mx-auto mt-8 max-w-md text-center">
      <h1 className="text-xl font-semibold text-slate-900">{t.noProperty.title}</h1>
      <p className="mt-2 text-slate-500">{t.noProperty.body}</p>
    </Card>
  )
}
