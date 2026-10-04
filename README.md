# To See a House: Apartment Viewing Bookings

A React + Tailwind CSS app for booking visits to an apartment viewing, backed by
[Supabase](https://supabase.com). Visitors pick a free time slot on a public page.
The owner logs in to see and manage every booking. See [PLAN.md](PLAN.md) for where
the project is going.

- **Visitor page** (`/#/p/<slug>`, or `/` for the property in `VITE_PROPERTY_SLUG`):
  the visitor enters their full name and phone number, then picks a viewing day
  and a free time slot. Booked slots are greyed out and can't be picked.
- **The phone number is the visitor's identity.** A returning visitor who enters
  the same number, even written as `+972 50…` instead of `050…`, sees their
  existing booking instead of the slot grid. Only Israeli numbers are accepted.
- **Changing the arrival time.** The confirmation screen has a *Change arrival
  time* button. Nothing changes until the visitor picks another free time and
  presses *Approve change*. The old time is freed only after the new one is saved.
- **Admin dashboard** (`/#/admin`): log in with your Supabase account. You get the
  link to send to visitors, a table per viewing day with each visitor's name and
  phone (tap to call), and you can release bookings, add or delete viewing days,
  and write **visitor instructions** (address, floor, door code, parking, a Waze
  link). Visitors see the instructions after they book.

The interface is in **Hebrew (right-to-left) by default**, and a button in the
header switches to **English**.

Open pages re-fetch every 15 seconds, and again as soon as you return to the tab.

---

## 1. Set up Supabase

1. Create a project at <https://supabase.com> (region: Frankfurt).
2. **Apply the database schema.** Either paste
   [`supabase/migrations/20261004000000_init.sql`](supabase/migrations/20261004000000_init.sql)
   into **SQL Editor** and run it, or with the Supabase CLI:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. **Create your admin user.** In **Authentication → Users → Add user**, enter your
   email and a password and tick *Auto confirm user*. (Self-service sign-up comes in phase 2.)
4. Copy the **Project URL** and the **anon / publishable key** from
   **Project Settings → API**.

### Environment variables

| Variable                    | Required | Description                                                  |
| --------------------------- | -------- | ------------------------------------------------------------ |
| `VITE_SUPABASE_URL`         | yes      | Project URL                                                  |
| `VITE_SUPABASE_ANON_KEY`    | yes      | Anon key. Public by design; row-level security protects data |
| `VITE_PROPERTY_SLUG`        | no       | The property shown at `/`                                    |
| `SUPABASE_SERVICE_ROLE_KEY` | import   | Only for the one-time jsonbin import. Never prefix with `VITE_` |

---

## 2. Run locally

Requires Node.js 20+.

```bash
npm install
cp .env.example .env.local     # then fill in the Supabase URL and anon key
npm run dev                    # http://localhost:5173
```

Open `/#/admin`, log in, create your property, add a viewing day, and copy the
visitor link from the dashboard.

`npm run build` writes the static site to `dist/`. `npm run preview` serves that build locally.

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

The app uses hash routes (`/#/admin`, `/#/p/<slug>`), so you don't need any SPA redirect rules.

---

## Project structure

```
src/
├── config.js                  # language, polling, Supabase env vars
├── App.jsx                    # routes: #/admin, #/p/<slug>, /
├── i18n/
│   ├── translations.js        # Hebrew + English texts
│   └── I18nProvider.jsx       # language state, sets <html lang/dir>, useI18n()
├── lib/
│   ├── supabase.js            # Supabase client, error codes → BookingError
│   ├── bookingStore.js        # visitor API (database functions), slot/date/phone helpers
│   └── adminStore.js          # admin API: login, property, days, bookings
├── hooks/
│   ├── usePolledData.js       # loads data and keeps it fresh (polling)
│   ├── useSession.js          # Supabase auth session
│   └── useHashRoute.js        # tiny hash router
└── components/
    ├── Layout.jsx             # header, setup banner
    ├── ui.jsx                 # Card, Button, Field, Alert, Spinner
    ├── BookingPage.jsx        # visitor flow: details → slot → confirmation
    ├── DetailsForm.jsx        # name + phone form with validation
    ├── SlotPicker.jsx         # day tabs + time-slot grid
    ├── Confirmation.jsx       # "your booking is registered" screen
    ├── AdminPage.jsx          # login gate
    ├── AdminLogin.jsx         # email + password form
    ├── AdminDashboard.jsx     # share link, bookings per day
    ├── PropertySetup.jsx      # create the property (first login)
    ├── AddDayForm.jsx         # add a viewing day
    └── InstructionsEditor.jsx # post-booking instructions
supabase/migrations/           # database schema, rules and row-level security
scripts/import-jsonbin.mjs     # one-time import of the old jsonbin.io data
```

---

## Security and limitations

- **Bookings are safe from double-booking.** The database rejects a second booking
  for the same slot, and one phone number can hold one booking per day.
- **Visitors can't read each other's data.** The visitor page only reaches the
  database through functions that return taken slots, never names or phone numbers.
- **No visitor verification yet.** Anyone who knows a visitor's phone number can
  see, change or cancel that visitor's booking. Phase 3 adds an SMS/WhatsApp code.
- **Free plan limits** are enforced in the database: one property, and two
  upcoming viewing dates per property.
