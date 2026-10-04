import { useSession } from '../hooks/useSession'
import { useI18n } from '../i18n/I18nProvider'
import AdminLogin from './AdminLogin'
import AdminDashboard from './AdminDashboard'
import { Spinner } from './ui'

export default function AdminPage() {
  const { t } = useI18n()
  const session = useSession()

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Spinner /> {t.dashboard.loading}
      </div>
    )
  }
  return session ? <AdminDashboard user={session.user} /> : <AdminLogin />
}
