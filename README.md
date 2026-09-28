# To See a House: Apartment Viewing Bookings

A small React + Tailwind CSS app for booking visits to an apartment viewing.
Visitors pick a free time slot on a public page. You see and manage every booking
on a password-protected admin dashboard. Bookings are stored in a free
[jsonbin.io](https://jsonbin.io) bin, so they sync across devices without a server.

- **Visitor page** (`/`): the visitor enters their full name and phone number,
  then picks one of the available time slots. Booked slots are greyed out and
  can't be picked. After booking, a confirmation screen appears.
- **Admin dashboard** (`/#/admin`): protected by the password `eilonC110`.
  Shows a table of every time slot in order, with the visitor's name and phone
  number (tap to call) or "Available". Any booking can be released.
  The admin can also write **visitor instructions**, such as the address, floor,
  door code, parking or a Waze link. These appear next to the success message
  after a visitor books. Links become clickable, and leaving the field empty
  shows nothing.

The interface is in **Hebrew (right-to-left) by default**, and a button in the
header switches to **English**. Each browser remembers its visitor's choice.

Open pages re-fetch bookings every 15 seconds, and again as soon as you return
to the tab. The admin page also has a **Refresh** button.

---

## 1. Set up jsonbin.io (free)

1. **Create an account** at <https://jsonbin.io> (the free plan is enough).
2. **Create a bin.** Open the dashboard, click **Bins → Create a Bin**, and paste
   this starting content:
   ```json
   { "bookings": {} }
   ```
   Keep the bin **Private** and save it.
3. **Copy the Bin ID.** It's the long hex string shown on the bin (it's also in
   the bin's URL, e.g. `https://api.jsonbin.io/v3/b/`**`66f1c2...`**).
   This is your `VITE_JSONBIN_BIN_ID`.
4. **Create an Access Key** (recommended). Go to **API Keys → Access Keys →
   Create Access Key** and give it only these permissions:
   - Bins: **Read**
   - Bins: **Update**

   Leave Create and Delete unchecked. Copy the key. This is your `VITE_JSONBIN_ACCESS_KEY`.

   > Why not the Master Key? Any key used by a static site ends up in the
   > JavaScript bundle and can be read by anyone. The Master Key has full control
   > of your account. A scoped Access Key can only read and update bins. If you
   > really want to use the Master Key, set `VITE_JSONBIN_MASTER_KEY` instead;
   > it's supported, but not recommended.

### Environment variables

| Variable                  | Required | Description                                         |
| ------------------------- | -------- | --------------------------------------------------- |
| `VITE_JSONBIN_BIN_ID`     | yes      | The bin ID from step 3                              |
| `VITE_JSONBIN_ACCESS_KEY` | yes\*    | Access Key with Bins Read + Update (step 4)         |
| `VITE_JSONBIN_MASTER_KEY` | \*       | Alternative to the Access Key (not recommended)     |

If these aren't set, the app runs in **demo mode**: bookings are saved only in
the current browser, and a yellow banner says so.

---

## 2. Run locally

Requires Node.js 18+ (20+ recommended).

```bash
npm install
cp .env.example .env.local     # then fill in your bin ID and access key
npm run dev                    # http://localhost:5173
```

`npm run build` writes the static site to `dist/`. `npm run preview` serves that build locally.

---

## 3. Deploy

The app is a fully static site. Vite reads the `VITE_*` variables **at build
time**, so set them in your host's dashboard *before* building. If you change
them later, redeploy.

### Vercel

1. Push this repo to GitHub.
2. On <https://vercel.com/new>, import the repository. Vercel detects **Vite**
   automatically (build command `npm run build`, output directory `dist`).
3. Under **Environment Variables**, add `VITE_JSONBIN_BIN_ID` and
   `VITE_JSONBIN_ACCESS_KEY`.
4. Click **Deploy**.

### Netlify

1. Push this repo to GitHub.
2. On <https://app.netlify.com>, choose **Add new site → Import an existing project**
   and pick the repository. `netlify.toml` already sets the build command
   (`npm run build`) and publish directory (`dist`).
3. Under **Site configuration → Environment variables**, add
   `VITE_JSONBIN_BIN_ID` and `VITE_JSONBIN_ACCESS_KEY`.
4. Trigger a deploy (**Deploys → Trigger deploy**).

The app uses hash routes (`/#/admin`), so you don't need any SPA redirect rules.

Share the root URL with visitors. You reach the dashboard at `https://your-site/#/admin`.

---

## Customizing

Most settings live in [`src/config.js`](src/config.js):

- `TIME_SLOTS`: the list of visiting hours, e.g. `['16:00', '16:30', ...]`
- `DEFAULT_LANGUAGE`: `'he'` (Hebrew, RTL) or `'en'` (English)
- `ADMIN_PASSWORD`: the admin password (`eilonC110`)
- `POLL_INTERVAL_MS`: how often open pages re-fetch bookings

All on-screen text, in both languages, is in
[`src/i18n/translations.js`](src/i18n/translations.js). To show the viewing's
date or address, edit `event.title` / `event.subtitle` there for each language.

To reset all bookings, release them from the dashboard, or edit the bin on
jsonbin.io back to `{ "bookings": {} }`.

---

## Project structure

```
src/
├── config.js                  # time slots, password, polling, jsonbin env vars
├── App.jsx                    # picks the visitor or admin view from the URL hash
├── i18n/
│   ├── translations.js        # Hebrew + English texts
│   └── I18nProvider.jsx       # language state, sets <html lang/dir>, useI18n()
├── lib/bookingStore.js        # jsonbin.io API (read / book / release) + demo fallback
├── hooks/
│   ├── useBookings.js         # loads bookings and keeps them fresh (polling)
│   └── useHashRoute.js        # tiny hash router
└── components/
    ├── Layout.jsx             # header, demo-mode banner
    ├── ui.jsx                 # Card, Button, Field, Alert, Spinner
    ├── BookingPage.jsx        # visitor flow: details → slot → confirmation
    ├── DetailsForm.jsx        # name + phone form with validation
    ├── SlotPicker.jsx         # time-slot grid (booked slots disabled)
    ├── Confirmation.jsx       # "your booking is registered" screen
    ├── AdminPage.jsx          # password gate (remembered for the browser session)
    ├── AdminLogin.jsx         # password form
    ├── AdminDashboard.jsx     # bookings table with Release buttons
    └── InstructionsEditor.jsx # admin editor for the post-booking instructions
```

**Data format** stored in the bin:

```json
{
  "bookings": {
    "16:30": { "name": "Dana Cohen", "phone": "050-123-4567", "createdAt": "2026-09-28T18:02:11.000Z" }
  },
  "instructions": "10 Herzl St., 3rd floor. Door code: 1234"
}
```

---

## Security and limitations

This setup is free and has no server. That comes with trade-offs you should know about:

- **The admin password is checked in the browser.** It keeps casual visitors off
  the dashboard, but anyone who reads the site's JavaScript can find it.
- **The jsonbin key is public.** The visitor page has to read and write the bin,
  so the key ships in the bundle. Someone technical could use it to read the bin,
  which includes visitors' names and phone numbers, or to overwrite it. Use the
  scoped Access Key, and only share the link with people you're inviting. If you
  need real privacy, put the jsonbin calls behind a small serverless function
  (e.g. Vercel or Netlify Functions) that holds the key on the server.
- **Double bookings are guarded but not atomic.** Before saving, the app
  re-reads the bin and refuses a slot that has just been taken ("just booked by
  someone else"). Two people pressing *Confirm* in the same instant could still
  collide. That's rare for a single viewing.
- **One booking per phone number.** A second booking with the same number is refused.
- **Request quota.** Every refresh counts against your jsonbin.io free-plan
  request quota. The app only polls while the tab is visible. If you expect
  heavy traffic, raise `POLL_INTERVAL_MS`, and check your usage on the jsonbin dashboard.
