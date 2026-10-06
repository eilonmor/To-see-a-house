import { useState, type ChangeEvent, type FormEvent } from 'react'
import { createProperty, type PropertyOwner } from '../lib/adminStore'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import { useAccount } from './AccountGate'
import { Alert, Button, Card, Field, Link, Spinner } from './ui'

const OWNERS: PropertyOwner[] = ['agency', 'me']

/** Creates a property, then opens its editor. Free-plan limits are enforced by the database. */
export default function NewProperty() {
  const { t } = useI18n()
  const { profile, reloadProfile } = useAccount()
  const [values, setValues] = useState({ title: '', address: '' })
  // Agency members choose who owns the property; the agency by default.
  const [owner, setOwner] = useState<PropertyOwner>(profile.orgId ? 'agency' : 'me')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const property = await createProperty(profile, values, profile.orgId ? owner : 'me')
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
          {profile.orgId && (
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-slate-700">{t.setup.owner}</legend>
              <div className="grid grid-cols-2 gap-3">
                {OWNERS.map((option) => {
                  const checked = owner === option
                  const text = option === 'agency' ? t.setup.ownerAgency : t.setup.ownerMe
                  return (
                    <label
                      key={option}
                      className={`cursor-pointer rounded-xl border px-4 py-3 transition has-focus-visible:ring-2 has-focus-visible:ring-indigo-500 ${
                        checked ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="owner"
                        value={option}
                        checked={checked}
                        onChange={() => setOwner(option)}
                        className="sr-only"
                      />
                      <span className={`block font-semibold ${checked ? 'text-indigo-700' : 'text-slate-900'}`}>{text.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{text.body}</span>
                    </label>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{t.setup.ownerFinal}</p>
            </fieldset>
          )}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" className="w-full" disabled={!values.title.trim() || busy}>
            {busy && <Spinner />} {t.setup.create}
          </Button>
        </form>
      </Card>
    </div>
  )
}
