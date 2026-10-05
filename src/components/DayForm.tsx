import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { NewDay } from '../lib/adminStore'
import { israelToday } from '../lib/bookingStore'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Field, Spinner } from './ui'

const DEFAULTS = { date: '', startTime: '17:00', endTime: '18:30', slotMinutes: '10' }

/**
 * An open-house date: date, hours and minutes per visit. Adds a new day, or
 * edits one when `initial` is set. `onSubmit` throws to show an error.
 */
type Props = {
  idPrefix: string
  initial?: NewDay
  disabled?: boolean
  onSubmit: (day: NewDay) => Promise<void>
  onCancel?: () => void
}

export default function DayForm({ idPrefix, initial, disabled = false, onSubmit, onCancel }: Props) {
  const { t } = useI18n()
  const [values, setValues] = useState(initial ? { ...initial, slotMinutes: String(initial.slotMinutes) } : DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const update = (key: keyof typeof DEFAULTS) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    setError('')
  }

  const setTime = (key: 'startTime' | 'endTime') => (time: string) => {
    setValues((v) => ({ ...v, [key]: time }))
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (values.endTime <= values.startTime) return setError(t.addDay.endBeforeStart)
    setBusy(true)
    setError('')
    try {
      await onSubmit({ ...values, slotMinutes: Number(values.slotMinutes) })
      if (!initial) setValues((v) => ({ ...v, date: '' }))
    } catch (err) {
      setError(errorText(err, t))
    } finally {
      setBusy(false)
    }
  }

  const id = (name: string) => `${idPrefix}-${name}`
  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Field id={id('date')} label={t.addDay.date} type="date" min={israelToday()} value={values.date} onChange={update('date')} disabled={disabled} required />
      <TimeField id={id('start')} label={t.addDay.start} value={values.startTime} onChange={setTime('startTime')} disabled={disabled} />
      <TimeField id={id('end')} label={t.addDay.end} value={values.endTime} onChange={setTime('endTime')} disabled={disabled} />
      <Field
        id={id('minutes')}
        label={t.addDay.minutes}
        type="number"
        min={5}
        max={240}
        step={5}
        value={values.slotMinutes}
        onChange={update('slotMinutes')}
        disabled={disabled}
        required
      />
      {error && (
        <div className="col-span-full">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="col-span-full flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            {t.addDay.cancel}
          </Button>
        )}
        <Button type="submit" disabled={!values.date || busy || disabled}>
          {busy && <Spinner />} {initial ? t.addDay.save : t.addDay.submit}
        </Button>
      </div>
    </form>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const selectClass =
  'block w-full rounded-xl border border-slate-300 bg-white px-2 py-2.5 text-center text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50'

/**
 * A 24-hour 'HH:MM' picker. <input type="time"> follows the device's clock
 * format (AM/PM on many), so hours and minutes are two selects instead.
 */
function TimeField({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled: boolean; onChange: (time: string) => void }) {
  const { t } = useI18n()
  const [hour, minute] = value.split(':')
  // A saved time off the 5-minute grid (e.g. 17:07) stays selectable.
  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div dir="ltr" className="flex items-center gap-1">
        <select id={id} aria-label={`${label}: ${t.addDay.hour}`} value={hour} onChange={(e) => onChange(`${e.target.value}:${minute}`)} disabled={disabled} className={selectClass}>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="font-semibold text-slate-500">:</span>
        <select aria-label={`${label}: ${t.addDay.minute}`} value={minute} onChange={(e) => onChange(`${hour}:${e.target.value}`)} disabled={disabled} className={selectClass}>
          {minutes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
