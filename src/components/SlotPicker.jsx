import { useEffect, useState } from 'react'
import { formatDate } from '../lib/bookingStore'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Spinner } from './ui'

/**
 * Day tabs + time-slot grid. With `current` ({ dayId, slot }) set it works in
 * "change time" mode: the visitor's current slot is marked, and nothing
 * changes until they pick a new slot and press the approve button.
 */
export default function SlotPicker({ days, loading, loadError, submitError, submitting, name, current, onBack, onConfirm }) {
  const { t, lang } = useI18n()
  const rescheduling = Boolean(current)
  const isCurrent = (dayId, slot) => current?.dayId === dayId && current?.slot === slot
  const freeCount = (day) => day.slots.filter((s) => !day.taken.includes(s) && !isCurrent(day.id, s)).length

  const [dayId, setDayId] = useState(() => current?.dayId ?? null)
  const [selected, setSelected] = useState(null)

  // Default to the first day with a free slot once days have loaded.
  const day = days.find((d) => d.id === dayId) || days.find((d) => freeCount(d) > 0) || days[0]

  // If the selected slot gets booked by someone else (via polling), clear it.
  useEffect(() => {
    if (selected && (!day || day.taken.includes(selected))) setSelected(null)
  }, [day, selected])

  const when = (slot) => (days.length > 1 ? `${formatDate(day.date, lang)} ${slot}` : slot)
  const availableCount = day ? freeCount(day) : 0

  let confirmLabel = t.slots.select
  if (submitting) confirmLabel = t.slots.submitting
  else if (selected) confirmLabel = rescheduling ? t.slots.approveChange(when(selected)) : t.slots.confirm(when(selected))

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{rescheduling ? t.slots.rescheduleTitle : t.slots.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t.slots.bookingFor} <span className="font-medium text-slate-700">{name}</span>
          </p>
        </div>
        {!loading && day && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {t.slots.availableOf(availableCount, day.slots.length)}
          </span>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {rescheduling && (
          <Alert tone="info">{t.slots.rescheduleHint(`${formatDate(current.date, lang)} ${current.slot}`)}</Alert>
        )}
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
        ) : !day ? (
          <Alert tone="info">{t.slots.noDays}</Alert>
        ) : availableCount === 0 ? (
          <Alert tone="info">
            {days.length > 1 ? t.slots.dayFull : rescheduling ? t.slots.noOtherSlots : t.slots.fullyBooked}
          </Alert>
        ) : null}

        {!loading && days.length > 1 && (
          <div role="tablist" aria-label={t.slots.daysLabel} className="flex flex-wrap gap-2">
            {days.map((d) => {
              const active = d.id === day.id
              return (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={submitting}
                  onClick={() => {
                    setDayId(d.id)
                    setSelected(null)
                  }}
                  className={`rounded-xl border px-4 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  <span className="block font-semibold">{formatDate(d.date, lang)}</span>
                  <span className={`block text-xs ${active ? 'text-indigo-100' : 'text-slate-500'}`}>
                    {t.slots.freeCount(freeCount(d))}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {!loading && day && (
          <div role="radiogroup" aria-label={t.slots.groupLabel} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {day.slots.map((slot) => {
              const mine = isCurrent(day.id, slot)
              const taken = !mine && day.taken.includes(slot)
              const isSelected = selected === slot
              let style = 'border-slate-300 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-50'
              if (mine) style = 'cursor-not-allowed border-amber-300 bg-amber-50 text-amber-900'
              else if (taken) style = 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
              else if (isSelected) style = 'border-indigo-600 bg-indigo-600 text-white shadow-md'
              return (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={taken || mine || submitting}
                  onClick={() => setSelected(slot)}
                  className={`relative rounded-xl border px-3 py-3 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${style}`}
                >
                  <span className={`block text-lg font-semibold ${taken ? 'line-through' : ''}`}>{slot}</span>
                  <span
                    className={`block text-xs ${
                      mine ? 'text-amber-700' : isSelected ? 'text-indigo-100' : taken ? 'text-slate-400' : 'text-emerald-600'
                    }`}
                  >
                    {mine ? t.slots.current : taken ? t.slots.booked : isSelected ? t.slots.selected : t.slots.available}
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
        <Button onClick={() => onConfirm({ dayId: day.id, date: day.date, slot: selected })} disabled={!selected || submitting}>
          {submitting && <Spinner />} {confirmLabel}
        </Button>
      </div>
    </Card>
  )
}
