import { useHashRoute } from './hooks/useHashRoute'
import Layout from './components/Layout'
import BookingPage from './components/BookingPage'
import AdminPage from './components/AdminPage'

export default function App() {
  const route = useHashRoute()
  const isAdmin = route.startsWith('/admin')

  return <Layout isAdmin={isAdmin}>{isAdmin ? <AdminPage /> : <BookingPage />}</Layout>
}
