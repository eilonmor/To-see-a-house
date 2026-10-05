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
      <Field id={id('start')} label={t.addDay.start} type="time" value={values.startTime} onChange={update('startTime')} disabled={disabled} required />
      <Field id={id('end')} label={t.addDay.end} type="time" value={values.endTime} onChange={update('endTime')} disabled={disabled} required />
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
