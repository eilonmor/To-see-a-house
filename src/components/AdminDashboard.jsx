import { useState } from 'react'
import { TIME_SLOTS } from '../config'
import { releaseSlot } from '../lib/bookingStore'
import { useBookings } from '../hooks/useBookings'
import { Alert, Button, Card, Spinner } from './ui'

export default function AdminDashboard({ onLogout }) {
  const { bookings, setBookings, loading, error, lastUpdated, refresh } = useBookings()
  const [releasing, setReleasing] = useState(null)
  const [actionError, setActionError] = useState('')

  const bookedCount = TIME_SLOTS.filter((s) => bookings[s]).length

  async function handleRelease(slot) {
    const booking = bookings[slot]
    if (!window.confirm(`Release the ${slot} slot booked by ${booking.name}?`)) return
    setReleasing(slot)
    setActionError('')
    try {
      setBookings(await releaseSlot(slot))
    } catch (err) {
      setActionError(`Could not release ${slot}: ${err.message}`)
    } finally {
      setReleasing(null)
    }
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bookings dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'} · refreshes automatically
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={refresh} disabled={loading}>
            {loading ? <Spinner /> : '↻'} Refresh
          </Button>
          <Button variant="secondary" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total slots" value={TIME_SLOTS.length} />
        <Stat label="Booked" value={bookedCount} tone="indigo" />
        <Stat label="Available" value={TIME_SLOTS.length - bookedCount} tone="emerald" />
      </div>

      {error && <Alert>Could not load bookings: {error}</Alert>}
      {actionError && <Alert>{actionError}</Alert>}

      <Card className="overflow-hidden p-0!">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Spinner /> Loading bookings…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 sm:px-6">Time</th>
                  <th scope="col" className="px-4 py-3">Visitor</th>
                  <th scope="col" className="px-4 py-3">Phone</th>
                  <th scope="col" className="px-4 py-3 text-right sm:px-6">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TIME_SLOTS.map((slot) => {
                  const booking = bookings[slot]
                  return (
                    <tr key={slot} className={booking ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-slate-900 sm:px-6">{slot}</td>
                      {booking ? (
                        <>
                          <td className="px-4 py-4 text-slate-800">{booking.name}</td>
                          <td className="whitespace-nowrap px-4 py-4">
                            <a href={`tel:${booking.phone.replace(/[^\d+]/g, '')}`} className="text-indigo-600 hover:underline">
                              {booking.phone}
                            </a>
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right sm:px-6">
                            <Button
                              variant="danger"
                              className="px-3! py-1.5! text-xs"
                              onClick={() => handleRelease(slot)}
                              disabled={releasing !== null}
                            >
                              {releasing === slot ? <Spinner className="h-3 w-3" /> : null} Release
                            </Button>
                          </td>
                        </>
                      ) : (
                        <td colSpan={3} className="px-4 py-4 sm:pr-6">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available
                          </span>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value, tone = 'slate' }) {
  const color = { slate: 'text-slate-900', indigo: 'text-indigo-600', emerald: 'text-emerald-600' }[tone]
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
