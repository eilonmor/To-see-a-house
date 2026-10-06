// "Add to calendar" for a visitor's booking: a Google Calendar link, and an
// .ics file for Apple Calendar and Outlook. Both are built in the browser; the
// visitor's calendar gets a copy that doesn't change if the booking does.
// (Owners subscribe to a live feed instead: see supabase/functions/calendar-feed.)

export type CalendarEvent = {
  /** Stable per booking, so adding it again (e.g. after changing the time) updates the event. */
  uid: string
  start: Date
  end: Date
  title: string
  details: string
  location: string
}

/** A date and time in Israel ('YYYY-MM-DD', 'HH:MM') as a moment. */
export function israelMoment(date: string, time: string): Date {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  // Israel's offset from UTC at a moment (2 or 3 hours), read back through Intl.
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  })
  const offset = (moment: number) => {
    const p = Object.fromEntries(format.formatToParts(moment).map((part) => [part.type, Number(part.value)]))
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - moment
  }
  // The second pass corrects the offset when the first guess lands across a clock change.
  return new Date(wall - offset(wall - offset(wall)))
}

/** 20261012T140000Z */
const utc = (date: Date): string => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${utc(event.start)}/${utc(event.end)}`,
    details: event.details,
    location: event.location,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

const escapeText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// Lines longer than 75 bytes are folded, without splitting a UTF-8 character.
function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > 75) {
      parts.push(current)
      current = ' '
      bytes = 1
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n')
}

/** The event as an .ics file, as a data: URL for a download link. Reminds an hour before. */
export function icsDataUrl(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//To See a House//Booking//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(event.start)}`,
    `DTEND:${utc(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.details)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(event.title)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.map(fold).join('\r\n') + '\r\n')}`
}
