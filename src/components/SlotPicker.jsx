import { useEffect, useState } from 'react'
import { TIME_SLOTS } from '../config'
import { Alert, Button, Card, Spinner } from './ui'

export default function SlotPicker({ bookings, loading, loadError, submitError, submitting, details, onBack, onConfirm }) {
  const [selected, setSelected] = useState(null)

  // If the selected slot gets booked by someone else (via polling), clear it.
  useEffect(() => {
    if (selected && bookings[selected]) setSelected(null)
  }, [bookings, selected])

  const availableCount = TIME_SLOTS.filter((s) => !bookings[s]).length

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Choose a time</h2>
          <p className="mt-1 text-sm text-slate-500">
            Booking for <span className="font-medium text-slate-700">{details.name}</span>
          </p>
        </div>
        {!loading && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {availableCount} of {TIME_SLOTS.length} available
          </span>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {loadError && <Alert>Could not load availability: {loadError}</Alert>}
        {submitError && <Alert>{submitError}</Alert>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <Spinner /> Loading available times…
          </div>
        ) : availableCount === 0 ? (
          <Alert tone="info">Sorry — all viewing times are fully booked.</Alert>
        ) : null}

        {!loading && (
          <div role="radiogroup" aria-label="Available time slots" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TIME_SLOTS.map((slot) => {
              const taken = Boolean(bookings[slot])
              const isSelected = selected === slot
              return (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={taken || submitting}
                  onClick={() => setSelected(slot)}
                  className={`relative rounded-xl border px-3 py-3 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    taken
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      : isSelected
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-md'
                        : 'border-slate-300 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-50'
                  }`}
                >
                  <span className={`block text-lg font-semibold ${taken ? 'line-through' : ''}`}>{slot}</span>
                  <span className={`block text-xs ${isSelected ? 'text-indigo-100' : taken ? 'text-slate-400' : 'text-emerald-600'}`}>
                    {taken ? 'Booked' : isSelected ? 'Selected' : 'Available'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          ← Back
        </Button>
        <Button onClick={() => onConfirm(selected)} disabled={!selected || submitting}>
          {submitting ? (
            <>
              <Spinner /> Booking…
            </>
          ) : selected ? (
            `Confirm ${selected}`
          ) : (
            'Select a time'
          )}
        </Button>
      </div>
    </Card>
  )
}
