import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { CalendarCheck, CalendarClock, ChevronDown, Languages, Link as LinkIcon, MapPin, PhoneMissed, ShieldCheck, StickyNote, Table, Users, type LucideIcon } from 'lucide-react'
import { CONTACT_EMAIL } from '../config'
import { useI18n } from '../i18n/I18nProvider'
import { LANGUAGES } from '../i18n/translations'
import { fetchPlans, formatPrice, type Period } from '../lib/billingStore'
import { formatDate } from '../lib/bookingStore'
import { isConfigured } from '../lib/supabase'
import { SetupBanner } from './Layout'
import { Link } from './ui'
import {
  CheckIcon,
  ConfirmationScreen,
  DayTableMock,
  DetailsScreen,
  HouseIcon,
  OtpScreen,
  PhoneFrame,
  SlotsScreen,
  demoDays,
  useDemoRows,
  type SlotState,
} from './LandingMockups'

type Audience = 'owners' | 'agents'
type PlanKey = 'agent' | 'office2' | 'office5'
type PlanPrice = { price: number; list: number; discount: number }
type Prices = Record<PlanKey, Record<Period, PlanPrice>>

const PLAN_CODES: Record<PlanKey, Record<Period, string>> = {
  agent: { month: 'agent_monthly', year: 'agent_yearly' },
  office2: { month: 'agency_small_monthly', year: 'agency_small_yearly' },
  office5: { month: 'agency_large_monthly', year: 'agency_large_yearly' },
}

// Shown until the plans table loads, or if it can't be read: the prices seeded
// in supabase/migrations/20261012000000_payments.sql (₪, final, no VAT).
const SEEDED_PRICES: Prices = {
  agent: { month: { price: 23, list: 33, discount: 30 }, year: { price: 216, list: 309, discount: 30 } },
  office2: { month: { price: 60, list: 92, discount: 35 }, year: { price: 576, list: 886, discount: 35 } },
  office5: { month: { price: 120, list: 185, discount: 35 }, year: { price: 1152, list: 1772, discount: 35 } },
}

/** The plans' prices, from the plans table (readable without logging in), so they match checkout. */
function usePrices(): Prices {
  const [prices, setPrices] = useState(SEEDED_PRICES)
  useEffect(() => {
    if (!isConfigured) return
    let active = true
    fetchPlans().then(
      (plans) => {
        if (!active) return
        const byCode = new Map(plans.map((p) => [p.code, p]))
        const price = (key: PlanKey, period: Period): PlanPrice => {
          const p = byCode.get(PLAN_CODES[key][period])
          return p ? { price: p.price, list: p.listPrice, discount: p.discountPercent } : SEEDED_PRICES[key][period]
        }
        const plan = (key: PlanKey) => ({ month: price(key, 'month'), year: price(key, 'year') })
        setPrices({ agent: plan('agent'), office2: plan('office2'), office5: plan('office5') })
      },
      () => {},
    )
    return () => {
      active = false
    }
  }, [])
  return prices
}

const FEATURE_ICONS: LucideIcon[] = [LinkIcon, CalendarCheck, ShieldCheck, MapPin, Table, StickyNote, CalendarClock, Users, Languages]
const CHAT_NAME_COLORS = ['text-indigo-700', 'text-emerald-700', 'text-amber-700', 'text-rose-700']

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'
const primaryBtn = `inline-flex items-center justify-center rounded-xl bg-indigo-600 font-semibold text-white transition hover:bg-indigo-700 ${focusRing}`
const secondaryBtn = `inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 ${focusRing}`
const container = 'mx-auto max-w-[1160px] px-5 sm:px-8'
const sectionPad = 'py-14 sm:py-20 lg:py-24'

