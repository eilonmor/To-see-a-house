// ---------------------------------------------------------------------------
// App configuration — edit these values to fit your viewing event.
// ---------------------------------------------------------------------------

// Default interface language: 'he' (Hebrew, right-to-left) or 'en' (English).
// Visitors can switch with the toggle in the header; their choice is remembered.
// Page texts (title, subtitle, etc.) are in src/i18n/translations.js.
export const DEFAULT_LANGUAGE = 'he'

// Available visiting hours, in the order they will be displayed.
export const TIME_SLOTS = [
  '16:00', '16:30',
  '17:00', '17:30',
  '18:00', '18:30',
  '19:00', '19:30',
]

// Fixed admin password (client-side check only — see README "Security notes").
export const ADMIN_PASSWORD = 'eilonC110'

// How often (ms) open pages re-fetch bookings from jsonbin.io.
// Every fetch counts against your jsonbin.io request quota, so don't go too low.
export const POLL_INTERVAL_MS = 15000

// jsonbin.io credentials, injected at build time from environment variables.
export const JSONBIN = {
  binId: import.meta.env.VITE_JSONBIN_BIN_ID?.trim() || '',
  accessKey: import.meta.env.VITE_JSONBIN_ACCESS_KEY?.trim() || '',
  masterKey: import.meta.env.VITE_JSONBIN_MASTER_KEY?.trim() || '',
}
