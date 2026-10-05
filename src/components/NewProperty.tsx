import { useState, type ChangeEvent, type FormEvent } from 'react'
import { createProperty } from '../lib/adminStore'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { useAccount } from './AccountGate'
import { Alert, Button, Card, Field, Link, Spinner } from './ui'

/** Creates a property, then opens its editor. Free-plan limits are enforced by the database. */
export default function NewProperty() {
  const { t } = useI18n()
  const { user, reloadProfile } = useAccount()
  const [values, setValues] = useState({ title: '', address: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const property = await createProperty(user.id, values)
      // The free plan's 30-day clock starts now.
      reloadProfile()
      navigate(`/dashboard/p/${property.id}`, { replace: true })
    } catch (err) {
      setError(errorText(err, t))
      setBusy(false)
    }
  }

  const update = (key: keyof typeof values) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    setError('')
  }

  return (
    <div className="space-y-4 pt-6">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800">
        {t.editor.back}
      </Link>
      <Card className="mx-auto max-w-md">
        <h1 className="text-lg font-semibold text-slate-900">{t.setup.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.setup.subtitle}</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Field
            id="title"
            label={t.setup.propertyTitle}
            placeholder={t.setup.titlePlaceholder}
            value={values.title}
            onChange={update('title')}
            autoFocus
            required
          />
          <Field id="address" label={t.setup.address} placeholder={t.setup.addressPlaceholder} value={values.address} onChange={update('address')} />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="w-full" disabled={!values.title.trim() || busy}>
            {busy && <Spinner />} {t.setup.create}
          </Button>
        </form>
      </Card>
    </div>
  )
}