/** The marketing page at "/": what the app does, for owners and for agents, and the prices. */
export default function Landing({ loggedIn }: { loggedIn: boolean }) {
  const { t, lang, dir } = useI18n()
  const L = t.landing
  const arrow = dir === 'rtl' ? '←' : '→'
  const ctaHref = loggedIn ? '/dashboard' : '/signup'

  const [audience, setAudience] = useState<Audience>('owners')
  const days = useMemo(demoDays, [])
  const [day, setDay] = useState(0)
  const [selected, setSelected] = useState<string | null>('18:00')
  const slots: SlotState = {
    day,
    selected,
    setDay: (i) => {
      setDay(i)
      setSelected(null)
    },
    setSelected,
  }
  const rows = useDemoRows(days[0])

  const heroRef = useRef<HTMLElement>(null)
  const endRef = useRef<HTMLElement>(null)
  const sticky = useStickyBar(heroRef, endRef)
  const prices = usePrices()

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 text-slate-800">
      <Header loggedIn={loggedIn} />
      <SetupBanner className="mt-4" />

      <main>
        {/* Hero */}
        <section ref={heroRef} className="bg-linear-to-b from-indigo-50 to-slate-50 to-85%">
          <div className={`${container} flex flex-col gap-9 pt-7 pb-12 sm:pt-12 lg:flex-row lg:items-center lg:gap-16 lg:pt-[72px] lg:pb-[88px]`}>
            <div className="min-w-0 lg:flex-1">
              <span className="inline-flex items-center rounded-full border border-indigo-100 bg-white px-3 py-1 text-sm font-medium text-indigo-700">
                {L.hero.badge}
              </span>
              <h1 className="mt-5 text-[36px] leading-[1.1] font-bold tracking-[-0.03em] text-balance text-slate-900 sm:text-5xl lg:text-[58px]">
                {L.hero.title}
                <span className="text-indigo-600">{L.hero.titleAccent}</span>
              </h1>
              <p className="mt-[18px] max-w-[500px] text-[17px] leading-relaxed text-pretty text-slate-600 sm:text-xl">{L.hero.subtitle}</p>
              <div className="mt-8 flex max-w-[460px] flex-wrap gap-3">
                <Link
                  href={ctaHref}
                  className={`${primaryBtn} min-h-[52px] flex-[1_1_180px] px-[22px] py-3 text-base shadow-[0_4px_6px_-1px_rgba(79,70,229,.25),0_2px_4px_-2px_rgba(79,70,229,.25)]`}
                >
                  {loggedIn ? L.myProperties : L.signupFree}
                </Link>
                <a href="#audience" onClick={() => setAudience('agents')} className={`${secondaryBtn} min-h-[52px] flex-[1_1_180px] gap-2 px-[22px] py-3 text-base`}>
                  {L.hero.forAgents} <span aria-hidden="true">{arrow}</span>
                </a>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-lg text-slate-600">
                {L.hero.checks.map((check) => (
                  <li key={check} className="flex items-center gap-2">
                    <CheckIcon className="h-5 w-5 text-emerald-600" />
                    {check}
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 lg:flex-1">
              {/* Desktop: the dashboard table with the visitor's phone in front of it. */}
              <div className="relative hidden h-[630px] lg:block">
                <div className="absolute start-0 top-0 w-[600px] [zoom:0.86]">
                  <DayTableMock day={days[0]} rows={rows} />
                </div>
                <div className="absolute end-0 top-[242px] [zoom:0.62]">
                  <PhoneFrame className="shadow-[0_40px_80px_-24px_rgba(15,23,42,.4)]">
                    <SlotsScreen days={days} state={slots} back />
                  </PhoneFrame>
                </div>
              </div>
              {/* Mobile: the phone, fading out at the bottom, and today's visitors on top of it. */}
              <div className="relative mx-auto w-fit pb-2 lg:hidden">
                <div className="h-[680px] overflow-hidden [zoom:0.8] mask-b-from-78%">
                  <PhoneFrame className="shadow-[0_40px_80px_-24px_rgba(15,23,42,.4)]">
                    <SlotsScreen days={days} state={slots} back />
                  </PhoneFrame>
                </div>
                <div className="absolute -start-6 bottom-7 w-[214px] rounded-[14px] border border-slate-200 bg-white px-3.5 py-3 text-[13px] leading-[18px] shadow-[0_20px_40px_-12px_rgba(15,23,42,.25)]">
                  <div className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                    <span>{L.demo.comingOn(formatDate(days[0].date, lang, { weekday: 'short' }))}</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">{L.demo.visitors(days[0].taken.length)}</span>
                  </div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {rows
                      .filter((r) => r.booked)
                      .slice(0, 3)
                      .map((r) => (
                        <div key={r.time} className="flex items-center gap-2">
                          <span className="w-[38px] font-semibold text-slate-900">{r.time}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-800">{r.booked && r.name}</span>
                          <span dir="ltr" className="text-xs text-indigo-600">
                            {r.booked && r.phone}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-slate-100 bg-white">
          <Reveal className={`${container} ${sectionPad}`}>
            <SectionTitle title={L.how.title} subtitle={L.how.subtitle} />
            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {L.how.steps.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-9 w-9 place-items-center rounded-full font-bold text-white ${i === 2 ? 'bg-emerald-500' : 'bg-indigo-600'}`}>{i + 1}</span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
                  <h3 className="mt-5 text-[19px] leading-snug font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{step.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        <AudienceSection audience={audience} setAudience={setAudience} loggedIn={loggedIn} agentPrice={prices.agent.month} />
        <BeforeAfterSection day={days[0]} rows={rows} />

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-t border-slate-100 bg-slate-50">
          <Reveal className={`${container} ${sectionPad}`}>
            <SectionTitle title={L.features.title} subtitle={L.features.subtitle} />
            <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {L.features.items.map((feature, i) => {
                const Icon = FEATURE_ICONS[i]
                return (
                  <li key={feature.title} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,.06)] sm:p-6">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600 sm:h-11 sm:w-11">
                      <Icon className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" strokeWidth={2} aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 text-[15px] leading-snug font-semibold text-slate-900 sm:mt-4 sm:text-[17px]">{feature.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-500 sm:mt-1.5 sm:text-[15px]">{feature.body}</p>
                  </li>
                )
              })}
            </ul>
          </Reveal>
        </section>

        <VisitorsSection days={days} slots={slots} />
        <PricingSection loggedIn={loggedIn} prices={prices} />
        <FaqSection />

        {/* Final call to action */}
        <section ref={endRef} className="bg-slate-50">
          <div className={`${container} pb-12 lg:pb-20`}>
            <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-indigo-600 p-8 shadow-[0_30px_60px_-30px_rgba(67,56,202,.6)] sm:p-12 lg:p-14">
              <div className="min-w-0 flex-[1_1_380px]">
                <h2 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-balance text-white sm:text-[36px]">{L.final.title}</h2>
                <p className="mt-2.5 text-[17px] leading-relaxed text-indigo-100">{L.final.subtitle}</p>
              </div>
              <div className="flex w-full max-w-[360px] flex-wrap gap-3">
                <Link
                  href={ctaHref}
                  className="flex min-h-[52px] flex-[1_1_150px] items-center justify-center rounded-xl bg-white px-[22px] py-3 text-base font-semibold text-indigo-700 transition hover:bg-indigo-50 hover:text-indigo-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
                >
                  {loggedIn ? L.myProperties : L.signupFree}
                </Link>
                {!loggedIn && (
                  <Link
                    href="/login"
                    className="flex min-h-[52px] flex-[1_1_120px] items-center justify-center rounded-xl border border-white/50 px-[22px] py-3 text-base font-semibold text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {L.login}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className={`${container} flex flex-wrap items-center justify-between gap-x-6 gap-y-4 pt-7 pb-8 text-sm text-slate-500`}>
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-indigo-600 text-white">
              <HouseIcon className="h-4 w-4" />
            </span>
            {t.appName}
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-1">
            <a href="#pricing" className="inline-flex min-h-8 items-center text-slate-600 hover:text-slate-900">
              {L.footer.pricing}
            </a>
            <a href="#faq" className="inline-flex min-h-8 items-center text-slate-600 hover:text-slate-900">
              {L.footer.faq}
            </a>
            {loggedIn ? (
              <Link href="/dashboard" className="inline-flex min-h-8 items-center text-slate-600 hover:text-slate-900">
                {L.myProperties}
              </Link>
            ) : (
              <>
                <Link href="/login" className="inline-flex min-h-8 items-center text-slate-600 hover:text-slate-900">
                  {L.login}
                </Link>
                <Link href="/signup" className="inline-flex min-h-8 items-center text-slate-600 hover:text-slate-900">
                  {L.signup}
                </Link>
              </>
            )}
            <Link href="/terms" className="inline-flex min-h-8 items-center text-slate-600 hover:text-slate-900">
              {t.legal.terms}
            </Link>
            <Link href="/privacy" className="inline-flex min-h-8 items-center text-slate-600 hover:text-slate-900">
              {t.legal.privacy}
            </Link>
          </nav>
          <span>{L.footer.copyright(new Date().getFullYear())}</span>
        </div>
      </footer>

      {/* Mobile: a sign-up bar once the hero has scrolled away, hidden again at the final call to action. */}
      <div
        inert={!sticky}
        className={`fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(15,23,42,.18)] backdrop-blur-[10px] transition-transform duration-300 md:hidden ${
          sticky ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="min-w-0 flex-1 text-[13px] leading-[1.35] text-slate-600">
          <strong className="block text-sm text-slate-900">{L.sticky.title}</strong>
          {L.sticky.sub}
        </div>
        <Link href={ctaHref} className={`${primaryBtn} min-h-12 flex-none px-5 py-3 text-base`}>
          {loggedIn ? L.myProperties : L.signupFree}
        </Link>
      </div>
    </div>
  )
}

function Header({ loggedIn }: { loggedIn: boolean }) {
  const { t, lang, setLang } = useI18n()
  const otherLang = lang === 'he' ? 'en' : 'he'
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-indigo-50/88 backdrop-blur-[10px]">
      <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <Link
          href="/"
          onClick={(e) => {
            // Already on "/", where navigate() does nothing: scroll up and drop any #section.
            e.preventDefault()
            window.history.replaceState(null, '', '/')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className="flex min-w-0 items-center gap-2 font-semibold text-slate-900"
        >
          <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <HouseIcon />
          </span>
          {/* Too wide next to the buttons on narrow phones, so there it's for screen readers only. */}
          <span className="whitespace-nowrap max-[440px]:sr-only">{t.appName}</span>
        </Link>
        <nav className="flex items-center gap-1.5 text-sm sm:gap-3.5">
          <button
            type="button"
            onClick={() => setLang(otherLang)}
            lang={otherLang}
            className={`min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 shadow-sm hover:bg-slate-50 ${focusRing}`}
          >
            {LANGUAGES[otherLang].label}
          </button>
          {loggedIn ? (
            <Link href="/dashboard" className={`${primaryBtn} min-h-10 px-4 py-2 whitespace-nowrap`}>
              {t.landing.myProperties}
            </Link>
          ) : (
            <>
              <Link href="/login" className="inline-flex min-h-11 items-center px-1 font-medium whitespace-nowrap text-slate-600 hover:text-slate-900">
                {t.landing.login}
              </Link>
              <Link href="/signup" className={`${primaryBtn} min-h-10 px-4 py-2 whitespace-nowrap shadow-sm`}>
                {t.landing.signup}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h2 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-balance text-slate-900 sm:text-[32px] lg:text-[38px]">{title}</h2>
      <p className="mt-3 max-w-[620px] text-base leading-relaxed text-slate-500 sm:text-lg">{subtitle}</p>
    </>
  )
}

function AudienceSection({
  audience,
  setAudience,
  loggedIn,
  agentPrice,
}: {
  audience: Audience
  setAudience: (a: Audience) => void
  loggedIn: boolean
  agentPrice: PlanPrice
}) {
  const { t, lang, dir } = useI18n()
  const L = t.landing
  const A = L.audience[audience]
  const isAgents = audience === 'agents'
  const tabs: [Audience, string][] = [
    ['owners', L.audience.tabOwners],
    ['agents', L.audience.tabAgents],
  ]

  // Arrow keys (mirrored in RTL), Home and End move between the tabs.
  function onTabsKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex(([key]) => key === audience)
    const next = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const prev = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
    const to = e.key === next ? (i + 1) % tabs.length : e.key === prev ? (i - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    setAudience(tabs[to][0])
    document.getElementById(`audience-tab-${tabs[to][0]}`)?.focus()
  }

  return (
    <section id="audience" className="scroll-mt-20 border-t border-slate-100 bg-slate-50">
      <Reveal className={`${container} ${sectionPad}`}>
        <SectionTitle title={L.audience.title} subtitle={L.audience.subtitle} />
        <div role="tablist" onKeyDown={onTabsKeyDown} className="mt-7 flex w-fit max-w-full gap-1 rounded-[14px] border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`audience-tab-${key}`}
              aria-selected={audience === key}
              tabIndex={audience === key ? 0 : -1}
              aria-controls="audience-panel"
              onClick={() => setAudience(key)}
              className={`min-h-11 flex-auto rounded-[10px] px-[18px] py-2.5 text-[15px] font-semibold whitespace-nowrap transition ${focusRing} ${
                audience === key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id="audience-panel"
          aria-labelledby={`audience-tab-${audience}`}
          className="mt-5 flex flex-wrap gap-6 rounded-[20px] border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,.06)] sm:p-9 lg:gap-12 lg:p-11"
        >
          <div className="min-w-0 flex-[1_1_420px]">
            <h3 className="text-[21px] leading-snug font-bold text-balance text-slate-900 sm:text-[26px]">{A.title}</h3>
            <p className="mt-2.5 max-w-[560px] text-base leading-relaxed text-pretty text-slate-500">{A.pain}</p>
            <ul className="mt-7 flex flex-col gap-[18px]">
              {A.items.map((item) => (
                <li key={item.lead} className="flex items-start gap-3">
                  <span className="mt-px grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckIcon className="h-[15px] w-[15px]" strokeWidth={3} />
                  </span>
                  <div className="text-base leading-normal">
                    <strong className="font-semibold text-slate-900">{item.lead}</strong> <span className="text-slate-600">{item.body}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex max-w-full flex-[1_1_280px] flex-col gap-1.5 self-start rounded-2xl bg-indigo-50 p-6">
            <span className="text-sm font-medium text-indigo-700">{A.plan}</span>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[36px] leading-[1.1] font-bold tracking-[-0.02em] text-slate-900">
                {isAgents ? formatPrice(agentPrice.price, lang) : L.pricing.free}
              </span>
              {isAgents && (
                <>
                  <span className="text-[15px] text-slate-600">{L.pricing.per.month}</span>
                  {agentPrice.list > agentPrice.price && <s className="text-[15px] text-slate-500">{formatPrice(agentPrice.list, lang)}</s>}
                </>
              )}
            </div>
            <span className="text-[15px] text-slate-600">{A.includes}</span>
            <Link href={loggedIn ? '/dashboard' : '/signup'} className={`${primaryBtn} mt-4 min-h-[50px] px-5 py-3 text-base`}>
              {loggedIn ? L.myProperties : isAgents ? L.signupAgent : L.signupFree}
            </Link>
            <a href="#pricing" className="flex min-h-11 items-center justify-center text-sm font-medium text-indigo-700 hover:underline">
              {A.more}
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function BeforeAfterSection({ day, rows }: { day: ReturnType<typeof demoDays>[number]; rows: ReturnType<typeof useDemoRows> }) {
  const { t, lang } = useI18n()
  const B = t.landing.beforeAfter
  const names = [...new Set(B.chat.map((m) => m.name))]
  const bubble = 'max-w-[86%] self-start rounded-[14px] rounded-ss-[4px] border border-slate-200 bg-white px-3 py-2'

  return (
    <section id="before-after" className="border-t border-slate-100 bg-white">
      <Reveal className={`${container} ${sectionPad}`}>
        <SectionTitle title={B.title} subtitle={B.subtitle} />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-[20px] border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-rose-50 px-3 py-1 text-[13px] font-semibold text-rose-700">{B.before}</span>
              <h3 className="text-lg font-semibold text-slate-900">{B.beforeTitle}</h3>
            </div>
            <div aria-hidden="true" className="flex flex-1 flex-col gap-2 rounded-[14px] bg-slate-100 p-3.5 text-[15px] leading-[1.45]">
              {B.chat.map((m, i) => (
                <Fragment key={i}>
                  {i === 3 && (
                    <div className="flex items-center gap-1.5 self-center rounded-full bg-rose-50 px-3 py-1 text-[13px] font-medium text-rose-700">
                      <PhoneMissed className="h-[15px] w-[15px]" />
                      {B.missedCalls(3)}
                    </div>
                  )}
                  <div className={bubble}>
                    <div className={`text-xs font-semibold ${CHAT_NAME_COLORS[names.indexOf(m.name) % CHAT_NAME_COLORS.length]}`}>{m.name}</div>
                    {m.text}
                    <div className="text-end text-[11px] text-slate-500">{m.time}</div>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-[20px] border border-indigo-200 bg-white p-5 shadow-[0_10px_30px_-14px_rgba(79,70,229,.25)] sm:p-7">
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-700">{B.after}</span>
              <h3 className="text-lg font-semibold text-slate-900">{B.afterTitle}</h3>
            </div>
            <div aria-hidden="true" className="flex flex-col rounded-[14px] bg-slate-100 p-3.5">
              <div className="max-w-[90%] self-end rounded-[14px] rounded-se-[4px] bg-indigo-100 px-3 py-2.5 text-[15px] leading-normal text-indigo-950">
                {B.linkMessage}
                <div dir="ltr" className="mt-1 text-start font-medium text-indigo-700 underline">
                  …/p/herzl-12
                </div>
                <div className="text-end text-[11px] text-slate-500">09:00</div>
              </div>
            </div>
            <div className="overflow-hidden rounded-[14px] border border-slate-200">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                <span className="text-[15px] font-semibold text-slate-900">{formatDate(day.date, lang)}</span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">{t.dashboard.bookedOf(day.taken.length, day.times.length)}</span>
              </div>
              {rows.map(
                (r) =>
                  r.booked && (
                    <div key={r.time} className="flex items-center gap-3 border-t border-slate-100 px-4 py-[11px] text-[15px]">
                      <span className="w-11 flex-none font-semibold text-slate-900">{r.time}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-800">{r.name}</span>
                      <span dir="ltr" className="inline-flex min-h-7 items-center text-sm text-indigo-600">
                        {r.phone}
                      </span>
                    </div>
                  ),
              )}
            </div>
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <CheckIcon className="h-4 w-4 flex-none text-emerald-600" />
              {B.everyoneGot}
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

function VisitorsSection({ days, slots }: { days: ReturnType<typeof demoDays>; slots: SlotState }) {
  const { t } = useI18n()
  const V = t.landing.visitors
  const [flow, setFlow] = useState(2)
  // The confirmation shows the slot picked on the screen before it (the day's first free slot until one is picked).
  const day = days[slots.day]
  const time = slots.selected ?? day.times.find((time) => !day.taken.includes(time)) ?? day.times[0]
  const screens = [
    <DetailsScreen key="0" />,
    <OtpScreen key="1" />,
    <SlotsScreen key="2" days={days} state={slots} />,
    <ConfirmationScreen key="3" date={day.date} time={time} />,
  ]

  return (
    <section id="visitors" className="border-t border-indigo-100 bg-linear-to-b from-indigo-50 to-slate-50">
      <Reveal className={`${container} ${sectionPad}`}>
        <SectionTitle title={V.title} subtitle={V.subtitle} />
        {/* Mobile: one screen at a time. */}
        <div className="mt-6 grid grid-cols-4 gap-1.5 md:hidden">
          {V.tabs.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={flow === i}
              onClick={() => setFlow(i)}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border text-[15px] leading-tight transition ${focusRing} ${
                flow === i ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <span className="font-bold">{i + 1}</span>
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
        <div className="mt-9 flex flex-wrap justify-center gap-6">
          {screens.map((screen, i) => (
            <figure key={i} className={`${flow === i ? 'flex' : 'hidden'} flex-col items-center gap-3.5 md:flex`}>
              <div className="[zoom:0.8] md:[zoom:0.6]">
                <PhoneFrame plain={i === 3} className="shadow-[0_30px_60px_-24px_rgba(15,23,42,.35)]">
                  {screen}
                </PhoneFrame>
              </div>
              <figcaption className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
                <span className={`grid h-[26px] w-[26px] place-items-center rounded-full text-[13px] ${i === 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                  {i + 1}
                </span>
                {V.captions[i]}
              </figcaption>
            </figure>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

function PricingSection({ loggedIn, prices }: { loggedIn: boolean; prices: Prices }) {
  const { t, lang } = useI18n()
  const P = t.landing.pricing
  const L = t.landing
  const [period, setPeriod] = useState<Period>('month')
  const yearly = period === 'year'
  const cta = (label: string) => (loggedIn ? L.myProperties : label)
  const href = loggedIn ? '/dashboard' : '/signup'

  // The struck-out list price and the discount badge come from the same plan row, like on the billing page.
  const paid = (key: PlanKey) => {
    const plan = prices[key]
    const p = plan[period]
    return {
      price: formatPrice(p.price, lang),
      list: p.list > p.price ? formatPrice(p.list, lang) : undefined,
      badge: p.discount > 0 ? P.discount(p.discount) : undefined,
      note: yearly ? P.perMonthYearly(formatPrice(Math.round((p.price / 12) * 100) / 100, lang)) : P.orYearly(formatPrice(plan.year.price, lang)),
    }
  }

  const periods: [Period, ReactNode][] = [
    ['month', P.monthly],
    [
      'year',
      <>
        {P.yearly} <span className="text-xs font-medium text-emerald-700">{P.yearlyBadge}</span>
      </>,
    ],
  ]

  return (
    <section id="pricing" className="scroll-mt-20 border-t border-slate-100 bg-white">
      <Reveal className={`${container} ${sectionPad}`}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-slate-900 sm:text-[32px] lg:text-[38px]">{P.title}</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-500 sm:text-lg">{P.subtitle}</p>
          </div>
          <div role="radiogroup" aria-label={P.title} className="flex gap-1 rounded-[14px] border border-slate-200 bg-slate-50 p-1">
            {periods.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={period === key}
                onClick={() => setPeriod(key)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-4 py-2 text-[15px] font-semibold transition ${focusRing} ${
                  period === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-9 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <PlanCard name={P.private.name} desc={P.private.desc} price={P.free} note={P.forever} items={P.private.items} cta={cta(L.signupFree)} href={href} />
          <PlanCard
            featured
            name={P.agent.name}
            desc={P.agent.desc}
            per={P.per[period]}
            {...paid('agent')}
            items={P.agent.items}
            cta={cta(L.signupAgent)}
            href={href}
          />
          <PlanCard name={P.office2.name} desc={P.office2.desc} per={P.per[period]} {...paid('office2')} items={P.office2.items} cta={cta(L.setupOffice)} href={href} />
          <PlanCard
            name={P.office5.name}
            desc={P.office5.desc}
            per={P.per[period]}
            {...paid('office5')}
            items={[
              ...P.office5.items,
              <>
                {P.moreAgents}{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-indigo-700 underline">
                  {P.contact}
                </a>
              </>,
            ]}
            cta={cta(L.setupOffice)}
            href={href}
          />
        </div>
        <p className="mt-5 text-center text-sm text-slate-500">{P.cancelNote}</p>
      </Reveal>
    </section>
  )
}

type PlanCardProps = {
  name: string
  desc: string
  price: string
  per?: string
  list?: string
  badge?: string
  note: string
  items: ReactNode[]
  cta: string
  href: string
  featured?: boolean
}

function PlanCard({ name, desc, price, per, list, badge, note, items, cta, href, featured = false }: PlanCardProps) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-[20px] bg-white ${
        featured ? 'border-2 border-indigo-600 p-[15px] shadow-[0_20px_40px_-20px_rgba(79,70,229,.35)] sm:p-[23px]' : 'border border-slate-200 p-4 sm:p-6'
      }`}
    >
      <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{name}</h3>
      <p className="mt-1 text-[13px] text-slate-500 sm:text-sm">{desc}</p>
      <div className="mt-4 flex min-h-11 flex-wrap items-baseline gap-1 sm:mt-5 sm:gap-1.5">
        <span className="text-[28px] leading-none font-bold tracking-[-0.02em] text-slate-900 sm:text-[38px]">{price}</span>
        {per && <span className="text-xs text-slate-600 sm:text-sm">{per}</span>}
        {list && <s className="text-[13px] text-slate-500 sm:text-[15px]">{list}</s>}
        {badge && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:text-xs">{badge}</span>}
      </div>
      <p className="mt-2 min-h-5 text-xs text-slate-500 sm:text-[13px]">{note}</p>
      <ul className="mt-4 flex flex-1 flex-col gap-2 text-[13px] text-slate-700 sm:mt-5 sm:gap-2.5 sm:text-[15px]">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5 sm:gap-2">
            <CheckIcon className="mt-0.5 h-4 w-4 flex-none text-emerald-600 sm:h-[18px] sm:w-[18px]" />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
      <Link href={href} className={`${featured ? primaryBtn : secondaryBtn} mt-5 min-h-12 px-2 text-center text-[13px] sm:mt-6 sm:text-[15px]`}>
        {cta}
      </Link>
    </div>
  )
}

function FaqSection() {
  const { t } = useI18n()
  const F = t.landing.faq
  const [open, setOpen] = useState(0)
  return (
    <section id="faq" className="scroll-mt-20 border-t border-slate-100 bg-slate-50">
      <Reveal className={`mx-auto max-w-[800px] px-5 sm:px-8 ${sectionPad}`}>
        <h2 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-slate-900 sm:text-[32px] lg:text-[38px]">{F.title}</h2>
        <div className="mt-7 border-t border-slate-200">
          {F.items.map((item, i) => (
            <div key={item.q} className="border-b border-slate-200">
              <h3>
                <button
                  type="button"
                  id={`faq-q-${i}`}
                  aria-expanded={open === i}
                  aria-controls={`faq-a-${i}`}
                  onClick={() => setOpen(open === i ? -1 : i)}
                  className="flex min-h-16 w-full items-center justify-between gap-4 py-4 text-start text-[17px] font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {item.q}
                  <ChevronDown className={`h-5 w-5 flex-none text-slate-500 transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </h3>
              {/* Always rendered (hidden when closed), so the button's aria-controls points at it. */}
              <p id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={open !== i} className="max-w-[680px] pb-5 text-base leading-relaxed text-slate-600">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

/** True while the hero is scrolled away and the final call to action isn't on screen yet. */
function useStickyBar(heroRef: RefObject<HTMLElement | null>, endRef: RefObject<HTMLElement | null>): boolean {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const update = () => {
      const hero = heroRef.current?.getBoundingClientRect()
      const end = endRef.current?.getBoundingClientRect()
      if (!hero) return
      const past = hero.bottom < 40
      const atEnd = end ? end.top + 60 < window.innerHeight : false
      setStuck(past && !atEnd)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [heroRef, endRef])
  return stuck
}

/** Fades and slides its content in the first time it scrolls into view (unless the user prefers reduced motion). */
function Reveal({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return setShown(true)
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      className={`motion-safe:transition motion-safe:duration-700 motion-safe:ease-out ${shown ? '' : 'motion-safe:translate-y-4 motion-safe:opacity-0'} ${className}`}
    >
      {children}
    </div>
  )
}
