import { EVENT } from '../config'
import { Button, Card } from './ui'

export default function Confirmation({ slot, details, onDone }) {
  return (
    <Card className="mx-auto max-w-md text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="mt-5 text-2xl font-bold text-slate-900">Your booking is registered!</h2>
      <p className="mt-2 text-slate-500">
        Thanks, {details.name}. We look forward to seeing you at the {EVENT.title.toLowerCase()}.
      </p>

      <dl className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 text-left text-sm">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">Time</dt>
          <dd className="font-semibold text-slate-900">{slot}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">Name</dt>
          <dd className="font-medium text-slate-900">{details.name}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-slate-500">Phone</dt>
          <dd className="font-medium text-slate-900">{details.phone}</dd>
        </div>
      </dl>

      <Button variant="secondary" className="mt-6 w-full" onClick={onDone}>
        Book another visitor
      </Button>
    </Card>
  )
}
