// GET /calendar-feed/<token>.ics[?lang=en] → the user's open-house days as an
// iCalendar feed, for calendar apps to subscribe to (read-only; they fetch it
// again every few hours). One event per day, with the bookings in its
// description.
//
// Calendar apps can't log in, so the gateway's JWT check is off and the token
// is the only credential: anyone with the link sees the bookings, including
// visitors' names and phones. The user can replace the link in the app.
//
// APP_URL (optional secret, e.g. https://your-domain.com) adds a link to the
// property's page in the app to each event.

import { rpc } from '../_shared/db.ts'
import { calendar, type IcsEvent } from './ics.ts'

type Day = {
  day_id: string
  property_id: string
  title: string
  address: string
  start: string
  end: string
  bookings: { slot: string; name: string; phone: string }[]
}

const texts = {
  he: {
    name: 'צפייה בדירה',
    summary: (title: string, n: number) => `צפייה: ${title} (${n === 1 ? 'הזמנה אחת' : `${n} הזמנות`})`,
    none: 'אין עדיין הזמנות.',
    manage: 'ניהול:',
  },
  en: {
    name: 'To See a House',
    summary: (title: string, n: number) => `Open house: ${title} (${n === 1 ? '1 booking' : `${n} bookings`})`,
    none: 'No bookings yet.',
    manage: 'Manage:',
  },
}

const TOKEN = /^[0-9a-f]{64}$/

const plain = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return plain('Method not allowed', 405)
  const url = new URL(req.url)
  const token = url.pathname.split('/').pop()?.replace(/\.ics$/, '') ?? ''
  // Unknown and malformed links look the same.
  if (!TOKEN.test(token)) return plain('Not found', 404)
  const t = url.searchParams.get('lang') === 'en' ? texts.en : texts.he

  let days: Day[] | null
  try {
    days = await rpc<Day[] | null>('calendar_feed_events', { p_token: token })
  } catch (err) {
    console.error(err)
    return plain('Server error', 500)
  }
  if (!days) return plain('Not found', 404)

  const appUrl = Deno.env.get('APP_URL')?.replace(/\/+$/, '')
  const events: IcsEvent[] = days.map((day) => {
    const lines = day.bookings.map((b) => `${b.slot.slice(0, 5)}  ${b.name}  ${b.phone}`)
    const url = appUrl ? `${appUrl}/dashboard/p/${day.property_id}` : undefined
    return {
      uid: `${day.day_id}@to-see-a-house`,
      start: new Date(day.start),
      end: new Date(day.end),
      summary: t.summary(day.title, day.bookings.length),
      description: [lines.length ? lines.join('\n') : t.none, url && `\n${t.manage} ${url}`].filter(Boolean).join('\n'),
      location: day.address,
      url,
    }
  })

  return new Response(req.method === 'HEAD' ? null : calendar({ name: t.name, events }), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="open-houses.ics"',
      // The link is personal: no shared caches.
      'Cache-Control': 'private, max-age=300',
    },
  })
})
