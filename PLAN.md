# Plan: multi-user booking app

## Stack

| Layer | Choice | Why |
|---|---|---|
| Hosting | Cloudflare Pages (Vercel until launch) | Free plan allows commercial use (Vercel Hobby does not), unlimited bandwidth, servers in Israel |
| Domain | Own domain, DNS on Cloudflare | `.com` bought on Cloudflare at cost; `.co.il` bought from an Israeli registrar with nameservers pointed to Cloudflare. Free HTTPS and email forwarding (`info@…`) |
| Backend | Supabase, Frankfurt region | Auth, Postgres, row-level security, edge functions. Replaces jsonbin.io |
| Guest verification | SMS / WhatsApp OTP via an Israeli SMS gateway or Twilio Verify | Cheaper than Firebase phone auth ($0.20/SMS to Israel) |
| Payments | Israeli provider (Grow or Cardcom) | Stripe doesn't support Israeli merchants; these issue tax invoices |

## Users

| | Personal (free) | Agent (paid) | Agency (paid) |
|---|---|---|---|
| Properties | 1 in total; a new one at most once per 30 days (deleting the old one) | Unlimited | Unlimited |
| Open-house dates per property | 2 in total (upcoming + archived); a new date deletes the oldest archived one | Unlimited | Unlimited |
| Agents | — | Independent, or member of one agency | Unlimited members, assigned per property (many per property) |

- **Ownership follows the payer.** A property belongs to a user or to an agency. When an agent leaves an agency, agency-owned properties stay with the agency and the agent's own properties stay with the agent.
- **Agency invites:** the admin creates a one-time code (valid 7 days), shared as a link `/join/<code>` or typed in manually.
- **Guests** never have an account. Their identity is the normalized phone number (`+972…` = `0…`).
- **Notifications:** none by SMS/WhatsApp. SMS/WhatsApp is only for guest OTP. Agents see bookings in the app.

## Guest booking flow (phase 3)

1. Guest opens `/p/<slug>`, picks a slot, enters name and phone.
2. If the browser holds a valid server-signed token for that phone, skip to 5.
3. `send-otp` edge function sends a code (rate-limited per phone and IP; Israeli numbers only).
4. `verify-otp` checks it and returns a signed token (phone + 30-day expiry), stored in localStorage.
5. `create-booking` checks the token and books. Cancel / reschedule use the same token.

## Database

Migration: [supabase/migrations/20261004000000_init.sql](supabase/migrations/20261004000000_init.sql)

- Tables: `organizations`, `profiles`, `properties`, `property_agents`, `visit_days`, `guests`, `bookings`, `agency_invites`, `otp_requests`.
- Personal-plan limits, slot validation and no-double-booking are enforced in the database (triggers + unique constraints), so the browser can't bypass them.
- Row-level security: owners, agency admins and assigned agents manage their properties; guests reach data only through functions that never expose other guests' names or phones.
- Error codes raised for the UI to translate: `personal_property_limit`, `personal_property_cooldown`, `personal_date_limit`, `date_in_past`, `slot_taken`, `booking_not_found`, `unknown_slot`, `day_closed`, `invalid_phone`, `missing_name`, `invalid_invite`, `already_in_agency`, `not_agency_admin`, `admin_cannot_leave`.

## Phases

1. **Supabase foundation.** Apply the migration. Replace `src/lib/bookingStore.js` with Supabase calls and the fixed `TIME_SLOTS` with `visit_days`. Replace the hard-coded admin password with Supabase login. Import the current jsonbin bookings once.
2. **Accounts.** Sign-up (personal / agent), login, property list, property and date editor, public `/p/<slug>` page.
3. **Guest OTP.** Edge functions + SMS/WhatsApp provider + signed token. Revoke anon access to the `book_guest_slot` / `reschedule_guest_booking` / `cancel_guest_booking` / `find_guest_bookings` functions.
4. **Agencies.** Create agency, invite link/code, assign agents, leave/remove agent.
5. **Payments.** Checkout + webhook edge functions update `subscription_status`. Agents and agencies need an active subscription to create properties; on a lapse, keep their data.
6. **Launch on Cloudflare.** Must be done before phase 5 goes live (charging users on Vercel Hobby isn't allowed): buy the domain, move hosting from Vercel to Cloudflare Pages, connect the domain, delete `netlify.toml`.
7. **Calendar sync.** First a private ICS subscription link per user (works with Google, Apple, Outlook; read-only, refreshed by the calendar app). Later, if needed, two-way Google / Outlook sync via OAuth, with tokens stored in Supabase and a scheduled edge function. Both run in Supabase, not on the host.

## Open issues

- **Email links work only in the browser that requested them.** Password-reset and sign-up confirmation emails use Supabase's default `?code=` link, tied to the browser that asked for it. Opened on another device (e.g. the phone), a reset link fails with "invalid link". Fix: change the email templates to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` (reset) and `…&type=signup` (confirmation). Editing templates needs a paid Supabase plan (Pro), so do it together with custom SMTP before launch (the built-in mailer also allows only a few emails per hour). The app already handles reset links in both formats; confirmation links of the new format still need handling in the app.

## Known issues in the old app (fixed by phase 1)

- The jsonbin.io key is in the browser bundle: anyone can read every guest's name and phone, or wipe the bin.
- `ADMIN_PASSWORD` in `src/config.js` is in git and in the bundle. Change it wherever else you use it.
