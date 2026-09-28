import { useEffect, useState } from 'react'
import { TIME_SLOTS } from '../config'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Spinner } from './ui'

/**
 * Time-slot grid. With `currentSlot` set it works in "change time" mode: the
 * visitor's current slot is marked, and nothing changes until they pick a new
 * slot and press the approve button.
 */
export default function SlotPicker({ bookings, loading, loadError, submitError, submitting, name, currentSlot, onBack, onConfirm }) {
  const { t } = useI18n()
  const [selected, setSelected] = useState(null)
  const rescheduling = Boolean(currentSlot)

  // If the selected slot gets booked by someone else (via polling), clear it.
  useEffect(() => {
    if (selected && bookings[selected]) setSelected(null)
  }, [bookings, selected])

  const availableCount = TIME_SLOTS.filter((s) => !bookings[s] && s !== currentSlot).length

  let confirmLabel = t.slots.select
  if (submitting) confirmLabel = t.slots.submitting
  else if (selected) confirmLabel = rescheduling ? t.slots.approveChange(selected) : t.slots.confirm(selected)

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{rescheduling ? t.slots.rescheduleTitle : t.slots.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t.slots.bookingFor} <span className="font-medium text-slate-700">{name}</span>
          </p>
        </div>
        {!loading && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {t.slots.availableOf(availableCount, TIME_SLOTS.length)}
          </span>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {rescheduling && <Alert tone="info">{t.slots.rescheduleHint(currentSlot)}</Alert>}
        {loadError && (
          <Alert>
            {t.slots.loadError} {errorText(loadError, t)}
          </Alert>
        )}
        {submitError && <Alert>{submitError}</Alert>}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-500">
            <Spinner /> {t.slots.loading}
          </div>
        ) : availableCount === 0 ? (
          <Alert tone="info">{rescheduling ? t.slots.noOtherSlots : t.slots.fullyBooked}</Alert>
        ) : null}

        {!loading && (
          <div role="radiogroup" aria-label={t.slots.groupLabel} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TIME_SLOTS.map((slot) => {
              const isCurrent = slot === currentSlot
              const taken = !isCurrent && Boolean(bookings[slot])
              const isSelected = selected === slot
              let style = 'border-slate-300 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-50'
              if (isCurrent) style = 'cursor-not-allowed border-amber-300 bg-amber-50 text-amber-900'
              else if (taken) style = 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              else if (isSelected) style = 'border-indigo-600 bg-indigo-600 text-white shadow-md'
              return (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={taken || isCurrent || submitting}
                  onClick={() => setSelected(slot)}
                  className={`relative rounded-xl border px-3 py-3 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${style}`}
                >
                  <span className={`block text-lg font-semibold ${taken ? 'line-through' : ''}`}>{slot}</span>
                  <span
                    className={`block text-xs ${
                      isCurrent ? 'text-amber-700' : isSelected ? 'text-indigo-100' : taken ? 'text-slate-400' : 'text-emerald-600'
                    }`}
                  >
                    {isCurrent ? t.slots.current : taken ? t.slots.booked : isSelected ? t.slots.selected : t.slots.available}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={onBack} disabled={submitting}>
          {rescheduling ? t.slots.cancelChange : t.slots.back}
        </Button>
        <Button onClick={() => onConfirm(selected)} disabled={!selected || submitting}>
          {submitting && <Spinner />} {confirmLabel}
        </Button>
      </div>
    </Card>
  )
}
