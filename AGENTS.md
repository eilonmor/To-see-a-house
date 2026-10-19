# Project Guidelines

Setup steps, migrations, edge functions and secrets are documented in
[README.md](README.md); payments in [docs/cardcom-integration.md](docs/cardcom-integration.md).

## Environments

There are two fully separate environments. Never mix their projects, keys or data.

| | Production | Development |
| --- | --- | --- |
| Git branches | `main` only | `dev` and every feature/preview branch |
| Supabase project | `shqkfiwiwjgaporskgok` | `ksmktsnberseaxunjtiv` (`to-see-a-house-dev`) |
| Cloudflare | Production Worker/project | Development Worker/project (`to-see-a-house-dev`) |
| Google Cloud (Google sign-in) | Production project, OAuth redirect `https://shqkfiwiwjgaporskgok.supabase.co/auth/v1/callback` | Dev project, OAuth redirect `https://ksmktsnberseaxunjtiv.supabase.co/auth/v1/callback` |
| Local env file | `.env.local` | `.env.development.local` |
| Purpose | Live site only | All development and testing |

- Vite loads `.env.local` in every mode, and `.env.development.local` overrides it in
  development mode. So `npm run dev` uses the dev project, while `npm run build` and
  `npm run preview` use the production values. Add a new `VITE_*` variable to both files
  (and to `.env.example`, without values), each with its own environment's value.
- Feature branches can't test everything (e.g. database changes, payments, SMS, Cron).
  Those changes are validated on the `dev` branch/environment first, and only then
  merged into `main`.

## Supabase CLI rules

- Target the **dev** project by default: pass `--project-ref ksmktsnberseaxunjtiv`, or
  check the link (`npx supabase projects list`, marked ●) before `db push`, which always
  uses the linked project.
- Never push migrations, deploy functions or set secrets on production
  (`shqkfiwiwjgaporskgok`) unless the user explicitly asks for production.
- New migrations go in `supabase/migrations/` with a timestamped name, are applied to dev
  first, and to production only after they're validated on `dev` and merged into `main`.
  Follow the production ordering notes in the README (e.g. `…_payments.sql` after the
  payment functions are deployed).
- Edge function secrets (`GUEST_TOKEN_SECRET`, `CARDCOM_*`, `CRON_SECRET`, `APP_URL`, SMS)
  are set per project with `npx supabase secrets set`, never in `.env*` files or `VITE_*`
  variables. Dev uses `SMS_PROVIDER=log` and CardCom's test terminal.

## Cloudflare

- Each Cloudflare project has its own `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` build
  variables: production values on the production project, dev values on the dev project.
  They're read at build time, so redeploy after changing them.
- `wrangler.jsonc` `name` must match the Worker it deploys to. Keep this in mind when
  merging between `dev` and `main`, so the production branch doesn't deploy under the
  dev Worker's name.

## Secrets

Never commit `.env.local`, `.env.development.local` or any service role key, and never
prefix a secret with `VITE_` (it would be bundled into the browser).
