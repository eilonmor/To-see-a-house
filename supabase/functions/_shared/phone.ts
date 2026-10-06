// Same rule as public.phone_key() in the database and phoneKey() in
// src/lib/bookingStore.ts: digits only, and +972 counts as a leading 0.
export function phoneKey(phone: string): string {
  const digits = String(phone).replace(/\D/g, '')
  return digits.startsWith('972') ? `0${digits.slice(3)}` : digits
}

/** An Israeli mobile number (05X, 10 digits): the only kind that can get an SMS code. */
export const isMobileKey = (key: string): boolean => /^05\d{8}$/.test(key)
