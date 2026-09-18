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
- Single-device active session enforcement with concurrent device protection.
- Live session command center showing Public IP, telecom carrier / ISP name, ASN, and geo location.
- TOTP authenticator MFA after password, email OTP, and Google login.
- Service and country catalog with live provider pricing.
- Wallet balance, top-up requests, ledger history with running balance after each transaction, and auto-refunds.
- Strict 12-digit numeric UPI UTR and numeric Binance Pay Order ID validation on deposits.
- Virtual-number purchase and live OTP polling with audio alert and 1-click clipboard copy.
- Order history with phone number formatted as `+country dialing code national number`.
- Automatic refund after eligible cancellation, provider failure, or expiry.
- Multi-tier referral earnings with automated network fraud protection.
- Support tickets with General Help, Payment Issue, Order/OTP Issue, Bug Report, and Account Security types.
- Optional bug-report image attachment (PNG/JPG/WEBP/GIF, maximum 1.5 MB).
- Threaded replies while a ticket is open.
- Resolved and closed tickets are final and cannot receive replies.
- Formatted user data export (Standalone HTML Report with 1-click Print to PDF, CSV Spreadsheet, and JSON Archive).
- Account deletion request with in-site confirmation modal (zero browser popups).

### Admin features

- Dashboard health, provider balance, financial integrity, order, and revenue views.
- 1-click payment deposit approval/rejection with in-site confirmation dialogs.
- Order audit with service, country, phone number, OTP, sale price, provider cost, and gross profit.
- Pricing rules by global fallback, service, country, or service+country.
- Catalog visibility controls with 1-click batch actions.
- Top-up approval/rejection and manual wallet credits declaring funding sources (cash vs free grant).
- User search, details inspect modal with running balance ledger, ban/unban, promote/demote, and zero-markup toggle.
- Full user dossier export (1-click download of all user profile data, IP/ISP security logs, orders, ledger, payment requests, and tickets).
- Multi-tier referral fraud logs and automated network collision protection.
- Support queue with status, priority, internal notes, threaded replies, and ticket-type context.
- Super Admin privacy & data erasure queue with in-site modal confirmations.
- Immutable wallet ledger, reconciliation, audit log, operational alerts, retention controls, and RLS protections.
- Universal in-site toast notification engine on all refresh, save, and update actions.

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
apps/api/supabase/migrations/20260917100000_fix_financial_integrity_baseline.sql
apps/api/supabase/migrations/20260917110000_financial_ledger_views.sql
apps/api/supabase/migrations/20260917120000_provider_balance_alert_settings.sql
```

Paste one file, run it, and only then continue to the next file. Do not repeatedly run a migration that contains a non-idempotent statement unless you have checked its contents.

The final migration adds `ticket_type` and `attachment` to `support_tickets`. Without it, ticket creation with a type or image will fail.

The admin funding migration separates wallet credits into three categories:

- `topup`: customer payment submitted from the website and approved by an admin.
- `admin_credit`: money received by an admin outside the website and manually credited.
- `admin_grant`: free balance added by an admin; it is not revenue.

Apply the migration only after confirming that legacy `admin_credit` rows without a payment reference were free admin funds. Its one-time reclassification preserves website top-ups as `topup` and moves only unmarked legacy admin credits to `admin_grant`.

The financial ledger views migration creates separate read-only reporting surfaces: `wallet_topups`, `wallet_deductions`, `wallet_refunds`, `wallet_admin_funding`, and `wallet_referral_bonuses`. `wallet_transactions` remains the only immutable source of balance truth; do not create separate writable balance tables or insert into these views.

The provider balance alert threshold is configured in Admin Settings as `provider_low_balance_threshold_usd` and defaults to `$5.00`. Low-balance Telegram alerts are rate-limited to one message in the IST morning window and one in the IST afternoon/evening window, for a maximum of two per day.

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

The platform standardizes on the canonical provider lifecycle values: `waiting`, `code_received`, `cancelled`, `refunded`, and `expired`.

- **`waiting`**: Virtual number has been provisioned; actively polling for incoming SMS verification code from upstream provider.
- **`code_received`**: Verification code delivered from Tiger SMS provider (`STATUS_OK:<code>`); displayed across all customer and admin dashboards with the label **OTP Received** (`badge-success`).
- **`cancelled`**: Cancelled by the user within the cancellation window or cancelled by the provider.
- **`refunded`**: Order cost automatically credited back to the customer's wallet balance.
- **`expired`**: Activation window expired without receiving an SMS code; triggers automatic wallet refund.

Typical flow:

1. User selects service and country, then purchases a number.
2. Wallet balance is deducted atomically and order enters `waiting` status.
3. Provider delivers the SMS verification code; order transitions to `code_received`.
4. Customer dashboard displays **OTP Received** with 1-click clipboard copy and audio alert.
5. If no code is received within the active window, cancellation or expiry invokes the automatic wallet refund workflow.

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

## 16. Referral fraud prevention engine

OTPWala features an automated multi-tier network fraud detection system designed to eliminate self-referrals and multi-accounting exploitation on shared networks:

1. **Exact IP Collision (`score: 100`)**:
   - Rejects referral attribution if the referee's current IP matches the referrer's `signup_ip` or `last_login_ip`.
2. **IPv6 Cellular Subnet Matching (`score: 85`)**:
   - Indian mobile operators (Reliance Jio, Bharti Airtel, Vodafone Idea) dynamically provision a `/64` IPv6 prefix to an individual device or mobile hotspot.
   - Evaluates the first 4 blocks of IPv6 (`/64` prefix). Matches indicate the accounts are connected to the exact same cellular subscription or hotspot.
3. **IPv4 Local Network Matching (`score: 60`)**:
   - Evaluates the first 3 octets (`/24` prefix) to detect shared residential routers, local cyber cafes, or local proxies.
4. **Historical Telemetry Matching (`score: 75`)**:
   - Checks `public.user_security_logs` to verify whether the referrer has ever authenticated from the referee's IP or vice-versa.
5. **Enforcement**:
   - Fraudulent referral links are blocked with clear feedback.
   - Any deposits on suspicious accounts have referral bonus generation suppressed.
   - Detailed forensic evidence is recorded in `public.referral_fraud_logs`.

## 17. Single-device session protection & edge compliance telemetry

1. **Single-Device Protection**:
   - Users are restricted to one active device session at any time.
   - During login (`register-session`), a UUID v4 session identifier is recorded in the user profile and stored in the client's `localStorage`.
   - API endpoints verify the active session token. If the user logs in from another computer or browser, the displaced device receives an immediate session invalidation notification (`concurrent_session`) and is logged out cleanly.
2. **Zero-Cost Edge Compliance Telemetry**:
   - Handled directly at the Cloudflare edge in `functions/api/[[path]].ts` without paid external geo-IP services:
     - Public IP: `cf-connecting-ip`
     - Network Operator / ISP: `request.cf.asOrganization`
     - Autonomous System: `request.cf.asn`
     - Location: `request.cf.city`, `request.cf.region`, `request.cf.country`
     - Client signature: `user-agent`
   - Logged to `public.user_security_logs` on signup, login, password reset, and OAuth callback.

## 18. Universal formatted user data export engine

1. **Interactive Standalone HTML Report (`.html`) — Recommended Format**:
   - Offline-capable self-contained HTML file viewable in any browser without third-party software.
   - Features executive bank-statement styling, metric summary cards, and tabular sections for:
     - Profile details & verification status
     - Security & IP/ISP telemetry logs
     - Phone/OTP order history with SMS codes received
     - Complete wallet transaction ledger with running balance after each entry
     - Payment deposit requests with 12-digit UTR / Binance Order IDs
     - Referral history and earnings
     - Support ticket history
   - Built-in **1-click "Print / Save to PDF"** button with specialized `@media print` styles for clean white-paper PDF output.
2. **Spreadsheet CSV (`.csv`)**:
   - Structured multi-section CSV format for direct analysis in Microsoft Excel or Google Sheets.
3. **Structured JSON (`.json`)**:
   - Formatted indented machine-readable backup for developer restoration and audits.
4. **Admin User Dossier Export**:
   - Accessible via the **Export** button on each row in `/admin/users` or via the **Export User Dossier** button inside the user details inspect modal.

## 19. In-site modal & toast notification framework

1. **Zero Browser-Level Popups**:
   - `showConfirm` in `apps/web/src/lib/confirm.ts` replaces standard browser `confirm()`, `alert()`, and `prompt()`.
   - Renders high-end frosted glass backdrop dialogs with accessible keyboard controls (`Escape` key, backdrop click).
2. **Toast Notifications**:
   - Powered by `toast` in `apps/web/src/lib/toast.ts`.
   - Displays animated, non-blocking toast alerts on payment approvals, ticket replies, setting saves, and ledger refreshes.

## 20. Admin audit trail & interactive payload inspector

1. **Structured Columns & Visual Hierarchy**:
   - Located at `/admin/audit` (`AuditLogManager.tsx`).
   - Replaced fragile unconstrained auto-tables with explicit column dimensions:
     - **Timestamp**: Formatted date with a dedicated time and clock indicator.
     - **Actor**: User avatar badge, registered email, and full name.
     - **Action**: Category-coded badges (purple for `settings.*`, emerald for `wallet.*`, red for `user.ban`/deletion, sky for `support.*`).
     - **Target**: Entity type pill and mono-spaced truncated target ID.
     - **Details / Payload Preview**: Human-readable summaries (e.g. badges for updated configuration keys, formatted monetary values for balance credits) with an interactive inspect trigger.
     - **IP Address**: Client IP with a 1-click clipboard copy button.
     - **Inspect**: Dedicated button opening the full record inspector.
2. **Interactive Payload Inspection Modal**:
   - Centered glassmorphism modal displaying complete record metadata, actor identity, target entity, and client IP.
   - Formatted, syntax-highlighted JSON viewer (`JSON.stringify(log.metadata, null, 2)`).
   - 1-click **Copy JSON** button with animated status feedback.
   - 1-click **Download JSON** file export button.
3. **Category Quick-Filter Chips & Audit Export**:
   - Instant filter chips for `All Actions`, `Settings`, `Wallet & Funds`, `Users & Roles`, and `Support`.
   - Dedicated search input with clear button.
   - "Export Trail" button to download all audit records as a compliance JSON document.

## 21. CI/CD pipeline & automated production safeguards

1. **GitHub Actions Workflow (`.github/workflows/verify.yml`)**:
   - Powered by the official `pnpm/action-setup@v4` action using locked pnpm `11.19.0`.
   - Node 22 runtime with native pnpm store dependency caching.
   - Runs frozen-lockfile installation, dependency vulnerability auditing, and automated verification.
2. **Verification Pipeline (`npm run verify:production`)**:
   - Builds static Astro routes (`apps/web`).
   - Builds and type-checks the API (`apps/api`).
   - Executes unit test suites (`functions/lib/*.test.ts`).
   - Enforces production guardrails (`scripts/production-guardrails.mjs`).
   - Runs automated smoke checks (`scripts/smoke-production.mjs`) with Cloudflare WAF tolerance.

## 22. Vector icon design system (zero emojis)

1. **Pure SVG Vector Standard**:
   - All visual indicators, brand marks, and action controls across the application use lightweight, accessible SVG vector graphics.
   - Completely eliminates platform emojis (such as unicode clock, lightning, document, and spreadsheet symbols) in favor of curated vector components:
     - `ZapIcon`
     - `ClockIcon`
     - `CheckIcon` / `CheckCircleIcon`
     - `AlertCircleIcon`
     - `ShieldIcon`
     - `EyeIcon`
     - `CopyIcon`
     - `DownloadIcon`
     - `SettingsIcon`
     - `DollarIcon`
     - `UsersIcon`
   - Guarantees visual consistency across iOS, Android, macOS, Windows, and Linux devices.
