import { useState, type ChangeEvent, type FormEvent } from 'react'
import { createProperty, type Property } from '../lib/adminStore'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { Alert, Button, Card, Field, Spinner } from './ui'

/** Shown to a logged-in user who has no property yet. */
type Props = { userId: string; onCreated: (property: Property) => void }

export default function PropertySetup({ userId, onCreated }: Props) {
  const { t } = useI18n()
  const [values, setValues] = useState({ title: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      onCreated(await createProperty(userId, values))
    } catch (err) {
      setError(errorText(err, t))
      setBusy(false)
    }
  }

  const update = (key: keyof typeof values) => (e: ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }))

  return (
    <Card className="mx-auto max-w-md">
      <h2 className="text-lg font-semibold text-slate-900">{t.setup.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{t.setup.subtitle}</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field id="title" label={t.setup.propertyTitle} placeholder={t.setup.titlePlaceholder} value={values.title} onChange={update('title')} required />
        <Field id="address" label={t.setup.address} placeholder={t.setup.addressPlaceholder} value={values.address} onChange={update('address')} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" disabled={!values.title.trim() || busy}>
          {busy && <Spinner />} {t.setup.create}
        </Button>
      </form>
    </Card>
  )
}
