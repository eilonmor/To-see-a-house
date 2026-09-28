import { useState } from 'react'
import AdminLogin from './AdminLogin'
import AdminDashboard from './AdminDashboard'

const SESSION_KEY = 'apartment-viewing-admin'

function readSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function writeSession(value) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, '1')
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // storage unavailable (private mode etc.) — login just won't persist on reload
  }
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(readSession)

  function setAuth(value) {
    writeSession(value)
    setAuthed(value)
  }

  return authed ? <AdminDashboard onLogout={() => setAuth(false)} /> : <AdminLogin onSuccess={() => setAuth(true)} />
}
