# To See a House: Apartment Viewing Bookings

A React + TypeScript + Tailwind CSS app for booking visits to an apartment viewing, backed by
[Supabase](https://supabase.com). Owners and agents sign up, add their apartments and
open-house dates, and send visitors a link. Visitors pick a free time slot on a public page.
See [PLAN.md](PLAN.md) for where the project is going.

- **Accounts** (`/signup`, `/login`, `/forgot-password`): sign up with email or
  Google as an *owner* (free plan: one apartment, two viewing dates) or an *agent* (unlimited).
- **My properties** (`/dashboard`): every apartment you manage, with its upcoming
  dates and bookings. Open one (`/dashboard/p/<id>`) to edit it.
- **Visitor page** (`/p/<slug>`, or `/` for the property in `VITE_PROPERTY_SLUG`):
  the visitor enters their full name and phone number, then picks a viewing day
  and a free time slot. Booked slots are greyed out and can't be picked.
- **The phone number is the visitor's identity.** Visitors prove it's theirs with
  a 6-digit SMS code; the browser then remembers the number as verified for 30
  days. A returning visitor who enters the same number, even written as
  `+972 50…` instead of `050…`, sees their existing booking instead of the slot
  grid. Only Israeli mobile numbers (05X) are accepted.
- **Changing the arrival time.** The confirmation screen has a *Change arrival
  time* button. Nothing changes until the visitor picks another free time and
  presses *Approve change*. The old time is freed only after the new one is saved.
- **Property editor**: the link to send to visitors, a table per viewing day with
  each visitor's name and phone (tap to call). You can release bookings; add, edit
  or delete viewing days; change the title and address; write **visitor
  instructions** (address, floor, door code, parking, a Waze link) that visitors
  see after they book; and delete the apartment.
- Old `/#/p/<slug>` and `/#/admin` links redirect to the new addresses.

The interface is in **Hebrew (right-to-left) by default**, and a button in the
header switches to **English**.

Open pages re-fetch every 15 seconds, and again as soon as you return to the tab.

---

## 1. Set up Supabase

1. Create a project at <https://supabase.com> (region: Frankfurt).
2. **Apply the database schema.** Either paste each file in
   [`supabase/migrations/`](supabase/migrations/) into **SQL Editor** and run them
   in order (`…_init.sql`, `…_accounts.sql`, `…_phone_10_digits.sql`, `…_guest_otp.sql`), or with the Supabase CLI.
   Hold back `…_revoke_guest_anon.sql` until the edge functions (step 8) and the new
   frontend are live: it cuts off the browser's direct access to the booking functions.
   `db push` applies every pending file, including that one, so on an existing
   project that still runs the old frontend, use the SQL Editor for `…_guest_otp.sql`
   instead. On a new project, `db push` is fine.
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. **Set the auth URLs.** In **Authentication → URL Configuration**, set **Site URL**
   to your site (e.g. `https://your-domain.com`) and add these **Redirect URLs**, so
   the links in sign-up and password-reset emails lead back to the app:
   `http://localhost:5173/**` and `https://your-domain.com/**`.
4. **Email confirmation** (Authentication → Sign In / Providers → Email): with
   *Confirm email* on, new users must click the emailed link before they can log
   in. Supabase's built-in mailer allows only a few emails per hour; set up custom
   SMTP before launch.
5. **Password-reset email** (needs a paid Supabase plan). In **Authentication → Emails →
   Reset Password**, change the link in the template to
   `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`. The default link
   only works in the browser that asked for the reset; this one works in any
   browser (e.g. when the email is opened on a phone). On the free plan the
   template can't be edited, so skip this step: resets still work, as long as the
   user opens the email in the same browser. The app handles both links, so no
   code change is needed after upgrading.
6. **Sign in with Google** (optional). In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** (type *Web application*). Under *Authorized redirect URIs*
   add `https://<project-ref>.supabase.co/auth/v1/callback`. Then in Supabase,
   **Authentication → Sign In / Providers → Google**, enable it and paste the client ID
   and secret. Until then, the *Continue with Google* button leads to a Supabase
   error page ("provider is not enabled").
7. Copy the **Project URL** and the **anon / publishable key** from
   **Project Settings → API**.
8. **Deploy the visitor edge functions** (SMS codes and bookings, see
   [`supabase/functions/`](supabase/functions/)). Set their secrets, then deploy:
   ```bash
   npx supabase secrets set GUEST_TOKEN_SECRET=$(openssl rand -base64 48)
   npx supabase secrets set SMS_PROVIDER=log     # codes go to the function log; see below
   npx supabase functions deploy send-otp verify-otp guest-bookings
   ```
   With `SMS_PROVIDER=log`, no SMS is sent: read the code in **Edge Functions →
   send-otp → Logs**. For real SMS through [019 SMS](https://www.019sms.co.il):
   create an API token in their dashboard (**Settings → API Token Management**;
   tokens expire, so note the date) and register a sender name, then:
   ```bash
   npx supabase secrets set SMS_PROVIDER=019 SMS_019_USERNAME=<username>      SMS_019_TOKEN=<api token> SMS_019_SOURCE=<sender, up to 11 English letters/digits>
   ```
   Secrets take effect without redeploying. Changing `GUEST_TOKEN_SECRET` logs out
   every visitor (they verify again).
9. Once the new frontend is deployed, apply `…_revoke_guest_anon.sql` in the SQL Editor.

#### SMS limits

Set in `public.issue_otp()` ([`…_guest_otp.sql`](supabase/migrations/20261007000000_guest_otp.sql)):
one code per phone per minute and 15 per day, 10 per IP address per hour, and
1,000 in total per day (a cap on the SMS bill). A code is valid for 10 minutes
and allows 5 tries.

### Environment variables

| Variable                    | Required | Description                                                  |
| --------------------------- | -------- | ------------------------------------------------------------ |
| `VITE_SUPABASE_URL`         | yes      | Project URL                                                  |
| `VITE_SUPABASE_ANON_KEY`    | yes      | Anon key. Public by design; row-level security protects data |
| `VITE_PROPERTY_SLUG`        | no       | The property shown at `/`                                    |
| `SUPABASE_SERVICE_ROLE_KEY` | import   | Only for the one-time jsonbin import. Never prefix with `VITE_` |

Edge function secrets (set with `npx supabase secrets set`, never in `.env`):

| Secret               | Description                                                         |
| -------------------- | ------------------------------------------------------------------- |
| `GUEST_TOKEN_SECRET` | 32+ random characters. Signs visitor tokens and hashes SMS codes    |
| `SMS_PROVIDER`       | `019` (real SMS) or `log` (development: code in the function log)  |
| `SMS_019_USERNAME`   | 019 SMS username                                                    |
| `SMS_019_TOKEN`      | 019 SMS API token                                                   |
| `SMS_019_SOURCE`     | Sender name shown on the SMS, up to 11 English letters or digits    |

---

## 2. Run locally

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local     # then fill in the Supabase URL and anon key
npm run dev                    # http://localhost:5173
```

Open `/signup`, create an account, add an apartment and a viewing day, and copy
the visitor link from the property page.

`npm run typecheck` checks the types. `npm run build` checks them too, then writes the static site to `dist/`. `npm run preview` serves that build locally.

---

## 3. Import the old jsonbin.io bookings (once)

If you still have bookings in the old jsonbin.io bin, copy them over:

```bash
# in .env.local: VITE_JSONBIN_BIN_ID, VITE_JSONBIN_ACCESS_KEY, SUPABASE_SERVICE_ROLE_KEY
npm run import:jsonbin -- --email you@example.com --date 2026-10-12 --dry-run
npm run import:jsonbin -- --email you@example.com --date 2026-10-12
```

`--date` is the viewing date the bookings belong to. It must be today or later,
because the database refuses bookings on past days. The script creates the
property and the day if they don't exist (default slots 17:00–18:30 every 10
minutes; change with `--start`, `--end`, `--minutes`) and skips bookings that are
already there, so it's safe to run again.

Once the import is done, delete the bin on jsonbin.io: its access key is in
every bundle the old version of the site shipped.

---

## 4. Deploy

The app is a static site. Vite reads the `VITE_*` variables **at build time**, so
set them in your host's dashboard *before* building, and redeploy after changing them.

### Vercel

1. Push this repo to GitHub.
2. On <https://vercel.com/new>, import the repository. Vercel detects **Vite**.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   and, optionally, `VITE_PROPERTY_SLUG`.
4. Click **Deploy**.

The app uses path routes (`/p/<slug>`, `/dashboard`), so the host must serve
`index.html` for every path. [`vercel.json`](vercel.json) and
[`netlify.toml`](netlify.toml) do this; Cloudflare Pages does it by default.

---

## Project structure

```
src/
├── config.ts                  # language, polling, Supabase env vars
├── App.tsx                    # routes: /, /p/<slug>, /login, /signup, /dashboard…
├── i18n/
│   ├── translations.ts        # Hebrew + English texts
│   └── I18nProvider.tsx       # language state, sets <html lang/dir>, useI18n()
├── lib/
│   ├── supabase.ts            # Supabase client, error codes → BookingError
│   ├── database.types.ts      # types for the database schema
│   ├── bookingStore.ts        # visitor API (SMS code, edge functions), slot/date/phone helpers
│   ├── auth.ts                # sign-up, login, password reset, profile
│   └── adminStore.ts          # owner API: properties, days, bookings
├── hooks/
│   ├── usePolledData.ts       # loads data and keeps it fresh (polling)
│   ├── useSession.ts          # Supabase auth session
│   └── useRoute.ts            # tiny path router: useRoute(), navigate()
└── components/
    ├── Layout.tsx             # header, setup banner
    ├── ui.tsx                 # Card, Button, Field, Alert, Spinner, Link
    ├── Home.tsx               # site root: sign up / log in
    ├── BookingPage.tsx        # visitor flow: details → slot → confirmation
    ├── DetailsForm.tsx        # name + phone form with validation
    ├── OtpForm.tsx            # SMS code entry, resend
    ├── SlotPicker.tsx         # day tabs + time-slot grid
    ├── Confirmation.tsx       # "your booking is registered" screen
    ├── LoginForm.tsx          # email + password form
    ├── SignupPage.tsx         # owner / agent sign-up
    ├── ForgotPassword.tsx     # request a reset link
    ├── ResetPassword.tsx      # set a new password from the link
    ├── AccountGate.tsx        # login gate, profile, account bar; useAccount()
    ├── PropertyList.tsx       # my properties
    ├── NewProperty.tsx        # create a property
    ├── PropertyEditor.tsx     # share link, bookings per day, details, delete
    ├── DayForm.tsx            # add or edit a viewing day
    └── InstructionsEditor.tsx # post-booking instructions
supabase/migrations/           # database schema, rules and row-level security
supabase/functions/            # edge functions: send-otp, verify-otp, guest-bookings
scripts/import-jsonbin.mjs     # one-time import of the old jsonbin.io data
```

After changing the database schema, regenerate [`src/lib/database.types.ts`](src/lib/database.types.ts):

```bash
npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts
```

---

## Security and limitations

- **Bookings are safe from double-booking.** The database rejects a second booking
  for the same slot, and one phone number can hold one booking per day.
- **Visitors can't read each other's data.** The visitor page only reaches the
  database through functions that return taken slots, never names or phone numbers.
- **Visitors verify their phone by SMS.** Booking, changing and cancelling go
  through the `guest-bookings` edge function, which acts only on the phone number
  in a token signed after a correct SMS code. Tokens can't be revoked one by one:
  a token stays valid for 30 days on the device that verified.
- **Only mobile numbers (05X) can verify.** Visitors who booked earlier with
  another number (a 9-digit landline imported from jsonbin.io, or a 10-digit
  07X number) can't receive an SMS code, so they can no longer view, change or
  cancel those bookings online. The owner can still release them in the property editor.
- **The daily total of 1,000 codes is shared.** Someone sending requests from many
  IP addresses could use it up and block codes for everyone until the next day.
  The cap protects the SMS bill; raise it in `public.issue_otp()` if real traffic needs more.
- **Password-reset and sign-up confirmation links work only in the browser that
  asked for them** until the email templates are changed (step 5 above), which
  needs a paid Supabase plan. Opened elsewhere, the reset page says the link is
  invalid. A sign-up confirmation opened elsewhere still confirms the email, but
  the user then has to log in themselves.
- **Free plan limits** are enforced in the database: one property, and two
  upcoming viewing dates per property.
- **Editing a viewing day can't strand a booking.** The database refuses new hours
  that would drop a booked slot; release it first.
- **Agent plans aren't charged yet.** Until phase 5, anyone can sign up as an agent
  and get unlimited apartments.
