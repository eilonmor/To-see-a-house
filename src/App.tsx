import { DEFAULT_PROPERTY_SLUG } from './config'
import { useHashRoute } from './hooks/useHashRoute'
import { useI18n } from './i18n/I18nProvider'
import Layout from './components/Layout'
import BookingPage from './components/BookingPage'
import AdminPage from './components/AdminPage'
import { Card } from './components/ui'

export default function App() {
  const route = useHashRoute()
  const isAdmin = route.startsWith('/admin')
  const slug = route.match(/^\/p\/([^/?#]+)/)?.[1] || DEFAULT_PROPERTY_SLUG

  let page
  if (isAdmin) page = <AdminPage />
  else if (slug) page = <BookingPage key={slug} slug={decodeURIComponent(slug)} />
  else page = <NoProperty />

  return <Layout isAdmin={isAdmin}>{page}</Layout>
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
