# CardCom integration: agent and agency subscriptions (phase 5)

This document tells Claude Code how to add CardCom payments to **To See a House**.
It is adapted from CardCom's generic e-commerce guide (orders + admin panel) to this
project: a React + Vite static site on Cloudflare Pages, with Supabase (Postgres,
row-level security, Deno edge functions) as the only backend.

Read `README.md`, `PLAN.md`, the migrations in `supabase/migrations/` and the
functions in `supabase/functions/` before starting, and follow their conventions
(see "Project conventions" below).

## CardCom's documentation

Check these when a CardCom field or behavior is in doubt (Hebrew and English mixed):

- [Steps 1+2: create a payment page and get the deal result (Iframe / Redirect)](https://cardcomapi.zendesk.com/hc/he/articles/25264402497426):
  `LowProfile/Create`, the webhook, `LowProfile/GetLpResult`.
- [Step 3: charge a token / direct charge (Do Transaction)](https://cardcomapi.zendesk.com/hc/he/articles/25269208059282):
  `Transactions/Transaction`, `ExternalUniqTranId`, error 608.

The pages answer automated fetches with 403. Read them through Zendesk's API
instead, which returns the article HTML as JSON:
`https://cardcomapi.zendesk.com/api/v2/help_center/he/articles/<id>.json`
(`25264402497426` or `25269208059282`).

## What we sell

Monthly or yearly subscriptions that renew automatically. No VAT is charged (the
business is an exempt dealer for now), so the price is the final amount. Prices
are in shekels (`ISOCoinId` = 1).

| Plan code              | Who buys it            | Agents | Price charged | List price (shown struck out) | Discount shown | Period  |
| ---------------------- | ---------------------- | ------ | ------------- | ----------------------------- | -------------- | ------- |
| `agent_monthly`        | personal user or agent | —      | ₪23           | ₪33                           | 30%            | 1 month |
| `agent_yearly`         | personal user or agent | —      | ₪216          | ₪309                          | 30%            | 1 year  |
| `agency_small_monthly` | agency admin           | 2      | ₪60           | ₪92                           | 35%            | 1 month |
| `agency_small_yearly`  | agency admin           | 2      | ₪576          | ₪886                          | 35%            | 1 year  |
| `agency_large_monthly` | agency admin           | 5      | ₪120          | ₪185                          | 35%            | 1 month |
| `agency_large_yearly`  | agency admin           | 5      | ₪1152         | ₪1772                         | 35%            | 1 year  |

- The charged price is the price after the discount. The list price is the charged
  price ÷ (1 − discount), rounded to whole shekels, and is only shown in the UI
  (struck out, with "30% off" / "35% off"). Never send the list price to CardCom.
- The discount is a launch offer. Later, `plans.price` goes up; running
  subscriptions keep the price they were bought at (`subscriptions.price`) for as
  long as they renew.
- **An agency subscription includes 2 or 5 agent accounts** (the agency admin is
  not counted). Joining beyond that is refused with `agency_seat_limit`. More
  than 5 agents: "contact us".
- Prices live in a `plans` table, so they can change without a deploy.
- **Plan changes** (Task 6): agent → agency and small → large agency are
  upgrades, charged now for the rest of the period (prorated) on the saved card.
  Large → small is a downgrade that takes effect at the next renewal. Changing
  between monthly and yearly isn't supported: cancel the renewal and buy again
  when the period ends.

## Glossary

| CardCom                           | Here                                                          |
| --------------------------------- | ------------------------------------------------------------- |
| `LowProfileId`                    | checkout session id, saved on the `payments` row              |
| `TranzactionId`                   | CardCom's transaction id (CardCom's spelling, keep it)        |
| `Token`                           | the saved card, used for renewals. Stored only server side    |
| `Amount`                          | shekels with up to 2 decimals, e.g. `23` or `216.00`          |
| order (in CardCom's generic guide) | one row in `payments`: the first charge, a renewal or an upgrade |

## Do NOT

- Put `CARDCOM_API_NAME` or `CARDCOM_TERMINAL_NUMBER` in the frontend, in `.env*`
  files, or in any `VITE_*` variable. They are Supabase edge function secrets only.
- Call CardCom from the browser. Every CardCom request is made by an edge function.
- Take the amount, the plan's price or the payer from the browser. The browser sends
  only a plan code; the edge function reads the price from `plans` and the payer
  from the logged-in user.
- Add payment verification beyond `GetLpResult` for checkouts.
- Change `DocumentTypeToCreate` ("Auto") or `IsAllowEditDocument` (true).
- Show CardCom's `Description` to the user. Log it (`console.error`) and save it on
  the `payments` row; show the user a translated error code.
- Use `ReturnValue` to find the payment. Always match on `LowProfileId`.
- Mark anything as paid from the success redirect page. Only the webhook (first
  charge), the renewal job and `change-plan` (upgrades) change payment or
  subscription status.
- Let the browser read the card token (see Task 2, column grants).
- Build refunds or manual charges in the app. They are done in CardCom's
  dashboard (see "Refunds and cancellations").

## Core flow

### First purchase

1. The user picks a plan on `/dashboard/billing`.
2. The app calls the `create-checkout` edge function with `{ plan }`.
3. `create-checkout` inserts a `payments` row (`pending`), calls CardCom
   `LowProfile/Create` with `Operation: "ChargeAndCreateToken"`, saves the
   `LowProfileId` on the row, and returns CardCom's `Url`.
4. The app sends the browser to that URL (`window.location.assign`). The user pays
   on CardCom's page.
5. CardCom calls the `payment-webhook` edge function. It calls `GetLpResult`,
   updates the payment, saves the token and starts or renews the subscription.
6. CardCom sends the browser back to `/dashboard/billing?result=success` (or
   `failed`). That page only reads the status from the database; while the payment
   is still `pending` (the webhook can arrive a moment after the redirect) it shows
   "confirming your payment…" and polls.

### Renewals

7. Every day the `renew-subscriptions` edge function (scheduled with Supabase Cron)
   charges the saved token of each subscription whose period has ended, using
   `Transactions/Transaction`. On failure it retries once a day, 3 times in all, then
   ends the subscription. The user's data is kept (PLAN.md, phase 5).

### Plan changes

8. An upgrade (Task 6) is charged right away on the saved token with
   `Transactions/Transaction`, for the rest of the current period. No CardCom page.
   The new plan keeps the old period's dates and renews at its own price.
9. A downgrade is saved on the subscription (`next_plan_code`) and applied by the
   renewal job at the end of the period.

## Project conventions

- **Schema changes** go in a new migration, `supabase/migrations/20261012000000_payments.sql`
  (date-stamped like the others), applied with `npx supabase db push` or the SQL
  editor. Then regenerate `src/lib/database.types.ts` (command in README).
- **Names** are snake_case in SQL: CardCom's `CardCom_LowProfileId` becomes
  `cardcom_low_profile_id`, and so on.
- **Edge functions** use the helpers in `supabase/functions/_shared/`: `handler`,
  `ApiError` and `str` from `http.ts`, and `admin` / `rpc` from `db.ts`. Errors
  reach the app as `{ error: 'snake_case_code' }`, and the app translates them in
  `src/i18n/translations.ts` (Hebrew and English).
- **Database rules** (who may buy what, seat limits, the property gate) are
  enforced in SQL, in `security definer` functions and triggers, like the existing
  free-plan limits, and raise snake_case error codes.
- **Writes to billing tables** happen only through the service role (edge
  functions). The browser only reads, through row-level security.
- **Frontend**: a store module in `src/lib/` (like `calendarStore.ts`) calls the
  edge function through the existing `callFunction()` helper in
  `src/lib/supabase.ts`; pages use `usePolledData`; texts go in both languages; the
  UI is RTL first.
- **Docs**: update README (setup steps, secrets table, project structure,
  "Security and limitations") and PLAN.md (phase 5 status) in the same change.

## Order of work

Do the tasks in order, 1 → 8, without skipping. Show the plan before writing code.
Run `npm run typecheck` after every task that touches TypeScript.

---

## Task 1: Secrets and configuration

Edge function secrets (`npx supabase secrets set …`), never in `.env*`:

| Secret                    | Value                                                                  |
| ------------------------- | ---------------------------------------------------------------------- |
| `CARDCOM_API_NAME`        | CardCom API name. Test terminal: `CardTest1994`                        |
| `CARDCOM_TERMINAL_NUMBER` | CardCom terminal number. Test terminal: `1000`                         |
| `CRON_SECRET`             | 32+ random characters; the cron job sends it to `renew-subscriptions`  |
| `APP_URL`                 | Already exists (calendar feed). Now required: the redirect URLs use it |

- `CARDCOM_API_PASSWORD` is **not** needed: it's only for refunds and document
  cancellation, which we do in CardCom's dashboard.
- Add a small `supabase/functions/_shared/cardcom.ts`: reads the secrets (throws
  if missing, like `env()` in `sms.ts`), and exports `cardcomPost(path, body)`,
  which POSTs JSON to `https://secure.cardcom.solutions/api/v11/<path>` with a
  **5-second timeout** (`AbortSignal.timeout(5000)`), **retries once** on a network
  error or a non-200 status, and returns the parsed JSON. No auth headers: the API
  name goes in the body. `cardcomPost` adds `TerminalNumber` and `ApiName` to every
  body itself, so the request bodies below show them only for completeness; callers
  never read the secrets.
- **Charges go through `cardcomCharge(body)`** (same file), never `cardcomPost`
  directly. It sends `Transactions/Transaction` with `ExternalUniqTranId` = the
  payment id **and** `"ExternalUniqUniqTranIdResponse": true` (CardCom's spelling,
  "Uniq" twice). With `true`, CardCom answers a repeated id with the **original
  transaction's response** and doesn't charge again; with `false` (the default) it
  answers error **608**. So the same payment can be sent again later: CardCom returns
  the first attempt's result, or charges once if the first never arrived.
  - 30-second timeout (a card authorization can take longer than 5), and **no
    immediate retry**: the first attempt may still be in progress at CardCom, and a
    duplicate of it could come back as 608.
  - Returns `{ outcome: 'paid' | 'declined' | 'unknown', response }`. **Unknown**
    (the request failed, or `ResponseCode` is 608 or missing): the card may or may
    not have been charged. Leave the payment `pending`; it's sent again later
    (renewals: Task 5; upgrades: Task 6, step 6). Never treat it as a decline.
- In `supabase/config.toml` add `verify_jwt = false` for `payment-webhook`
  (CardCom has no Supabase session) and `renew-subscriptions` (checks
  `CRON_SECRET`). `create-checkout` and `change-plan` keep the default
  (`verify_jwt = true`).
- Before launch, replace the test terminal with the real one (see "Before launch:
  the CardCom terminal").

## Task 2: Database migration (`…_payments.sql`)

### 2.1 `plans`

`code text primary key`, `audience text check (audience in ('agent','agency'))`,
`period text check (period in ('month','year'))`, `price numeric(10,2)`,
`list_price numeric(10,2)`, `discount_percent int`, `agent_seats int` (null for
agent plans, 2 or 5 for agency plans; check: null exactly when `audience = 'agent'`),
`name_he text`, `name_en text`, `active boolean default true`. Seed the six plans
in the table above. Readable by everyone (`anon` and `authenticated`), writable by
nobody but the service role.

### 2.2 `subscriptions`

One row per purchase that renews; the payer is either a user or an agency,
exactly like `properties` (`owner_user_id` xor `owner_org_id`).

- `id uuid pk`, `user_id uuid null → profiles`, `org_id uuid null → organizations`,
  check exactly one is set.
- `plan_code → plans`, `price numeric(10,2)` (frozen at purchase), `period`.
- `status public.subscription_status` (reuse the existing enum:
  `active`, `past_due`, `canceled`).
- `current_period_start timestamptz` (used for proration), `current_period_end timestamptz`,
  `cancel_at_period_end boolean default false`, `failed_renewals int default 0`,
  `created_at`, `canceled_at`.
- `next_plan_code text null → plans`: a downgrade scheduled for the next renewal (Task 6).
- `ended_reason text null check (ended_reason in ('upgraded','canceled','failed'))`,
  set together with `canceled_at`: replaced by an upgrade, renewal stopped by the
  user, or 3 failed renewals.
- Card token, **never readable by the browser**: `cardcom_token text`,
  `cardcom_token_card_year int`, `cardcom_token_card_month int`,
  `cardcom_token_approval_number text`, `cardcom_token_card_owner_identity_number text`,
  `cardcom_token_expires_on date` (from `TokenInfo.TokenExDate`, `yyyyMMdd`).
- A unique partial index so a payer has at most one subscription with status
  `active` or `past_due`.
- RLS: a user reads their own rows; an agency admin reads their agency's rows.
  Grant `select` only on the non-token columns (`revoke select … from authenticated`,
  then `grant select (id, user_id, …) …`), the same pattern the init migration uses
  for updates on `profiles`. The token, approval number and ID number are never
  granted. Because of the column grants, the app must name the columns it selects
  (`select('*')` fails).

### 2.3 `payments` (CardCom's "orders" table)

- `id uuid pk`, `subscription_id uuid null → subscriptions`, `user_id`, `org_id`
  (payer, same rule as above), `bought_by uuid → profiles` (who clicked pay),
  `plan_code`, `amount numeric(10,2)`, `kind text check (kind in ('checkout','renewal','upgrade'))`.
- `status text check (status in ('pending','paid','failed'))`, `created_at`, `paid_at`.
- CardCom fields, all nullable:
  `cardcom_low_profile_id text`, `cardcom_operation text`, `cardcom_tranzaction_id bigint`,
  `cardcom_response_code int`, `cardcom_description text`,
  `cardcom_document_type text`, `cardcom_document_number int`.
- Unique index on `cardcom_low_profile_id`, and a partial unique index allowing
  one `pending` upgrade payment per subscription (Task 6).
- `refund_reason text null check (refund_reason in ('duplicate_checkout',
  'duplicate_upgrade','late_renewal'))` and `refunded_at timestamptz null`: a paid
  charge that bought nothing. Set in the same transaction that marks the payment
  paid (Tasks 3, 5, 6), so it can't be lost with a log line; cleared from the daily
  report by setting `refunded_at` after the refund in CardCom's dashboard (see
  "Refunds and cancellations"). Both are granted to the browser: the payment
  history shows "to be refunded" / "refunded".
- RLS: payer reads their own payments (user, or agency admin for the agency).
  Column grants as on `subscriptions`: `cardcom_description`, the low-profile id and
  the response code aren't granted, so the app can't display CardCom's text even by
  mistake. A failed payment shows as "failed".

### 2.4 Mirror the status on `profiles` and `organizations`

`profiles.subscription_status` and `organizations.subscription_status` already
exist and are written only by the service role. Add a function
`public.sync_subscription_status(p_user_id uuid, p_org_id uuid)` that sets the
mirror column from the payer's current subscription (`none` if there is none).
The webhook and the renewal job call it after every change.

### 2.5 The property gate

The property insert trigger `public.enforce_personal_property_limit()` (init
migration) is replaced by `public.enforce_property_plan()`. It also covers
properties created through `create_agency_property()`:

- Personal users: unchanged (free plan limits).
- A property owned by an agency (`owner_org_id`): the agency's
  `subscription_status` must be `active` or `past_due`.
- A property owned by an agent or agency admin (`owner_user_id`): allowed if the
  user's own subscription is `active`/`past_due`, **or** the user belongs to an
  agency whose subscription is `active`/`past_due`.
- Otherwise raise `subscription_required`.
- There is no free period for accounts that became agents before phase 5: the app
  is pre-launch, so they're blocked right away like anyone else.
- Existing properties, days and bookings are never touched when a subscription
  ends. Editing existing properties and days stays allowed.

### 2.6 Agency seats

In `public.accept_agency_invite()` (`20261004000000_init.sql`; redefine it with
`create or replace` in the new migration):

- The agency must have an `active` or `past_due` subscription, otherwise raise
  `subscription_required` (its members couldn't add properties anyway).
- Count the agency's members with role `agent`. If the count has reached the
  plan's `agent_seats` (2 or 5; with a downgrade scheduled, the smaller plan's),
  raise `agency_seat_limit`. The agency row is locked first, so two invites
  accepted at once can't both take the last seat. Agencies that already
  have more agents than their plan allows (after a lapse or a downgrade) keep
  them; they just can't add more.
- If the joining user has their own `active`/`past_due` subscription, set its
  `cancel_at_period_end = true`: the agency covers them from now on. No refund.

### 2.7 Who may buy what

An agency is opened by paying for its plan: there is no agency without a
plan, so nobody becomes an agency admin who can't add properties or leave
(`20261019000000_agency_checkout.sql`; the app can't call `create_agency()`).

`public.checkout_payer(p_user_id uuid, p_plan text, p_agency_name text default
null)`, `security definer`, service role only, called by `create-checkout` with
the user's id, returns `(payer_user_id, payer_org_id, agency_name)` or raises:

- `agent_*`: the caller is `personal` (no agency) or an `agent` without an agency →
  payer is the user. An agent inside an agency is covered by the agency →
  `plan_not_allowed`.
- `agency_*`:
  - the caller is `agency_admin` (an agency whose plan ended) → payer is their agency;
  - the caller has no agency → a new agency: payer is the user, `agency_name` the
    trimmed `p_agency_name` (empty → `missing_agency_name`). `complete_checkout`
    opens the agency when the payment succeeds;
  - an agent inside an agency → `plan_not_allowed`.
- The payer already has an `active` or `past_due` subscription → `already_subscribed`.
  Not checked for a new agency: the buyer's own agent plan runs out instead (below).
- `agency_*` and the caller has their own agent subscription that could be
  upgraded (`active`, not cancelling, same period) → `use_upgrade`: the app
  offers the upgrade (Task 6) instead, so they don't pay twice for the same
  period. If it can't be upgraded (cancelling, `past_due`, or the other period),
  the checkout goes ahead, and `complete_checkout` stops the renewal of the own
  subscription.
- Plan missing or not active → `plan_not_allowed`.

## Task 3: `payment-webhook` edge function

`POST https://<project-ref>.supabase.co/functions/v1/payment-webhook`. This is a
public HTTPS address, so CardCom can reach it during local development too (the
frontend runs on localhost; the functions run on Supabase).

1. The webhook is unauthenticated; `GetLpResult` is the validation.
   - By default CardCom calls it **only for successful payments**. Declined ones
     are reported only with "always report the transaction" ("תמיד בצע דיווח של
     עסקה", CardCom settings → 4. Low profile clearing → 2. General settings):
     **leave it off** (see "A declined card, then a retry on the same page"). A
     declined checkout then stays `pending`, like an abandoned one; the billing
     page hides old pending checkouts.
   - If the answer isn't HTTP 200, CardCom sends it again up to 7 times, after
     1, 2, 2, 16 and 60 minutes, then 12 and 12 hours. The count can't be changed.
2. Body (ignore other fields):
   ```json
   { "ResponseCode": 0, "Description": "string", "TerminalNumber": 0, "LowProfileId": "string", "Operation": "string" }
   ```
3. Find the `payments` row where `cardcom_low_profile_id = LowProfileId`.
   - Not found: `console.error('[cardcom] webhook for unknown LowProfileId', id)` and
     return 200 (so CardCom doesn't retry forever).
   - Status already `paid` or `failed`: idempotent, return 200 without processing.
4. `cardcomPost('LowProfile/GetLpResult', { TerminalNumber, ApiName, LowProfileId })`
   (5-second timeout, one retry). If it still fails, return HTTP 500 with the error
   text so CardCom retries later.
5. Response fields used (any may be missing or null):
   ```json
   {
     "ResponseCode": 0, "Description": "string", "TranzactionId": 0, "Operation": "string",
     "DocumentInfo": { "DocumentType": "string", "DocumentNumber": 0 },
     "TokenInfo": { "Token": "string", "TokenExDate": "yyyyMMdd", "CardYear": 0, "CardMonth": 0,
                    "TokenApprovalNumber": "string", "CardOwnerIdentityNumber": "string" }
   }
   ```
6. Save on the payment: `cardcom_response_code`, `cardcom_description`,
   `cardcom_operation`, `cardcom_document_type`, `cardcom_document_number`.
7. `ResponseCode` ≠ 0: payment `failed`; `console.error` with the description. Done.
8. `ResponseCode` = 0: `rpc('complete_checkout', { p_payment_id, p_tranzaction_id,
   p_token, p_token_expires_on, p_card_year, p_card_month, p_approval_number,
   p_owner_identity_number })`, one transaction (in the migration). Parse
   `TokenExDate` (`yyyyMMdd`) to `yyyy-MM-dd` for `p_token_expires_on`. **Trim** the
   token strings: CardCom pads some with spaces (`"040617649 "`, `"12345 "`), and
   the ID number is sent back on every renewal. It:
   - marks the payment `paid`, with `paid_at` and `cardcom_tranzaction_id`;
   - for a new agency (`payments.agency_name` set): opens it with
     `open_agency()` (the buyer becomes its `agency_admin`) and moves the payment
     to it (`user_id` null, `org_id` the agency). If the buyer joined or opened
     an agency meanwhile, it's a `duplicate` (below);
   - creates the subscription (`active`, `price` = the payment's amount, `period`
     from the plan, `current_period_start` = now, `current_period_end` = now + 1
     month or 1 year) with the `TokenInfo` fields, and links the payment to it;
   - for an `agent_*` plan bought by a `personal` user: sets the role to `agent`
     (the same change `become_agent()` makes);
   - for an `agency_*` plan: stops the renewal of the buyer's own agent
     subscription, if they have one (see 2.7);
   - calls `sync_subscription_status`;
   - returns `{ result: 'paid' | 'duplicate' | 'already_done', subscription_id }`.
     `already_done`: a concurrent webhook finished first, so nothing changed.
     `duplicate`: the payer meanwhile got another running subscription (two tabs,
     a payment page left open, or an upgrade), or the buyer of a new agency is
     in an agency already. The payment is still paid with
     `refund_reason = 'duplicate_checkout'`, no second subscription is created, and
     a repeated call answers `duplicate` again;
     `console.error('[cardcom] duplicate subscription payment', paymentId)`. It's
     refunded by hand in CardCom. The billing page's "confirming…" ends with
     "you already have a plan; we'll refund it".
9. Return 200.

## Task 4: `create-checkout` edge function and the billing page

### 4.1 `create-checkout`

`POST { plan }` with the user's Supabase session (`verify_jwt = true`; read the
user from the `Authorization` header with `admin.auth.getUser(jwt)`).

1. `rpc('checkout_payer', { p_user_id, p_plan, p_agency_name })` (Task 2.7) →
   payer, or its error code. `p_agency_name`: the body's `agency_name`, sent by
   the agency page.
2. Read the plan's price; read the buyer's `full_name`, `phone` and email.
3. Insert a `payments` row: `pending`, `kind = 'checkout'`, amount = plan price,
   and `agency_name` for a new agency.
4. `cardcomPost('LowProfile/Create', …)`:
   ```json
   {
     "TerminalNumber": CARDCOM_TERMINAL_NUMBER,
     "ApiName": CARDCOM_API_NAME,
     "Operation": "ChargeAndCreateToken",
     "ReturnValue": "<payments.id>",
     "Amount": 23,
     "SuccessRedirectUrl": "<APP_URL>/dashboard/billing?result=success",
     "FailedRedirectUrl": "<APP_URL>/dashboard/billing?result=failed",
     "CancelRedirectUrl": "<APP_URL>/dashboard/billing",
     "WebHookUrl": "<SUPABASE_URL>/functions/v1/payment-webhook",
     "Language": "he",
     "ISOCoinId": 1,
     "UIDefinition": {
       "CardOwnerNameValue": "<full_name>",
       "CardOwnerPhoneValue": "<phone>",
       "CardOwnerEmailValue": "<email>"
     },
     "Document": {
       "DocumentTypeToCreate": "Auto",
       "IsAllowEditDocument": true,
       "Name": "<agency name (or the new agency's) for agency plans, else full_name; email if empty>",
       "Email": "<email>",
       "IsSendByEmail": true,
       "Mobile": "<phone>",
       "Language": "he",
       "Products": [{ "Description": "<plan name in the document language>", "UnitCost": 23, "Quantity": 1 }]
     }
   }
   ```
   - `Language` (page and document): the app's current language (`he` or `en`),
     sent by the browser as `{ plan, lang }` and checked against those two values.
   - `Amount` must equal the sum of `UnitCost × Quantity`. Both come from the same
     `plans.price`; round to 2 decimals.
   - `IsSendByEmail: true`: CardCom emails the receipt to `Email`. Neither CardCom
     article says what the default is, so send it explicitly (renewals and upgrades
     too).
   - Local development: CardCom's docs say the redirect URLs and `WebHookUrl` must
     be **external addresses, not localhost**. The redirect is done by the user's
     browser, so `APP_URL=http://localhost:5173` would work if CardCom accepts it;
     if `LowProfile/Create` refuses it, use a Cloudflare Pages preview URL or a
     tunnel. Check it on the test terminal.
   - `CancelRedirectUrl` isn't in CardCom's field list for `LowProfile/Create`.
     Check on the test terminal that it's accepted and used; if not, drop it (the
     user goes back with the browser's Back button).
5. Response: `{ ResponseCode, Description, LowProfileId, Url }`.
   - `ResponseCode` ≠ 0, or the request failed: `console.error('[cardcom] create failed', Description)`,
     mark the payment `failed`, throw `ApiError('checkout_unavailable', 502)`. The
     app shows "We're sorry, something went wrong. Please try again in a few minutes;
     if it keeps happening, contact us." Never the description.
   - `ResponseCode` = 0: save `cardcom_low_profile_id` and
     `cardcom_operation = 'ChargeAndCreateToken'` on the payment **before**
     returning, then return `{ url: Url }`.

### 4.2 Frontend

- `src/lib/billingStore.ts`: `fetchPlans()`, `fetchMySubscription()`,
  `fetchMyPayments()`, `startCheckout(plan, lang)`, `quotePlanChange(plan)`,
  `upgradePlan(plan, lang)`, `scheduleDowngrade(plan)` (Task 6),
  `setRenewal(subscriptionId, renew)` (Task 7). Name the columns in every
  `select` on `subscriptions` and `payments` (column grants, 2.2).
- `src/components/BillingPage.tsx` at `/dashboard/billing` (route in `App.tsx`,
  inside `AccountGate`):
  - Without a subscription: the plans the user may buy (agent plans for personal
    users and independent agents, agency plans for admins of an agency whose
    plan ended), monthly/yearly,
    price with the list price struck out and the discount, "includes 2 agents" /
    "includes 5 agents", and "more than 5 agents? contact us". The pay button
    calls `startCheckout` and then `window.location.assign(url)`.
  - With one: plan, price, next charge date (or "ends on …" when canceling),
    status (`past_due`: "the last charge failed, we'll try again"), payment history
    with document number.
  - Plan changes (Task 6), only for an `active` subscription that isn't canceling:
    - An agency admin who still has their own agent subscription sees "Move to an
      agency plan" (small or large, same period); an agency on small sees
      "Upgrade to 5 agents". The button reads the amount from `quotePlanChange`
      and opens a `ConfirmDialog`: "₪X will be charged now to your saved card for
      the rest of this period; from <date>, ₪Y per month/year". Confirm calls
      `upgradePlan`.
    - An agency on large sees "Switch to 2 agents at the next renewal" (and
      "Keep 5 agents" while it's scheduled).
  - `?result=success`: "confirming your payment…" until the latest payment is no
    longer `pending` (poll every 3 seconds, up to a minute), then "paid" (for an
    agency plan: "your agency is set up", with a link to the agency page) or
    "failed". `?result=failed`: "the payment didn't go through".
  - Users outside an agency see "Running an office? Set up an agency" with a link
    to the agency page.
- `src/components/AgencyPage.tsx`, without an agency: **Set up an agency** is
  buying its plan, on one card: the agency's name, monthly/yearly, and the 2- and
  5-agent plans side by side (price, list price, discount, seats). The button calls
  `startCheckout(plan, lang, agencyName)`. An agent whose own plan is `active`, not
  cancelling, and of the chosen period sees "it moves to the agency, and you pay
  only the difference": the button reads `quotePlanChange` and confirms, then calls
  `upgradePlan(plan, lang, agencyName)` (Task 6), with no payment page.
- Replace the free **Upgrade to agent** button in `PropertyList.tsx` with a link to
  `/dashboard/billing`. `become_agent()` stays for Google sign-ups, but such an
  agent still can't add properties until they subscribe.
- On `subscription_required` (adding a property) and `agency_seat_limit` (joining
  an agency), show the translated message with a link to the billing page.
- New error codes in `translations.ts`, Hebrew and English: `subscription_required`,
  `agency_seat_limit`, `plan_not_allowed`, `already_subscribed`, `checkout_unavailable`,
  `use_upgrade`, `plan_change_not_allowed`, `upgrade_payment_failed`,
  `subscription_not_found`, `payment_unconfirmed`.

## Task 5: `renew-subscriptions` edge function

Runs daily. Schedule it in Supabase (Dashboard → Integrations → Cron), e.g. 06:00
Israel time, as an HTTP POST to `…/functions/v1/renew-subscriptions` with the header
`x-cron-secret: <CRON_SECRET>`. The function returns 401 if the header is wrong.

The bookkeeping is in three database functions (in the migration); the edge
function only talks to CardCom between them.

First `rpc('expire_subscriptions')`: subscriptions with `cancel_at_period_end = true`
whose period has ended become `canceled` (`ended_reason = 'canceled'`), without
charging. A subscription with a `pending` renewal payment is left alone (the user
may have stopped the renewal while it was being charged); it ends on a later run,
once that payment is finished. Returns `{ expired, pending: [subscription ids] }`;
`console.error` the pending ones.

Then select (service role) the ids of subscriptions with
`status in ('active','past_due')`, `cancel_at_period_end = false` and
`current_period_end <= now()`, **plus** the `subscription_id` of every `pending`
renewal payment (whatever the subscription's state: one stopped while being
charged must still get its payment finished). For each:

1. `rpc('start_renewal', { p_subscription_id })` inserts the `pending` renewal
   payment and returns `{ payment_id, amount, plan_code }`. The amount is
   `subscriptions.price`, or, when a downgrade is scheduled (`next_plan_code`),
   that plan's current price.
   - If the subscription already has a renewal payment `pending` for 1 hour to 3
     days (an earlier charge's outcome was unknown, or the function crashed between
     CardCom and the database), it returns that payment again with `resend: true`
     and its original amount and plan. It is sent again with the same
     `ExternalUniqTranId`, so CardCom returns the first attempt's result, or charges
     once if the first never arrived. `console.error('[cardcom] renewal re-sent', paymentId)`.
   - Or it returns `{ skipped }` and the subscription is left alone:
     - `not_due`: renewed or canceled meanwhile;
     - `retried_today`: a renewal failed in the last 20 hours (one try a day, even
       if the job is called twice);
     - `pending`: a charge of it started less than an hour ago (another run may
       still be waiting for CardCom);
     - `stuck` (with `payment_id`): pending for more than 3 days, so resending isn't
       working. `console.error` it every day until someone checks CardCom's dashboard
       and finishes the payment by hand (`finish_renewal`, or set it `failed`). Until
       then the subscription neither renews nor expires.
2. `cardcomCharge(…)` (Task 1):
   ```json
   {
     "TerminalNumber": CARDCOM_TERMINAL_NUMBER,
     "ApiName": CARDCOM_API_NAME,
     "Amount": 23,
     "Token": "<cardcom_token>",
     "CardExpirationMMYY": "0328",
     "ExternalUniqTranId": "<payments.id>",
     "ExternalUniqUniqTranIdResponse": true,
     "NumOfPayments": 1,
     "ISOCoinId": 1,
     "CardOwnerInformation": { "FullName": "<name>", "IdentityNumber": "<cardcom_token_card_owner_identity_number>", "CardOwnerEmail": "<email>" },
     "Document": {
       "DocumentTypeToCreate": "Auto",
       "Name": "<same as checkout>",
       "Email": "<email>",
       "IsSendByEmail": true,
       "Language": "he",
       "Products": [{ "Description": "<plan name>", "UnitCost": 23, "Quantity": 1 }]
     }
   }
   ```
   - `CardExpirationMMYY`: month zero-padded to 2 digits + the **last 2 digits** of
     the year (`CardYear` may come back as `28` or `2028`): month 3, year 2028 → `"0328"`.
     Use the saved `cardcom_token_card_month` / `_year`, **never** `TokenExDate`
     (a card expiring 10/2027 has `TokenExDate` `20271101`, which would give `"1127"`).
   - `ExternalUniqTranId` = the payment id with `ExternalUniqUniqTranIdResponse: true`
     (Task 1), so the same payment is never charged twice, even when re-sent.
   - No `IsAllowEditDocument`: it only applies to CardCom's payment page.
   - `outcome: 'unknown'`: don't call `finish_renewal`; the payment stays
     `pending` and is re-sent on the next run.
   - A database lookup fails before the charge (our error, not the card's): the
     same, the payment stays `pending` and is re-sent on the next run.
   - The payer's email: the user's email, or for an agency the agency admin's email.
3. Response (ignore other fields): `{ ResponseCode, Description, TranzactionId, DocumentNumber, DocumentType }`.
   Save `cardcom_response_code`, `cardcom_description`, the document fields on the
   payment (plain update, service role).
4. `rpc('finish_renewal', { p_payment_id, p_paid, p_tranzaction_id })`, one
   transaction, returns `{ status }` (the subscription's new status),
   `{ already_done: true }` if the payment was finished before, or
   `{ status, refund: true }` if the card was charged but the subscription had
   ended meanwhile (a late payment: re-sent, or finished by hand) or is set to end
   (`cancel_at_period_end`: its owner joined or bought an agency while it was being
   charged): the payment is `paid` with `refund_reason = 'late_renewal'`, the
   subscription untouched; `console.error` it for a manual refund. Not paid, such a
   payment is `failed` without counting toward `failed_renewals`.
   - paid (`ResponseCode` = 0): payment `paid`; subscription `active`,
     `failed_renewals = 0`, `current_period_start` = the old end,
     `current_period_end += 1 month / 1 year` (from the old end, not from today).
     With a scheduled downgrade, `plan_code` and `price` become the new plan's and
     `next_plan_code` is cleared.
   - not paid (`ResponseCode` ≠ 0): payment
     `failed`, `failed_renewals += 1`, status `past_due`; after the 3rd failure in a
     row `canceled` (`ended_reason = 'failed'`). Also
     `console.error('[cardcom] renewal failed', subscriptionId, Description)`.
   - It calls `sync_subscription_status` itself.

Handle each subscription separately: one failure must not stop the others.
`console.log` a summary at the end (charged, failed, ended, left for the next run).

Then, every run, `console.error` what needs a hand in CardCom's dashboard, until it's
handled: payments with `refund_reason` set and `refunded_at` empty (`[cardcom] refunds
due`), and upgrade payments still `pending` after an hour (`[cardcom] upgrades
unconfirmed`, Task 6).

**Time budget**: the subscriptions are charged one after another, a charge can
take up to 30 seconds, and an edge function is stopped at its wall-clock limit
(150 s on the free plan, 400 s on paid). Don't start a new charge once 100 seconds
have passed: the rest are picked up by the next run. If that happens often, add a
second Cron run a few hours later (the 20-hour `retried_today` rule keeps it from
charging twice).

## Task 6: Plan changes (`change-plan` edge function)

Upgrades are charged now, on the saved token, for what's left of the current
period. Downgrades wait for the next renewal. The period never changes:
monthly ↔ yearly is refused with `plan_change_not_allowed`.

### 6.1 Which changes are allowed

| From (current subscription)             | To                           | Kind      | Payer after         |
| --------------------------------------- | ---------------------------- | --------- | ------------------- |
| `agent_*` of a user outside an agency    | `agency_small_*` or `agency_large_*` | upgrade   | a new agency, opened by the upgrade (moves from the user) |
| `agent_*` of an admin whose agency's plan ended | `agency_small_*` or `agency_large_*` | upgrade   | the agency (moves from the user) |
| `agency_small_*`                        | `agency_large_*`             | upgrade   | the agency          |
| `agency_large_*`                        | `agency_small_*`             | downgrade | the agency          |

- Same period only (`*_monthly` → `*_monthly`, `*_yearly` → `*_yearly`).
- Only an `active` subscription with `cancel_at_period_end = false`; not
  `past_due`. Anything else → `plan_change_not_allowed`.
- Agency → agent isn't offered: an agency admin can't leave or delete the agency
  yet (PLAN.md, phase 4).
- The caller must be the payer: the user themselves, or the agency admin.

### 6.2 Database functions (in the migration)

- `public.plan_change_check(p_user_id uuid, p_plan text)`, service role only:
  validates the change (6.1) and returns `(subscription_id, change, amount,
  new_org_id)`: `change` is `'upgrade'` or `'downgrade'`, `new_org_id` the agency
  that pays afterwards (null: a new agency, opened by `complete_upgrade`). An
  agency admin's agency subscription is used if there is one, else their own. For
  an upgrade:

  ```
  amount = round((new_plan.price − subscription.price)
                 × (current_period_end − now()) / (current_period_end − current_period_start), 2)
  ```

  Under ₪1 → 0 (no charge). For a downgrade, amount = 0. The new plan must have
  `active = true`.
- `public.plan_change_quote(p_plan text)`, granted to `authenticated`: the same,
  for `auth.uid()`. The billing page calls it for the confirm dialog.
- `public.start_upgrade(p_user_id uuid, p_plan text, p_agency_name text default
  null)`, service role only, one transaction, before the charge: runs
  `plan_change_check`, locks the subscription (`for update`), runs the check again
  (an upgrade from another tab may have just finished, so a second tab is refused
  **before** its card is charged), raises `upgrade_in_progress` if the subscription
  has a `pending` upgrade payment, and `missing_agency_name` for a new agency
  without a name, then inserts the pending payment. Returns `{ subscription_id,
  amount, new_org_id, agency_name, payment_id }`; `payment_id` is null when the
  amount is 0.
- While a subscription has a `pending` upgrade payment (being charged, or never
  confirmed), nothing may change what it pays for: stopping the renewal
  (`set_subscription_renewal(…, false)`), another upgrade, and a free upgrade all
  raise `upgrade_in_progress`. (`schedule_plan_change` doesn't need it: downgrades
  are only from large, upgrades only to large.)
- `public.complete_upgrade(p_user_id uuid, p_plan text, p_payment_id uuid,
  p_tranzaction_id bigint, p_agency_name text default null)`, service role only,
  one transaction. `p_payment_id` is null when the amount was 0 (there is no
  `payments` row). It:
  - refuses (`plan_change_not_allowed`) a `p_plan` other than the payment's
    `plan_code`, so finishing a payment by hand can't give a bigger plan;
  - marks the payment `paid`, with `paid_at` and `cardcom_tranzaction_id`;
  - re-checks the change (for the same agency the payment names, or a new one)
    and locks the old subscription (`for update`);
  - for a new agency: opens it with `open_agency()`, named by the payment's
    `agency_name` (else `p_agency_name`);
  - sets the old subscription `canceled`, `ended_reason = 'upgraded'`;
  - creates a new subscription for the agency: the new plan, `price` = the new
    plan's current price, the **same** `current_period_start` / `current_period_end`,
    `active`, and the old one's token columns copied over. For agent → agency, the
    agent's saved card becomes the agency's card;
  - links the payment to the new subscription (and to the agency, for a new one);
  - calls `sync_subscription_status` for the old payer and the new one;
  - returns `{ result: 'upgraded' | 'duplicate' | 'already_done', subscription_id }`.
    `duplicate`: the change isn't allowed any more (the agency's own checkout was
    paid meanwhile, the buyer of a new agency joined or opened one, the plan was
    deactivated, or the subscription was changed by hand). The payment is still paid, with `refund_reason = 'duplicate_upgrade'`,
    and a repeated call answers `duplicate` again;
    `console.error('[cardcom] duplicate upgrade payment', paymentId)` from the edge
    function, for a manual refund. Without a payment, the error code is raised
    instead.
- `public.schedule_plan_change(p_plan text)`, granted to `authenticated`, called
  by the billing page directly (no CardCom call, so no edge function): for a
  downgrade, sets `next_plan_code`; raises `agency_seat_limit` if the agency has
  more agents than the smaller plan allows. Called with the subscription's current
  plan, it clears `next_plan_code`.

### 6.3 `change-plan` (upgrades only)

`POST { plan, lang, agency_name? }` with the user's session (`verify_jwt = true`,
user from the `Authorization` header, as in `create-checkout`). `agency_name`:
the new agency's, when an agent outside an agency moves to an agency plan.

1. `rpc('start_upgrade', { p_user_id, p_plan, p_agency_name })` (6.2) → the
   pending payment, or its error code: a downgrade → `plan_change_not_allowed`
   (the app calls `schedule_plan_change` for those); another upgrade of it pending
   → `upgrade_in_progress`. The payment row: `pending`, `kind = 'upgrade'`,
   `subscription_id` = the **old** subscription (`complete_upgrade` checks it, then
   moves it to the new one), `org_id` = `new_org_id` (for a new agency: `user_id` =
   the user and `agency_name`, until it's completed), `bought_by` = the user,
   `plan_code` = the new plan, `amount`.
2. Amount 0 (no `payment_id`): `complete_upgrade` without a payment (with
   `p_agency_name`), return `{ upgraded: true }`.
3. Otherwise `cardcomCharge(…)` (Task 1) with the old subscription's token, the
   same body as a renewal (Task 5) with `Amount` = the prorated amount,
   `Document.Language` = `lang`, `ExternalUniqTranId` = the payment id, and a
   product description like "<new plan name> (until <date>)". The payer is the
   agency (`new_org_id`); for a new agency, the user, with the document in the
   agency's name. If anything fails before the charge is sent, the payment
   is marked `failed`.
4. `ResponseCode` = 0: save the response fields on the payment, then
   `complete_upgrade`; return `{ upgraded: true }`. On `duplicate` (refund due,
   see 6.2): throw `ApiError('upgrade_refund_due', 409)`: "The charge went through,
   but the plan couldn't be changed. We'll refund the amount to your card." If
   `complete_upgrade` itself fails, the payment stays `pending` (charged, not
   recorded): `payment_unconfirmed`.
5. `ResponseCode` ≠ 0: payment `failed`,
   `console.error('[cardcom] upgrade failed', subscriptionId, Description)`, nothing
   else changes, throw `ApiError('upgrade_payment_failed', 402)`. The app says
   "The charge didn't go through. Your current plan hasn't changed."
6. `outcome: 'unknown'` (Task 1): the payment stays `pending`,
   `console.error('[cardcom] upgrade unconfirmed', paymentId)`, throw
   `ApiError('payment_unconfirmed', 502)`. The app says "We couldn't confirm the
   charge. Please don't try again; we'll check it and update your plan." To
   resolve it, send the same body again (same `ExternalUniqTranId`, so CardCom
   returns the first result instead of charging), or check CardCom's dashboard:
   if it was charged, call `complete_upgrade` by hand with the payment id; if
   not, set the payment `failed`. The daily renewal run reports it until then
   (Task 5), and the subscription can't be upgraded again or stopped meanwhile.

## Task 7: Stop the renewal (user)

The billing page has a **Cancel renewal** button (with `ConfirmDialog`): it calls
`public.set_subscription_renewal(p_subscription_id, false)` (in the migration;
the payer's own user, or the agency admin; else `subscription_not_found`), which
sets `cancel_at_period_end = true`. The subscription stays active until
`current_period_end`, then Task 5 ends it. Until then a **Resume renewal** button
calls it with `true`. An own subscription the agency covers can't be resumed
(an agent's was stopped when they joined, an admin's when the agency's plan was
bought): `covered_by_agency`. An admin whose agency has no plan yet may resume
their own. No CardCom call is needed: the token simply isn't charged again.
While an upgrade of it is being charged (or unconfirmed), stopping it raises
`upgrade_in_progress` (Task 6.2); while a renewal of it is being charged (or
re-sent, Task 5), `renewal_in_progress`, since that charge would still renew it.

## Task 8: Docs and checks

- README: setup step for the CardCom secrets, the Cron job and `…_payments.sql`;
  the secrets table; project structure (new functions, `billingStore.ts`,
  `BillingPage.tsx`); in "Security and limitations", replace "Agent plans aren't
  charged yet" with how billing works, the 2 / 5 agent seat limits, upgrades
  charged on the saved card, and manual refunds.
- PLAN.md: mark phase 5 as code done, and list what's left before launch (real
  terminal set up as in "Before launch: the CardCom terminal", Cron job created,
  VAT status rechecked).
- `.env.example`: a comment that CardCom secrets are Supabase secrets, not env vars.
- Regenerate `src/lib/database.types.ts`; `npm run build` passes.

## Refunds and cancellations (not in the app)

Refunds, partial refunds and cancelling a tax document are done in **CardCom's
dashboard**. After a refund, if the user should lose access right away, run in the
Supabase SQL editor:

```sql
update public.subscriptions
set status = 'canceled', canceled_at = now(), ended_reason = 'canceled'
where id = '<subscription id>';
select public.sync_subscription_status(<user_id or null>, <org_id or null>);
```

Otherwise just let it run out with `cancel_at_period_end = true`.

**Charges the app owes back** (`refund_reason` set: a duplicate checkout, an upgrade
that couldn't be applied, a renewal after the subscription ended) are listed every
day in the renewal job's log until handled, and by:

```sql
select id, refund_reason, amount, cardcom_tranzaction_id, created_at
from public.payments
where refund_reason is not null and refunded_at is null
order by created_at;
```

Refund each one in CardCom's dashboard by its transaction id, then:

```sql
update public.payments set refunded_at = now() where id = '<payment id>';
```

The user's payment history then shows it as "refunded".

## Testing with the test terminal

Terminal `1000`, API name `CardTest1994`, and CardCom's published test card numbers.

1. Personal user buys `agent_monthly` → redirected to CardCom → pays → back on
   `/dashboard/billing`: "confirming…", then active. Role is `agent`; the payment
   has a document number; a second property can be added.
2. Fail a payment (a declined test card), then pay with a good card on the same
   page → one webhook only (after the good card), the subscription starts. A decline
   alone → no webhook, the payment stays `pending` and is hidden as abandoned after
   a while; `?result=failed` says the payment didn't go through. Nothing else
   changes. (See "A declined card, then a retry on the same page".)
3. Send the same webhook twice → the second one changes nothing.
4. Personal user sets up an agency on the agency page with `agency_small_yearly`
   → CardCom → paid: the agency exists, the user is its `agency_admin`, the
   payment moved to the agency (`org_id`), and the billing page says the agency is
   set up. Leaving CardCom's page without paying → no agency, and the user is still
   `personal`. Invite 2 agents (OK) and a 3rd (`agency_seat_limit`). An admin whose
   agency's plan ended: joining fails with `subscription_required`.
5. Renewal: set `current_period_end` to the past in SQL, call `renew-subscriptions`
   with the cron header → a new paid payment, the period moves forward by one period.
6. Renewal failure (change the token in SQL) → `past_due`; 3 runs → `canceled`;
   adding a property → `subscription_required`; existing properties still work.
7. Cancel renewal → the period runs out → `canceled` (`ended_reason = 'canceled'`)
   with no charge.
8. Agent with `agent_monthly` sets up an agency with `agency_small_monthly` → no
   payment page: the confirm dialog shows (60 − 23) × days left ÷ days in period,
   charged on the saved card; the agency is opened with the agent as its admin; the
   agent's subscription is `canceled` with `ended_reason = 'upgraded'`; the
   agency's has the same period end and the same token; the profile and the
   organization mirror columns are right. Calling `create-checkout` for it instead
   gives `use_upgrade`. With `agency_small_yearly` instead: CardCom's page, and the
   agent's own plan stops renewing.
9. `agency_small_*` → `agency_large_*`: prorated charge, then 5 agents can join.
   `agent_monthly` → `agency_small_yearly` → `plan_change_not_allowed`.
10. Upgrade with a declined card (change the token in SQL) →
    `upgrade_payment_failed`, payment `failed`, the subscription unchanged.
11. Large with 3 agents → schedule small → `agency_seat_limit`. With 2 agents →
    scheduled; at renewal the small plan's price is charged and `plan_code` changes.
12. An agent with their own subscription joins an agency → their subscription
    gets `cancel_at_period_end = true`.
13. In the browser's network tab: no request to `cardcom.solutions`, no API name, and
    `subscriptions` responses contain no token.
14. Charge re-sent: renew once, then set that payment back to `pending` with
    `created_at` two hours ago and the period end back in the past, and run the job
    again → CardCom returns the original transaction (same `TranzactionId`), the card
    isn't charged twice, and the payment ends `paid`. This also confirms the field
    name `ExternalUniqUniqTranIdResponse` (CardCom's examples spell it with "Uniq"
    twice, its table without): if the answer is 608, try the other spelling. A
    payment `pending` for more than 3 days is reported as `stuck` and not re-sent.
15. Checkout details CardCom's docs leave open: the webhook body is JSON (with
    `LowProfileId`; `payment-webhook` answers a form-encoded body with 400),
    `CancelRedirectUrl` is accepted, `localhost` redirect URLs are accepted (Task
    4.1), and an English checkout produces an English document emailed to the buyer.

### A declined card, then a retry on the same page

Found in the code review of Tasks 3–4; mostly answered by CardCom's docs
(2026-10-12). Confirm it in test 2.

`payment-webhook` marks the payment `failed` as soon as `GetLpResult` returns
`ResponseCode` ≠ 0 (Task 3, step 7), and then ignores every later webhook for that
`LowProfileId`, because the payment is no longer `pending`. If CardCom called the
webhook after a declined card **and** let the user try again on the same page, the
successful retry would be ignored: the card charged, but no subscription created.

CardCom calls the webhook for declines only when "always report the transaction"
is turned on (Task 3, step 1). **Keep it off**: then only the successful attempt
calls the webhook, and there's nothing to fix. If it's ever turned on, step 7 must
leave the payment `pending` while the page can still be paid.

If it happens anyway: find the payment by its `LowProfileId`, check it in CardCom's
dashboard, and if it was charged, set it back to `pending` and send the webhook
again (or refund it).

## Before launch: the CardCom terminal

From CardCom's docs (2026-10-12); ask CardCom when opening the real terminal:

- The terminal must be set up **without a CVV requirement**, or token charges
  (renewals, upgrades) fail. Whether it checks the ID number depends on the
  agreement with the card company.
- Modules: Low Profile (payment page), Tokens, Documents.
- "Always report the transaction" stays **off** (Task 3).
- Is it a standing-order (הוראת קבע) terminal? If yes, renewals may send
  `Advanced.IsAutoRecurringPayment: true` for card-replacement updates
  (מוחלפים). If not, that field must not be sent.
- Run tests 14 and 15 on it once.

## Decisions (2026-10-11)

1. **Existing agents and agencies:** no free period. The app is pre-launch, so
   accounts that became agents for free are blocked right away
   (`subscription_required`) until they subscribe.
2. **More than 2 agents:** two agency tiers, 2 agents (small) and 5 agents
   (large). More than 5: contact us.
3. **An agent inside an agency who adds a property owned by themselves:** covered
   by the agency's subscription.
4. **The discount:** a launch offer. Running subscriptions keep their price
   (`subscriptions.price`) when `plans.price` goes up.
5. **VAT:** none for now (exempt dealer); prices are final.
   `DocumentTypeToCreate: "Auto"` issues the right document from the terminal
   settings. Recheck before launch and if the business status changes.
6. **Switching plans:** upgrades (agent → agency, small → large) are prorated and
   charged right away on the saved card; downgrades (large → small) apply at the
   next renewal with no refund; the period (monthly / yearly) can't change.

## Decisions (2026-10-12), after checking CardCom's docs

7. **Charges with an unknown outcome are sent again** with
   `ExternalUniqUniqTranIdResponse: true`: a renewal payment left `pending` is
   re-sent by the next runs for up to 3 days, and only then checked by hand. No
   immediate retry (Tasks 1, 5, 6).
8. **No webhook for declines** ("always report the transaction" off): a declined
   checkout stays `pending` like an abandoned one.
9. **Receipts are emailed** (`IsSendByEmail: true`) for checkouts, renewals and
   upgrades.
