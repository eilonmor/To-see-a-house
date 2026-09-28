import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider'
import { Button, Card, Field } from './ui'

function validate({ name, phone }, t) {
  const errors = {}
  if (name.trim().length < 2) errors.name = t.details.nameError
  const digits = phone.replace(/\D/g, '')
  if (!/^[+\d][\d\s\-()]*$/.test(phone.trim()) || digits.length < 7 || digits.length > 15) {
    errors.phone = t.details.phoneError
  }
  return errors
}

export default function DetailsForm({ initial, onSubmit }) {
  const { t } = useI18n()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})

  const update = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    if (errors[key]) setErrors((errs) => ({ ...errs, [key]: undefined }))
  }

  function handleSubmit(e) {
    e.preventDefault()
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
        <Button type="submit" className="w-full">
          {t.details.continue}
        </Button>
      </form>
    </Card>
  )
}
