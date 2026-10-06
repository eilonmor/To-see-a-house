// Writes an iCalendar (RFC 5545) file: CRLF line ends, text escaped, and
// lines folded at 75 bytes without splitting a UTF-8 character.

export type IcsEvent = {
  uid: string
  start: Date
  end: Date
  summary: string
  description: string
  location: string
  url?: string
}

const encoder = new TextEncoder()

/** 20261012T140000Z */
const utc = (date: Date): string => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

const escapeText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

function fold(line: string): string {
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // Continuation lines start with a space, which counts toward their 75.
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

export function calendar({ name, events }: { name: string; events: IcsEvent[] }): string {
  const stamp = utc(new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//To See a House//Open houses//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Asia/Jerusalem',
    // How often to fetch again. Apple and Outlook follow it; Google picks its own (hours).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(event.start)}`,
      `DTEND:${utc(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
    )
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
    if (event.url) lines.push(`URL:${event.url}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
