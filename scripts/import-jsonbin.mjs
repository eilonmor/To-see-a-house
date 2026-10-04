// One-time import of the old jsonbin.io bookings into Supabase.
//
//   node --env-file=.env.local scripts/import-jsonbin.mjs --email you@example.com --date 2026-10-12 [--dry-run]
//
// Options:
//   --email     the Supabase user who owns the property (create it first in
//               Supabase → Authentication → Users)
//   --date      the viewing date the bookings belong to (YYYY-MM-DD, today or later)
//   --title     property title, if a property has to be created (default "Apartment viewing")
//   --start, --end, --minutes
//               the day's slots, if the day has to be created
//               (default 17:00–18:30 every 10 minutes, the old TIME_SLOTS)
//   --dry-run   only print what would be imported
//
// Needs VITE_JSONBIN_BIN_ID + VITE_JSONBIN_ACCESS_KEY (or VITE_JSONBIN_MASTER_KEY),
// VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings →
// API keys). The service role key bypasses row-level security: never prefix it
// with VITE_, which would put it in the browser bundle.
//
// Safe to run twice: bookings that are already there are skipped.

import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    date: { type: 'string' },
    title: { type: 'string', default: 'Apartment viewing' },
    start: { type: 'string', default: '17:00' },
    end: { type: 'string', default: '18:30' },
    minutes: { type: 'string', default: '10' },
    'dry-run': { type: 'boolean', default: false },
  },
})

function fail(message) {
  console.error(`Error: ${message}`)
  process.exit(1)
}

const env = (name) => process.env[name]?.trim() || ''
if (!args.email) fail('--email is required')
if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date || '')) fail('--date is required, as YYYY-MM-DD')
for (const name of ['VITE_JSONBIN_BIN_ID', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env(name)) fail(`${name} is not set`)
}
const dryRun = args['dry-run']

// Same rule as public.phone_key() in the database.
const phoneKey = (phone) => {
  const digits = String(phone).replace(/\D/g, '')
  return digits.startsWith('972') ? `0${digits.slice(3)}` : digits
}

// 1. Read the bin.
const jsonbinKey = env('VITE_JSONBIN_ACCESS_KEY')
  ? { 'X-Access-Key': env('VITE_JSONBIN_ACCESS_KEY') }
  : { 'X-Master-Key': env('VITE_JSONBIN_MASTER_KEY') }
const res = await fetch(`https://api.jsonbin.io/v3/b/${env('VITE_JSONBIN_BIN_ID')}/latest`, {
  headers: { ...jsonbinKey, 'X-Bin-Meta': 'false' },
})
if (!res.ok) fail(`jsonbin.io returned ${res.status}: ${await res.text()}`)
const record = await res.json()
const bookings = Object.entries(record.bookings || {}).sort(([a], [b]) => a.localeCompare(b))
const instructions = typeof record.instructions === 'string' ? record.instructions.trim() : ''
console.log(`jsonbin: ${bookings.length} bookings, instructions ${instructions ? 'set' : 'empty'}`)

const db = createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const unwrap = ({ data, error }, what) => {
  if (error) fail(`${what}: ${error.message}`)
  return data
}

// 2. Find the owner.
let owner = null
for (let page = 1; !owner; page++) {
  const { users } = unwrap(await db.auth.admin.listUsers({ page, perPage: 1000 }), 'listing users')
  owner = users.find((u) => u.email?.toLowerCase() === args.email.toLowerCase())
  if (users.length < 1000) break
}
if (!owner) fail(`no Supabase user with email ${args.email}. Create one in Authentication → Users first.`)
console.log(`owner: ${owner.email} (${owner.id})`)

// 3. The owner's property: reuse the first one, or create it.
let [property] = unwrap(
  await db.from('properties').select('id, title, instructions').eq('owner_user_id', owner.id).order('created_at').limit(1),
  'reading properties',
)
if (property) {
  console.log(`property: using "${property.title}"`)
  if (!property.instructions && instructions) {
    console.log('property: copying the instructions')
    if (!dryRun) unwrap(await db.from('properties').update({ instructions }).eq('id', property.id), 'saving instructions')
  }
} else {
  console.log(`property: creating "${args.title}"`)
  if (!dryRun) {
    property = unwrap(
      await db
        .from('properties')
        .insert({ owner_user_id: owner.id, title: args.title, instructions })
        .select('id, title, instructions')
        .single(),
      'creating the property',
    )
  }
}

// 4. The visit day: reuse the one on --date, or create it.
let day = null
if (property) {
  ;[day] = unwrap(
    await db.from('visit_days').select('id, start_time, end_time, slot_minutes').eq('property_id', property.id).eq('date', args.date),
    'reading visit days',
  )
}
if (day) {
  console.log(`day: using ${args.date} (${day.start_time}–${day.end_time} every ${day.slot_minutes} min)`)
} else {
  console.log(`day: creating ${args.date} (${args.start}–${args.end} every ${args.minutes} min)`)
  if (!dryRun) {
    day = unwrap(
      await db
        .from('visit_days')
        .insert({
          property_id: property.id,
          date: args.date,
          start_time: args.start,
          end_time: args.end,
          slot_minutes: Number(args.minutes),
        })
        .select('id')
        .single(),
      'creating the visit day',
    )
  }
}

// 5. The bookings. The database checks each slot against the day.
let imported = 0
const skipped = []
for (const [slot, b] of bookings) {
  const key = phoneKey(b.phone)
  const name = String(b.name || '').trim()
  const label = `${slot} ${name} ${b.phone}`
  if (!/^0\d{8,9}$/.test(key)) {
    skipped.push(`${label}: not an Israeli phone number`)
    continue
  }
  if (dryRun) {
    console.log(`  would import ${label}`)
    imported++
    continue
  }
  unwrap(await db.from('guests').upsert({ phone_key: key, name }), `saving guest ${label}`)
  const { error } = await db.from('bookings').insert({
    visit_day_id: day.id,
    slot,
    guest_phone_key: key,
    guest_name: name,
    created_at: b.createdAt || new Date().toISOString(),
    updated_at: b.updatedAt || null,
  })
  if (error?.code === '23505') {
    skipped.push(`${label}: slot or phone already booked on this day`)
  } else if (error) {
    skipped.push(`${label}: ${error.message}`)
  } else {
    console.log(`  imported ${label}`)
    imported++
  }
}

console.log(`\n${dryRun ? 'Dry run: would import' : 'Imported'} ${imported} of ${bookings.length} bookings.`)
if (skipped.length) console.log(`Skipped:\n  ${skipped.join('\n  ')}`)
