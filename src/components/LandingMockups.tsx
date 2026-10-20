// Mockups of the real screens for the landing page: the visitor page (details,
// SMS code, slot picker, confirmation) and the dashboard's day table. They copy
// the look of BookingPage / SlotPicker / Confirmation / PropertyEditor, filled
// with sample data from t.landing.demo.

import type { ReactNode } from 'react'
import { formatDate, israelToday } from '../lib/bookingStore'
import { useI18n } from '../i18n/I18nProvider'
import { LANGUAGES } from '../i18n/translations'

export type DemoDay = { date: string; times: string[]; taken: string[] }

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Two sample viewing days: next Tuesday evening and the Thursday morning after it. */
export function demoDays(): DemoDay[] {
  const today = israelToday()
  const tuesday = addDays(today, (2 - new Date(`${today}T00:00:00Z`).getUTCDay() + 7) % 7 || 7)
  return [
    { date: tuesday, times: ['17:00', '17:15', '17:30', '17:45', '18:00', '18:15', '18:30', '18:45'], taken: ['17:00', '17:30', '17:45', '18:15'] },
    { date: addDays(tuesday, 2), times: ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45'], taken: ['10:30', '11:15'] },
  ]
}

const DEMO_PHONES = ['054-7712345', '052-3345678', '050-9981234', '053-4456789']
export const GUEST_PHONE = '052-8876543'

export type DemoRow = { time: string; booked: false } | { time: string; booked: true; name: string; phone: string; note: string }

/** The first six slots of the first day, with the sample visitors in the booked ones. */
export function useDemoRows(day: DemoDay): DemoRow[] {
  const { t } = useI18n()
  let i = 0
  return day.times.slice(0, 6).map((time) => {
    if (!day.taken.includes(time)) return { time, booked: false }
    const n = i++
    return { time, booked: true, name: t.landing.demo.names[n], phone: DEMO_PHONES[n], note: t.landing.demo.notes[n] }
  })
}

export function HouseIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </svg>
  )
}

export function CheckIcon({ className = 'h-4 w-4', strokeWidth = 2.5 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" className="me-1.5 inline h-4 w-4 -translate-y-px fill-slate-400" aria-hidden="true">
      <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
    </svg>
  )
}

/** A 380×760 phone with the visitor page's background. Scale it with CSS zoom. */
export function PhoneFrame({ children, className = '', plain = false }: { children: ReactNode; className?: string; plain?: boolean }) {
  return (
    <div
      className={`relative h-[760px] w-[380px] overflow-hidden rounded-[52px] border-[10px] border-slate-900 text-start text-base leading-normal text-slate-800 ${
        plain ? 'bg-slate-50' : 'bg-linear-to-b from-indigo-50 to-slate-50 to-40%'
      } ${className}`}
    >
      {children}
    </div>
  )
}

function Notch({ className = '' }: { className?: string }) {
  return (
    <div className={`flex h-[34px] items-center justify-center ${className}`}>
      <div className="h-6 w-24 rounded-full bg-slate-900" />
    </div>
  )
}

/** The visitor page above its card: header, property title and the stepper. */
function BookingScreen({ step, children }: { step: 0 | 1; children: ReactNode }) {
  const { t, lang } = useI18n()
  const otherLang = lang === 'he' ? 'en' : 'he'
  return (
    <>
      <Notch />
      <div className="flex items-center justify-between gap-3 px-4 pt-2.5 pb-5">
        <div className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <HouseIcon />
          </span>
          {t.appName}
        </div>
        <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm font-medium text-slate-600 shadow-sm">
          {LANGUAGES[otherLang].label}
        </span>
      </div>
      <div className="flex flex-col gap-6 px-4">
        <div className="pt-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t.landing.demo.propTitle}</h1>
          <p className="mt-2 text-slate-500">{t.landing.demo.address}</p>
        </div>
        <ol className="flex items-center justify-center gap-2 text-sm">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-center gap-2">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                  i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </span>
              {i < 2 && <span className="mx-1 h-px w-6 bg-slate-300" />}
            </li>
          ))}
        </ol>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </>
  )
}

