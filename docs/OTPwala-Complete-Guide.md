# OTPWala: Complete Setup and Operations Guide

This document explains how OTPWala works, how to install it locally, how to initialize Supabase, how pricing and refunds are calculated, and how to operate the production site safely.

## 1. What OTPWala is

OTPWala is a temporary virtual-number marketplace. A customer selects a service and country, pays from a wallet, receives a number from the Tiger SMS provider, waits for the verification SMS, and either completes or cancels the activation.

The application has four layers:

```text
Browser (Astro + React)
        |
Cloudflare Pages Functions / API
        |-------------------|
Supabase (Auth + Postgres)  Tiger SMS provider
```

- `apps/web` contains the public site, dashboard, admin panel, and Pages Functions.
- `functions` is the Cloudflare Functions source used at the repository root.
- `apps/api` contains the optional standalone Express API and Supabase migration history.
- `packages/shared` contains shared types/utilities.
- `scripts` contains production guardrails and smoke tests.

## 2. Main features

### Customer features

- Email OTP, password, and Google login.
- TOTP authenticator MFA after password, email OTP, and Google login.
- Service and country catalog with live provider pricing.
- Wallet balance, top-up requests, ledger history, and refunds.
- Virtual-number purchase and live OTP polling.
- Order history with phone number formatted as `+country dialing code national number`.
- Automatic refund after eligible cancellation, provider failure, or expiry.
- Support tickets with General Help, Payment Issue, Order/OTP Issue, Bug Report, and Account Security types.
- Optional bug-report image attachment (PNG/JPG/WEBP/GIF, maximum 1.5 MB).
- Threaded replies while a ticket is open.
- Resolved and closed tickets are final and cannot receive replies.
- Account data export and deletion request for admin review.

### Admin features

- Dashboard health, provider balance, financial integrity, order, and revenue views.
- Order audit with service, country, country ID, phone number, OTP, sale price, provider cost, and gross profit.
- Pricing rules by global fallback, service, country, or service+country.
- Catalog visibility controls.
- Top-up approval/rejection and manual wallet credits with audit notes.
- User search, ban/unban, details, and erasure workflow.
- Support queue with status, priority, internal notes, threaded replies, and ticket-type context.
- Immutable wallet ledger, reconciliation, audit log, operational alerts, retention controls, and RLS protections.

## 3. Prerequisites

- Node.js 22 or newer (the CI workflow uses Node 22).
- pnpm 11.19.0.
- A Supabase project.
- A Tiger SMS provider account and API key with production balance.
- A Cloudflare account with Pages access for `otpwala`.
- A Google OAuth client if Google login is enabled.

Install pnpm if necessary:

```bash
npm install --global pnpm@11.19.0
```

## 4. Install and run locally

```bash
git clone https://github.com/rohitkumar-co-in/otpwala.git
cd otpwala
pnpm install
pnpm dev
```

Local URLs:

- Frontend: `http://localhost:4321`
- Standalone API: `http://localhost:3001`
- Admin: `http://localhost:4321/admin`

Run services separately when needed:

```bash
pnpm dev:web
pnpm dev:api
```

## 5. Environment variables

Copy `.env.example` to `.env` for local development. Never expose server-only values with a `PUBLIC_` prefix.

```env
PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
PUBLIC_API_URL=

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
TIGER_SMS_API_KEY=YOUR_TIGER_SMS_API_KEY
TIGER_SMS_BASE_URL=https://api.tiger-sms.com
CRON_SECRET=GENERATE_A_LONG_RANDOM_SECRET

API_PORT=3001
API_BASE_URL=http://localhost:3001
WEB_URL=http://localhost:4321
NODE_ENV=development

RAZORPAY_KEY_ID=YOUR_RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_RAZORPAY_WEBHOOK_SECRET
```

For Cloudflare Pages, add the same variables in **Workers & Pages → otpwala → Settings → Environment variables**. Put public values in both environments as appropriate, but keep service-role, Tiger, cron, and payment secrets server-only.

## 6. Supabase SQL setup

### 6.1 Create the base schema

1. Open Supabase Dashboard → **SQL Editor**.
2. Create a new query.
3. Paste the complete contents of [`../supabase/migration.sql`](../supabase/migration.sql).
4. Click **Run** and confirm there are no errors.

The base script creates profiles, orders, wallet transactions, settings, pricing rules, payment requests, RLS policies, and profile creation triggers.

For a new Supabase project, you can alternatively paste the single consolidated file [`../supabase/otpwala-standalone.sql`](../supabase/otpwala-standalone.sql). It contains the base schema followed by every hardening migration in dependency order. Do not run the consolidated file after separately running the same migrations on the same database.

### 6.2 Apply hardening migrations in order

