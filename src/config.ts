import type { Lang } from './i18n/translations'

// ---------------------------------------------------------------------------
// App configuration.
// ---------------------------------------------------------------------------

// Default interface language: 'he' (Hebrew, right-to-left) or 'en' (English).
// Visitors can switch with the toggle in the header; their choice is remembered.
export const DEFAULT_LANGUAGE: Lang = 'he'

// How often (ms) open pages re-fetch bookings.
export const POLL_INTERVAL_MS = 15000

// Supabase project, injected at build time from environment variables.
// The anon key is public by design: row-level security protects the data.
export const SUPABASE = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '',
}

// Where "contact us" links lead (billing page: more than 5 agents, payment problems).
export const CONTACT_EMAIL = 'info@example.com' // TODO: the real address before launch

// Optional: a property the root page (/) shows instead of the home page.
// Every property is also reached through its own link: /p/<slug>.
export const DEFAULT_PROPERTY_SLUG = import.meta.env.VITE_PROPERTY_SLUG?.trim() || ''
