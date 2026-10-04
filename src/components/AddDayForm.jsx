import { useState } from 'react'
import { addDay } from '../lib/adminStore'
import { israelToday } from '../lib/bookingStore'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Field, Spinner } from './ui'

const EMPTY = { date: '', startTime: '17:00', endTime: '18:30', slotMinutes: '10' }

/** Adds an open-house date to the property. */
export default function AddDayForm({ propertyId, onAdded }) {
  const { t } = useI18n()
  const [values, setValues] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const update = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (values.endTime <= values.startTime) return setError(t.addDay.endBeforeStart)
    setBusy(true)
    setError('')
    try {
      await addDay(propertyId, { ...values, slotMinutes: Number(values.slotMinutes) })
      setValues((v) => ({ ...v, date: '' }))
      await onAdded()
    } catch (err) {
      setError(errorText(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">{t.addDay.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{t.addDay.help}</p>
      <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field id="day-date" label={t.addDay.date} type="date" min={israelToday()} value={values.date} onChange={update('date')} required />
        <Field id="day-start" label={t.addDay.start} type="time" value={values.startTime} onChange={update('startTime')} required />
        <Field id="day-end" label={t.addDay.end} type="time" value={values.endTime} onChange={update('endTime')} required />
        <Field
          id="day-minutes"
          label={t.addDay.minutes}
          type="number"
          min={5}
          max={240}
          step={5}
          value={values.slotMinutes}
          onChange={update('slotMinutes')}
          required
        />
        {error && (
          <div className="col-span-full">
            <Alert>{error}</Alert>
          </div>
        )}
        <div className="col-span-full flex justify-end">
          <Button type="submit" disabled={!values.date || busy}>
            {busy && <Spinner />} {t.addDay.submit}
          </Button>
        </div>
      </form>
    </Card>
  )
}
