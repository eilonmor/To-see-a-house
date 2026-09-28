import { isDemoMode } from '../lib/bookingStore'

export default function Layout({ isAdmin, children }) {
  return (
    <div className="min-h-screen bg-linear-to-b from-indigo-50 via-slate-50 to-slate-50 text-slate-800">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <a href="#/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <HouseIcon />
          </span>
          Apartment Viewing
        </a>
        {isAdmin ? (
          <a href="#/" className="text-sm text-slate-500 hover:text-slate-800">
            ← Booking page
          </a>
        ) : (
          <a href="#/admin" className="text-sm text-slate-400 hover:text-slate-700">
            Admin
          </a>
        )}
      </header>

      {isDemoMode && (
        <div className="mx-auto mb-4 max-w-3xl px-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Demo mode:</strong> jsonbin.io is not configured, so bookings are only saved in this
            browser. Set <code className="font-mono">VITE_JSONBIN_BIN_ID</code> and{' '}
            <code className="font-mono">VITE_JSONBIN_ACCESS_KEY</code> to sync across devices.
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
