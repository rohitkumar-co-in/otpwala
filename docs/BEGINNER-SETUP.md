# OTPWala Beginner Setup

This guide explains how to install, configure, run, deploy, and back up OTPWala.

## 1. What You Need

Install these tools:

- Node.js 22 or newer
- pnpm 11.19.0
- A Supabase project
- A Cloudflare account with Pages access
- A Tiger SMS API account
- A Telegram bot if you want admin notifications

The Telegram bot is optional and is used for admin payment/order alerts. OTPWala does not have a public Telegram channel.

Install pnpm:

```bash
npm install --global pnpm@11.19.0
```

## 2. Install the Project

Clone the repository and install dependencies:

```bash
git clone https://github.com/rohitkumar-co-in/otpwala.git
cd otpwala
pnpm install
```

The dependency folders are intentionally ignored by Git. They can always be recreated with `pnpm install`.

## 3. Configure Local Environment

Copy the template:

```powershell
Copy-Item .env.example .env
```

Edit `.env` locally. Never commit it.

Public configuration may contain:

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
PUBLIC_API_URL=
WEB_URL=http://localhost:4321
NODE_ENV=development
```

Server-only configuration must never use a `PUBLIC_` prefix:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-key
TIGER_SMS_API_KEY=your-tiger-key
TIGER_SMS_BASE_URL=https://api.tiger-sms.com
CRON_SECRET=your-long-random-secret
```

Keep credentials out of chat, Git, screenshots, and backup archives. The local `supabse-cred/` folder is ignored for convenience, but Cloudflare Pages environment variables are the production source of truth.

## 4. Create a New Database

For a completely new Supabase project:

1. Open Supabase Dashboard -> SQL Editor.
2. Open `supabase/otpwala-standalone.sql`.
3. Run the entire file once.
4. Create your first account through the website.
5. Promote that account to admin with:

```sql
UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE email = 'your-admin-email@example.com';
```

The standalone file is for a fresh project only. Do not run it over an existing production database.

## 5. Update an Existing Database

For an existing project, first compare the linked database migration history with the repository:

```bash
npx supabase migration list --linked --workdir apps/api
```

Some SQL may already have been run manually. A migration listed as local-only is not proof that it is safe to apply. Compare the production schema and migration history before applying SQL; never blindly run `db push` or mark unknown migrations as applied.

After the schema and history are reconciled, apply only the approved migrations that have not already been applied, in filename order:

```text
apps/api/supabase/migrations/20260914183228_update_role_constraint.sql
apps/api/supabase/migrations/20260915130000_production_financial_integrity.sql
apps/api/supabase/migrations/20260915141000_backfill_legacy_order_expiry.sql
apps/api/supabase/migrations/20260915142500_admin_audit_log.sql
apps/api/supabase/migrations/20260915145500_support_tickets.sql
apps/api/supabase/migrations/20260915150000_support_public_reply.sql
apps/api/supabase/migrations/20260915153000_purchase_idempotency.sql
apps/api/supabase/migrations/20260915160000_operational_alerts.sql
apps/api/supabase/migrations/20260915163000_operational_retention.sql
apps/api/supabase/migrations/20260915170000_order_events.sql
apps/api/supabase/migrations/20260915180000_data_erasure_workflow.sql
apps/api/supabase/migrations/20260915190000_financial_integrity_report.sql
apps/api/supabase/migrations/20260915191000_financial_ledger_baseline.sql
apps/api/supabase/migrations/20260915192000_wallet_ledger_append_only.sql
apps/api/supabase/migrations/20260915200000_support_ticket_types_attachments.sql
apps/api/supabase/migrations/20260915210000_admin_funding_sources.sql
apps/api/supabase/migrations/20260917100000_fix_financial_integrity_baseline.sql
apps/api/supabase/migrations/20260917110000_financial_ledger_views.sql
apps/api/supabase/migrations/20260917120000_provider_balance_alert_settings.sql
apps/api/supabase/migrations/20260918233000_user_security_logs.sql
apps/api/supabase/migrations/20260918234500_referral_fraud_detection.sql
apps/api/supabase/migrations/20260923120000_fix_deposit_approval_compatibility.sql
apps/api/supabase/migrations/20260924100000_admin_user_purge.sql
apps/api/supabase/migrations/20260924110000_currency_preference.sql
apps/api/supabase/migrations/20260924120000_allow_superadmin_admin_purge.sql
apps/api/supabase/migrations/20260925100000_admin_user_history_clear.sql
apps/api/supabase/migrations/20260925130000_fix_supabase_security_advisor_warnings.sql
apps/api/supabase/migrations/20260925133000_drop_legacy_referral_fraud_policy.sql
apps/api/supabase/migrations/20260925140000_optimize_rls_policies_and_indexes.sql
```

For a new or correctly reconciled project, use the Supabase CLI migration runner so successful versions are tracked:

```bash
npx supabase db push --linked --workdir apps/api
```

Do not run this against a production project until you have compared the migration list and confirmed no local-only SQL was already applied manually. Never rerun a migration blindly or mark an unverified migration as applied. The latest migration optimizes RLS policies and removes verified duplicate indexes.