Run each file once, in filename order, in Supabase SQL Editor:

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
```

Paste one file, run it, and only then continue to the next file. Do not repeatedly run a migration that contains a non-idempotent statement unless you have checked its contents.

The final migration adds `ticket_type` and `attachment` to `support_tickets`. Without it, ticket creation with a type or image will fail.

The admin funding migration separates wallet credits into three categories:

- `topup`: customer payment submitted from the website and approved by an admin.
- `admin_credit`: money received by an admin outside the website and manually credited.
- `admin_grant`: free balance added by an admin; it is not revenue.

Apply the migration only after confirming that legacy `admin_credit` rows without a payment reference were free admin funds. Its one-time reclassification preserves website top-ups as `topup` and moves only unmarked legacy admin credits to `admin_grant`.

### 6.3 Create the first admin

Register normally, then run this query with the exact email:

```sql
UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE email = 'your-admin-email@example.com';
```

Sign out and back in after changing a role so a fresh JWT is issued. Use `superadmin` only for trusted owners who must approve data-erasure actions.

### 6.4 Configure settings

The admin settings screen controls the `settings` table. At minimum configure:

- USD/INR rate mode and rate.
- Default markup percentage.
- UPI/payment instructions.
- Maintenance mode and catalog visibility.
- Telegram support configuration, if enabled.

## 7. Pricing and wallet accounting

For a normal percentage rule:

```text
provider USD cost × USD/INR rate = provider INR cost
provider INR cost × (1 + markup percentage / 100) = customer sale price
sale price is rounded up to the nearest ₹0.50
```

Example: `$0.10 × ₹100 × 1.30 = ₹13.00`.

The purchase flow deducts the sale price atomically, creates the order, and records a wallet ledger entry. A provider failure, eligible cancellation, or expiry credits the same sale amount back through the refund ledger. Never edit wallet balances directly in SQL; use the application or approved RPCs so the ledger remains consistent.

The admin user list derives total spend from non-refunded, non-cancelled order records. The mutable profile counter is not the reporting source of truth.

## 8. Order lifecycle

The API/database retains provider lifecycle values such as `waiting`, `code_received`, `completed`, `cancelled`, and `expired`.

The frontend intentionally displays `code_received` and `completed` together as **OTP Received**. This is a presentation label only; no API status was changed.

Typical flow:

1. User purchases a number.
2. Wallet is charged and order is `waiting`.
3. Provider returns an SMS code; order becomes `code_received`.
4. Frontend shows **OTP Received**.
5. Cancellation/expiry invokes the refund workflow when eligible.

## 9. Support workflow

- Users create a typed ticket and may attach one image.
- Users and admins can reply while the ticket is `open`.
- `in_progress` and legacy `pending` records are displayed as **Open**.
- Admin may set only Open, Resolved, or Closed in the current UI.
- Resolved and Closed are final. Reply API calls to either status are rejected.
- A customer needing more help after closure must create a new ticket.

Telegram support is highlighted for urgent payment and top-up issues. Keep the Telegram handle configured consistently in the frontend and server settings.

## 10. MFA and login behavior

Users enroll a TOTP authenticator from Dashboard → Settings & Security. Enrollment is not active until a six-digit code verifies successfully.

When a verified factor exists, TOTP is required after:

- Password login.
- Email OTP login.
- Google OAuth login.

Verification is shown in an OTPWala in-page form. Invalid codes are shown below the field in red and can be retried. Browser-native prompts are not used.

If an enrollment was started but never verified, Settings shows **Cancel Incomplete Setup** so the user can enroll again.

## 11. Cloudflare deployment

After setting Pages environment variables:

```bash
npm run verify:production
npm run deploy:web
```

The GitHub Actions workflow also runs the build, dependency audit, guardrails, and production verification. A successful commit to `main` triggers the connected deployment workflow.

Never commit `.env`, service-role keys, Tiger keys, payment secrets, or OAuth client secrets.

## 12. Verification and testing

Run the complete local verification suite:

```bash
npm run build
pnpm --dir apps/api build
npm run test:unit
npm run test:guardrails
npm run test:smoke
```

Or run everything together:

```bash
npm run verify:production
```

The smoke suite checks homepage, status, health, auth configuration, protected support/export/erasure boundaries, admin boundaries, and dashboard/admin pages.

## 13. Production checklist

- [ ] Base SQL and every hardening migration applied.
- [ ] Admin and superadmin roles verified.
- [ ] Admin TOTP enrolled and tested with a wrong and correct code.
- [ ] Tiger API key works and provider balance is funded.
- [ ] USD/INR rate and markup verified with a live quote.
- [ ] UPI/payment settings verified.
- [ ] One successful OTP purchase tested.
- [ ] One provider failure/cancellation refund tested.
- [ ] One expired order refund tested.
- [ ] Support ticket, image attachment, reply, resolved, and closed behavior tested.
- [ ] Google login, email OTP login, and password login tested with MFA.
- [ ] Account export and deletion-review workflow tested.
- [ ] `npm run verify:production` passes.
- [ ] GitHub Actions is green after the deployment commit.
- [ ] Cloudflare production deployment and `/api/health` are operational.

## 14. Troubleshooting

### A migration fails

Read the first SQL error. Check whether the base schema and earlier migrations were applied. Do not skip a migration because later migrations depend on its tables, functions, or columns.

### Provider purchase fails

Check Tiger API key, base URL, provider balance, service/country availability, and the operational status page. The wallet should be refunded automatically when the application reaches its failure path.

### Admin page denies access

Confirm the profile role, sign out/in for a fresh JWT, and verify that the session is not blocked by MFA assurance.

### MFA says a factor already exists

Open Settings & Security, cancel the incomplete setup, refresh, and enroll again. A factor is not active until its TOTP code is verified.

### Support attachment fails

Use PNG, JPG, WEBP, or GIF under 1.5 MB and confirm the final support migration was applied.

## 15. Safe operating rules

- Do not approve an unknown payment request.
- Do not directly edit wallet balances or ledger rows.
- Do not expose service-role or provider secrets in browser code.
- Do not delete financial records to “fix” a display issue; correct the reporting query.
- Treat deletion approval, refunds, pricing changes, and provider funding as deliberate administrative actions.
- Keep a successful CI run and production health check for every release.
