import { useState, type ChangeEvent, type FormEvent } from 'react'
import { MIN_PASSWORD_LENGTH, signUp, type AccountType, type SignUpDetails } from '../lib/auth'
import { isValidPhone } from '../lib/bookingStore'
import { navigate } from '../hooks/useRoute'
import { errorText, useI18n } from '../i18n/I18nProvider'
import type { Translation } from '../i18n/translations'
import { Alert, Button, Card, Field, Link, Spinner } from './ui'
import GoogleButton from './GoogleButton'

type Errors = Partial<Record<keyof SignUpDetails, string>>

function validate({ fullName, phone, password }: SignUpDetails, t: Translation): Errors {
  const errors: Errors = {}
  if (fullName.trim().length < 2) errors.fullName = t.signup.nameError
  if (phone.trim() && !isValidPhone(phone)) errors.phone = t.signup.phoneError
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = t.signup.passwordError(MIN_PASSWORD_LENGTH)
  return errors
}

const ACCOUNT_TYPES: AccountType[] = ['personal', 'agent']

export default function SignupPage() {
  const { t } = useI18n()
  const [values, setValues] = useState<SignUpDetails>({ accountType: 'personal', fullName: '', phone: '', email: '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // The address a confirmation link was sent to, when Supabase requires one.
  const [sentTo, setSentTo] = useState('')

  const update = (key: Exclude<keyof SignUpDetails, 'accountType'>) => (e: ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    if (errors[key]) setErrors((errs) => ({ ...errs, [key]: undefined }))
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validate(values, t)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    setError('')
    try {
      const { needsConfirmation } = await signUp(values)
      if (needsConfirmation) setSentTo(values.email.trim())
      else navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(errorText(err, t))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <Card className="mx-auto mt-8 max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{t.signup.checkEmail.title}</h1>
        <p className="mt-2 text-slate-500">{t.signup.checkEmail.body(sentTo)}</p>
      </Card>
    )
  }

  return (
    <Card className="mx-auto mt-8 max-w-md">
      <h1 className="text-center text-xl font-semibold text-slate-900">{t.signup.title}</h1>
      <p className="mt-1 text-center text-sm text-slate-500">{t.signup.subtitle}</p>
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-slate-700">{t.signup.accountType}</legend>
          <div className="grid grid-cols-2 gap-3">
            {ACCOUNT_TYPES.map((type) => {
              const checked = values.accountType === type
              return (
                <label
                  key={type}
                  className={`cursor-pointer rounded-xl border px-4 py-3 transition has-focus-visible:ring-2 has-focus-visible:ring-indigo-500 ${
                    checked ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    value={type}
                    checked={checked}
                    onChange={() => setValues((v) => ({ ...v, accountType: type }))}
                    className="sr-only"
                  />
                  <span className={`block font-semibold ${checked ? 'text-indigo-700' : 'text-slate-900'}`}>{t.signup[type].title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{t.signup[type].body}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
        <GoogleButton accountType={values.accountType} />
        <Field id="fullName" label={t.signup.fullName} autoComplete="name" value={values.fullName} onChange={update('fullName')} error={errors.fullName} />
        <Field
          id="phone"
          label={t.signup.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="054-1234567"
          value={values.phone}
          onChange={update('phone')}
          error={errors.phone}
        />
        <Field id="email" label={t.login.email} type="email" autoComplete="email" dir="ltr" value={values.email} onChange={update('email')} />
        <div>
          <Field
            id="password"
            label={t.login.password}
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={update('password')}
            error={errors.password}
          />
          {!errors.password && <p className="mt-1.5 text-xs text-slate-500">{t.signup.passwordHelp(MIN_PASSWORD_LENGTH)}</p>}
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" disabled={!values.email || !values.password || busy}>
          {busy && <Spinner />} {t.signup.submit}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        {t.signup.haveAccount}{' '}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline">
          {t.signup.loginLink}
        </Link>
      </p>
    </Card>
  )
}