## 6. Understand Wallet Accounting

`wallet_transactions` is the immutable balance ledger. All balance changes go through atomic database RPCs.

The reporting views are read-only:

- `wallet_topups`: customer payments approved by an admin
- `wallet_deductions`: wallet charges for orders
- `wallet_refunds`: order refunds returned to wallets
- `wallet_admin_funding`: manual cash funding and free admin grants
- `wallet_referral_bonuses`: referral rewards

Funding categories:

- `topup`: real customer payment submitted on the website and approved by an admin
- `admin_credit`: money received by an admin outside the website
- `admin_grant`: free balance added by an admin; not revenue

Never edit `profiles.wallet_balance` or delete ledger rows directly. Use the application admin flow or restore from Supabase backup/PITR when history was removed accidentally.

Deposit requests are idempotent by payment reference. A UPI UTR or Binance order ID can be submitted only once, and duplicate checks cover both current and legacy payment-request columns. Telegram and the admin panel approve through the same atomic RPC, which updates the request status and wallet ledger together. The dashboard navigation and wallet page read the same refreshed balance. Customer prices show only the currency selected by that customer.

An order stays `waiting` if the provider denies cancellation. Do not treat it as refunded until the provider confirms cancellation or expiry and the wallet ledger records the refund.

Superadmins can clear visible user history without deleting the account. One option preserves deposit history and balance; another hides all visible history and resets the spendable balance. This is separate from Purge User, which removes the account and requires the user to be banned first.

## 7. Run Locally

Start both applications:

```bash
pnpm dev
```

Or start them separately:

```bash
pnpm dev:web
pnpm dev:api
```

Local addresses:

- Website: `http://localhost:4321`
- Admin: `http://localhost:4321/admin`
- Express API: `http://localhost:3001`

## 8. Configure Telegram Admin Alerts

Open Admin -> Settings -> Telegram Bot Alerts. This is an optional admin feature, not a public customer support channel.

Configure:

- Telegram bot token
- Admin chat ID
- Telegram notifications enabled
- Low Provider Balance Threshold (USD)
- Order notifications enabled and mode selected: OTP-only completion, or one lifecycle message edited as status changes

The default threshold is `$5.00`. Low-balance notifications are limited to two IST windows per day: one before noon and one after noon.

## 9. Verify Before Release

Run:

```bash
npm run test:unit
npm run test:guardrails
npm --prefix apps/api run build
npm --prefix apps/web run build
npm run test:smoke
```

Or run the combined check:

```bash
npm run verify:production
```

## 10. Deploy

Push to the `main` branch:

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

Cloudflare Pages detects the GitHub push and builds the `otpwala` project.

For a direct deployment after authenticating Wrangler:

```bash
npm --prefix apps/web run build
Push-Location apps/web
npx wrangler pages deploy dist --project-name=otpwala --commit-dirty=true
Pop-Location
npx wrangler deploy --config workers/wrangler.jsonc
```

Production site: `https://otpwala.me`. Cloudflare preview URLs change with each deployment; find the current one in the Cloudflare Pages deployment list.

The reconciliation Worker is deployed separately with `npx wrangler deploy --config workers/wrangler.jsonc`. Its cron trigger runs every minute and its `CRON_SECRET` must match the secret configured for the Pages API.

Required production variables belong in Cloudflare Pages settings, not in Git:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_SUPABASE_ANON_KEY`
- `TIGER_SMS_API_KEY`
- `TIGER_SMS_BASE_URL`
- `CRON_SECRET`

## 11. Project Structure

```text
otpwala/
|-- apps/
|   |-- web/                  Astro website, React admin, Pages Functions
|   |   |-- src/pages/        Public and dashboard routes
|   |   |-- src/components/   React UI components
|   |   |-- src/lib/          Browser API and session helpers
|   |   |-- functions/        Cloudflare server-side runtime
|   |   `-- public/           Static assets
|   `-- api/                  Optional standalone Express API
|       |-- src/routes/       HTTP routes
|       |-- src/services/     Wallet, orders, pricing, Telegram, Tiger
|       `-- supabase/         Incremental database migrations
|-- functions/                Source copy used by root Pages deployments
|-- packages/shared/          Shared TypeScript types
|-- supabase/
|   |-- migration.sql         Base schema
|   `-- otpwala-standalone.sql Fresh-project all-in-one schema
|-- scripts/                  Production guardrails and smoke tests
|-- workers/                  Scheduled reconciliation worker
|-- docs/                     Setup and operations documentation
|-- .env.example              Safe configuration template
|-- pnpm-lock.yaml            Reproducible dependency versions
`-- package.json              Root commands
```

## 12. Backup Checklist

Back up these tracked files through GitHub or a private archive:

- Source folders under `apps`, `functions`, `packages`, and `workers`
- `supabase/migration.sql`
- `supabase/otpwala-standalone.sql`
- `apps/api/supabase/migrations`
- `scripts`
- `docs`
- `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`

Do not back up or commit:

- `.env`
- `.env.local`
- `supabse-cred/`
- `node_modules/`
- `dist/`
- `.astro/`
- `.wrangler/`
