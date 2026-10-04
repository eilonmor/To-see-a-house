import { useState, type ChangeEvent, type FormEvent } from 'react'
import { isValidPhone, type GuestDetails } from '../lib/bookingStore'
import { useI18n } from '../i18n/I18nProvider'
import type { Translation } from '../i18n/translations'
import { Button, Card, Field, Spinner } from './ui'

type Errors = Partial<Record<keyof GuestDetails, string>>

function validate({ name, phone }: GuestDetails, t: Translation): Errors {
  const errors: Errors = {}
  if (name.trim().length < 2) errors.name = t.details.nameError
  if (!/^[+\d][\d\s\-()]*$/.test(phone.trim()) || !isValidPhone(phone)) errors.phone = t.details.phoneError
  return errors
}

type Props = { initial: GuestDetails; busy: boolean; onSubmit: (details: GuestDetails) => void }

export default function DetailsForm({ initial, busy, onSubmit }: Props) {
  const { t } = useI18n()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Errors>({})

  const update = (key: keyof GuestDetails) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    if (errors[key]) setErrors((errs) => ({ ...errs, [key]: undefined }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const errs = validate(values, t)
    setErrors(errs)
    if (Object.keys(errs).length === 0) onSubmit({ name: values.name.trim(), phone: values.phone.trim() })
  }

  return (
    <Card className="mx-auto max-w-md">
      <h2 className="text-lg font-semibold text-slate-900">{t.details.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{t.details.subtitle}</p>
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <Field
          id="name"
          label={t.details.name}
          autoComplete="name"
          placeholder={t.details.namePlaceholder}
          value={values.name}
          onChange={update('name')}
          error={errors.name}
        />
        <Field
          id="phone"
          label={t.details.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="050-123-4567"
          value={values.phone}
          onChange={update('phone')}
          error={errors.phone}
        />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Spinner />} {busy ? t.details.checking : t.details.continue}
        </Button>
      </form>
    </Card>
  )
}
