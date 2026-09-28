import { useI18n } from '../i18n/I18nProvider'
import { Button, Card } from './ui'

export default function Confirmation({ slot, details, onDone }) {
  const { t } = useI18n()
  return (
    <Card className="mx-auto max-w-md text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="mt-5 text-2xl font-bold text-slate-900">{t.confirmation.title}</h2>
      <p className="mt-2 text-slate-500">{t.confirmation.thanks(details.name)}</p>

      <dl className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 text-start text-sm">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">{t.confirmation.time}</dt>
          <dd className="font-semibold text-slate-900">{slot}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">{t.confirmation.name}</dt>
          <dd className="font-medium text-slate-900">{details.name}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">{t.confirmation.phone}</dt>
          <dd className="font-medium text-slate-900" dir="ltr">
            {details.phone}
          </dd>
        </div>
      </dl>

      <Button variant="secondary" className="mt-6 w-full" onClick={onDone}>
        {t.confirmation.another}
      </Button>
    </Card>
  )
}
