# OTPWala Web

For first-time hosting on a different domain, follow the repository's [fresh-domain hosting guide](../../docs/FRESH-DOMAIN-HOSTING.md). This web app has domain-specific canonical and deployment settings that must be updated before launch.

The production web application is an Astro site with React islands and Cloudflare Pages Functions.

## Local development

From the repository root:

```bash
pnpm install
pnpm dev:web
```

The site runs at `http://localhost:4321`. The development API, when used, runs at `http://localhost:3001`.

## Build and verification

```bash
npm run build:web
npm run test:unit
npm run test:guardrails
npm run test:smoke
npm run verify:production
```

The build synchronizes the shared Pages Functions source into the web project before running Astro. Do not edit generated copies to fix behavior; update the source implementation and rebuild.

The wallet page and dashboard navigation use the same authenticated wallet response. Wallet refreshes publish the current balance to the navigation, so an approved deposit is reflected without a full page reload.

The public site, customer dashboard, and admin panel are designed to work across phone, tablet, and desktop widths. Customer order and catalog views reuse the configured service artwork and country flags. Customer-facing prices use the selected currency only. Service and country catalog pages load the complete lists; search and filters work across all entries and there are no load-more controls.

Responsive table cards keep related content grouped within each value cell. In the admin user list, registration and last-login dates keep their times directly beneath the date, rather than wrapping into the label column.

Table headers and body cells share consistent emphasis and text colors. Status badges retain their semantic colors. In the admin overview, the recent-order identity cell shows the customer's profile photo when available, email, shortened order ID, and a copy action. The Users page labels each account identifier as **User ID**. Registered and Last Login times use 12-hour time. Refunded price text uses the same size, weight, and success color as sale-price text.

The shared guest footer uses responsive link groups, with a dedicated brand area and compact two-column links on smaller screens. Keep all existing footer destinations when adjusting its layout.

Order cancellation is provider-confirmed. A denied cancellation remains `waiting`; the UI must not show a refund until cancellation/expiry is confirmed and the wallet ledger records it.

Admin user-history clearing is not account purge. The superadmin can hide activity while preserving deposits and balance, or hide all visible history and reset the spendable balance. The existing Purge User action remains a separate, irreversible account operation.

The Supabase migration chain includes RLS query optimizations, duplicate-index removal, and cleanup of unused dynamic-branding settings. Site identity and slogan are fixed in the page templates. The latest migration is `20260925150000_remove_dynamic_branding_settings.sql`; all local migration versions have been reconciled with production. Leaked-password protection is an Auth project setting, not a database migration.

## Deployment

GitHub `main` is connected to the `otpwala` Cloudflare Pages project. A successful push triggers a production deployment. Required server-side variables belong in Cloudflare Pages environment settings, never in client code or committed files:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_SUPABASE_ANON_KEY`
- `TIGER_SMS_API_KEY`
- `TIGER_SMS_BASE_URL`
- `CRON_SECRET`

Keep `.env`, `.env.local`, and `supabse-cred/` local and ignored.

For a direct deployment:

```bash
npm --prefix apps/web run build
Push-Location apps/web
npx wrangler pages deploy dist --project-name=otpwala --commit-dirty=true
Pop-Location
```

The reconciliation Worker is deployed separately with `npx wrangler deploy --config workers/wrangler.jsonc`.

Cloudflare Pages preview URLs are unique per deployment. Use the deployment list rather than storing an old preview URL in documentation. The Worker has a one-minute cron trigger configured in `workers/wrangler.jsonc`; set its `CRON_SECRET` to match the API secret.

## Financial data boundary

Wallet balances are written only through the atomic Supabase wallet RPCs. `wallet_transactions` is the immutable ledger; the separate read-only views are used for reporting:

- `wallet_topups`
- `wallet_deductions`
- `wallet_refunds`
- `wallet_admin_funding`
- `wallet_referral_bonuses`

Do not edit balances or ledger rows directly in the browser, Pages Functions, or Supabase table editor.

## Production verification

From the repository root, run `npm run verify:production`. This builds the static web site and API, runs unit tests and production guardrails, and sends unauthenticated smoke requests to the production site. It does not test signed-in journeys, payments, real OTP delivery, responsive screenshots, or destructive admin features; use staging and disposable accounts for those checks.

Before applying Supabase SQL, compare local and remote history with `npx supabase migration list --linked --workdir apps/api`. A local-only migration might already have been run manually, so reconcile the actual schema before applying or repairing migration history.

Before creating a source backup, `npm run clean` removes generated root, web, and API build output plus Astro's generated cache. It leaves source, dependencies, environment files, and Wrangler state untouched.
