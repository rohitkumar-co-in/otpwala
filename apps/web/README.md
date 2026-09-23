# OTPWala Web

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

## Financial data boundary

Wallet balances are written only through the atomic Supabase wallet RPCs. `wallet_transactions` is the immutable ledger; the separate read-only views are used for reporting:

- `wallet_topups`
- `wallet_deductions`
- `wallet_refunds`
- `wallet_admin_funding`
- `wallet_referral_bonuses`

Do not edit balances or ledger rows directly in the browser, Pages Functions, or Supabase table editor.
