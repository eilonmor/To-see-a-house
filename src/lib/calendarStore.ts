// The user's private calendar link (phase 7): an iCalendar feed of their
// open-house days and bookings, served by the calendar-feed edge function
// (see supabase/functions). Calendar apps subscribe to it and fetch it again
// on their own schedule.

import { SUPABASE } from '../config'
import type { Lang } from '../i18n/translations'
import { run } from './supabase'

/** The user's feed token, or null if they have no link. */
export async function fetchCalendarToken(userId: string): Promise<string | null> {
  const row = await run((db) => db.from('calendar_feeds').select('token').eq('user_id', userId).maybeSingle())
  return row?.token ?? null
}

/** Creates the link, or replaces it (the old one stops working). Returns the new token. */
export async function createCalendarToken(): Promise<string> {
  return run((db) => db.rpc('create_calendar_feed'))
}

/** Turns the link off: calendars subscribed to it stop updating. */
export async function deleteCalendarToken(userId: string): Promise<void> {
  await run((db) => db.from('calendar_feeds').delete().eq('user_id', userId))
}

/** The feed's address. Event titles and texts are in `lang`. */
export const calendarFeedUrl = (token: string, lang: Lang) =>
  `${SUPABASE.url.replace(/\/+$/, '')}/functions/v1/calendar-feed/${token}.ics${lang === 'en' ? '?lang=en' : ''}`

/** The same address as webcal://, which Apple Calendar and Outlook open as a subscription. */
export const webcalUrl = (feedUrl: string) => feedUrl.replace(/^https?:/, 'webcal:')

/** Opens Google Calendar's "add calendar from URL" with the feed filled in. */
export const googleCalendarUrl = (feedUrl: string) =>
  `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(feedUrl))}`