function MockField({ label, children, focused = false, ltr = false, className = '' }: { label: string; children: ReactNode; focused?: boolean; ltr?: boolean; className?: string }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-slate-700">{label}</div>
      <div
        dir={ltr ? 'ltr' : undefined}
        className={`rounded-xl border bg-white px-4 py-2.5 text-slate-900 rtl:text-right ${
          focused ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-300'
        } ${className}`}
      >
        {children}
      </div>
    </div>
  )
}

const mockPrimary = 'flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white'
const mockSecondary = 'flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700'

export function DetailsScreen() {
  const { t } = useI18n()
  return (
    <BookingScreen step={0}>
      <h2 className="text-lg font-semibold text-slate-900">{t.details.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{t.details.subtitle}</p>
      <div className="mt-6 flex flex-col gap-4">
        <MockField label={t.details.name}>{t.landing.demo.guest}</MockField>
        <MockField label={t.details.phone} focused ltr>
          {GUEST_PHONE}
        </MockField>
        <div className={mockPrimary}>{t.details.continue}</div>
      </div>
    </BookingScreen>
  )
}

export function OtpScreen() {
  const { t } = useI18n()
  return (
    <BookingScreen step={0}>
      <h2 className="text-lg font-semibold text-slate-900">{t.otp.title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {t.otp.subtitle}{' '}
        <span dir="ltr" className="font-medium text-slate-700">
          {GUEST_PHONE}
        </span>
      </p>
      <div className="mt-6 flex flex-col gap-4">
        <MockField label={t.otp.code} focused ltr className="tracking-[0.2em]">
          482917
        </MockField>
        <div className={mockPrimary}>{t.otp.verify}</div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium text-indigo-600">{t.otp.changePhone}</span>
        <span className="text-slate-500">{t.otp.resendIn(42)}</span>
      </div>
    </BookingScreen>
  )
}

export type SlotState = { day: number; selected: string | null; setDay: (day: number) => void; setSelected: (slot: string) => void }

/** The slot picker, clickable: switch day and pick a free slot. */
export function SlotsScreen({ days, state, back = false }: { days: DemoDay[]; state: SlotState; back?: boolean }) {
  const { t, lang } = useI18n()
  const day = days[state.day]
  const free = (d: DemoDay) => d.times.length - d.taken.length
  const selected = state.selected && day.times.includes(state.selected) ? state.selected : null

  return (
    <BookingScreen step={1}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t.slots.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t.slots.bookingFor} <span className="font-medium text-slate-700">{t.landing.demo.guest}</span>
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {t.slots.availableOf(free(day), day.times.length)}
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <div role="group" aria-label={t.slots.daysLabel} className="flex flex-wrap gap-2">
          {days.map((d, i) => {
            const active = i === state.day
            return (
              <button
                key={d.date}
                type="button"
                aria-pressed={active}
                onClick={() => state.setDay(i)}
                className={`rounded-xl border px-4 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                  active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400'
                }`}
              >
                <span className="block font-semibold">{formatDate(d.date, lang)}</span>
                <span className={`block text-xs ${active ? 'text-indigo-100' : 'text-slate-500'}`}>{t.slots.freeCount(free(d))}</span>
              </button>
            )
          })}
        </div>
        <div role="radiogroup" aria-label={t.slots.groupLabel} className="grid grid-cols-2 gap-3">
          {day.times.map((time) => {
            const taken = day.taken.includes(time)
            const sel = !taken && selected === time
            return (
              <button
                key={time}
                type="button"
                role="radio"
                aria-checked={sel}
                disabled={taken}
                onClick={() => state.setSelected(time)}
                className={`relative rounded-xl border p-3 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
                  taken
                    ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                    : sel
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-md'
                      : 'border-slate-300 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-50'
                }`}
              >
                <span className={`block text-lg font-semibold ${taken ? 'line-through' : ''}`}>{time}</span>
                <span className={`block text-xs ${sel ? 'text-indigo-100' : taken ? 'text-slate-400' : 'text-emerald-600'}`}>
                  {taken ? t.slots.booked : sel ? t.slots.selected : t.slots.available}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <span className={`${mockPrimary} ${selected ? '' : 'bg-indigo-300!'}`}>
          {selected ? t.slots.confirm(`${formatDate(day.date, lang)} ${selected}`) : t.slots.select}
        </span>
        {back && <span className={mockSecondary}>{t.slots.back}</span>}
      </div>
    </BookingScreen>
  )
}

export function ConfirmationScreen({ date, time }: { date: string; time: string }) {
  const { t, lang } = useI18n()
  const c = t.confirmation
  const rows: [string, string, boolean?][] = [
    [c.date, formatDate(date, lang, { weekday: 'long', day: 'numeric', month: 'long' })],
    [c.time, time],
    [c.name, t.landing.demo.guest],
    [c.phone, GUEST_PHONE, true],
  ]
  return (
    <>
      <Notch className="absolute inset-x-0 top-0 z-10 bg-slate-50" />
      <div className="px-4 pt-[46px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckIcon className="h-7 w-7" />
          </div>
          <h2 className="mt-3.5 text-[22px] leading-[30px] font-bold text-slate-900">{c.booked.title}</h2>
          <p className="mt-1 text-[15px] text-slate-500">{c.booked.body(t.landing.demo.guest)}</p>
          <dl className="mt-4 rounded-xl border border-slate-200 bg-slate-50 text-start text-sm">
            {rows.map(([label, value, ltr], i) => (
              <div key={label} className={`flex justify-between px-4 py-[9px] ${i ? 'border-t border-slate-100' : ''}`}>
                <dt className="text-slate-500">{label}</dt>
                <dd dir={ltr ? 'ltr' : undefined} className={`text-slate-900 ${i < 2 ? 'font-semibold' : 'font-medium'}`}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3.5 text-start">
            <h3 className="text-sm font-semibold text-indigo-900">{c.instructionsTitle}</h3>
            <p dir="auto" className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-slate-700">
              {t.landing.demo.instructions}
              {'\n'}
              <span dir="ltr" className="font-medium text-indigo-600 underline">
                https://waze.com/ul/…
              </span>
            </p>
          </div>
          <div className="mt-4 text-start">
            <h3 className="text-sm font-semibold text-slate-700">{c.calendar.title}</h3>
            <div className="mt-2 flex gap-2">
              <span className={`${mockSecondary} flex-1 px-3! py-[9px]!`}>Google</span>
              <span className={`${mockSecondary} flex-1 px-3! py-[9px]!`}>Apple / Outlook</span>
            </div>
          </div>
          <div className={`${mockSecondary} mt-4 py-[9px]!`}>{c.changeTime}</div>
        </div>
      </div>
    </>
  )
}

/** The property editor's table for one viewing day. */
export function DayTableMock({ day, rows }: { day: DemoDay; rows: DemoRow[] }) {
  const { t, lang } = useI18n()
  const d = t.dashboard
  const booked = day.taken.length
  const th = 'px-4 py-3 text-start text-xs font-semibold tracking-wide text-slate-500 uppercase'
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_40px_-16px_rgba(15,23,42,.18),0_1px_3px_rgba(0,0,0,.06)]">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="font-semibold text-slate-900">{formatDate(day.date, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
        <p dir="ltr" className="mt-0.5 text-sm text-slate-500 rtl:text-right">
          {`${day.times[0]}–19:00 · ${d.everyMinutes(15)} · ${d.bookedOf(booked, day.times.length)}`}
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={`${th} ps-6`}>{d.colTime}</th>
            <th className={th}>{d.colVisitor}</th>
            <th className={th}>{d.colPhone}</th>
            <th className={th}>{d.colNotes}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            r.booked ? (
              <tr key={r.time} className="border-t border-slate-100 bg-white">
                <td className="p-4 ps-6 font-semibold whitespace-nowrap text-slate-900">
                  <ChevronIcon />
                  {r.time}
                </td>
                <td className="p-4 whitespace-nowrap text-slate-800">{r.name}</td>
                <td className="p-4 whitespace-nowrap">
                  <span dir="ltr" className="text-indigo-600">
                    {r.phone}
                  </span>
                </td>
                <td className="max-w-[190px] p-4">
                  {r.note ? (
                    <span dir="auto" className="block truncate text-slate-600">
                      {r.note}
                    </span>
                  ) : (
                    <span className="text-indigo-600">{d.addNote}</span>
                  )}
                </td>
              </tr>
            ) : (
              <tr key={r.time} className="border-t border-slate-100 bg-slate-50/50">
                <td className="p-4 ps-6 font-semibold whitespace-nowrap text-slate-900">{r.time}</td>
                <td colSpan={3} className="p-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {d.availableBadge}
                  </span>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
