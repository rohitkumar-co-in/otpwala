# OTPWala

> OTPWala helps customers check service and country availability, view current prices, and use virtual numbers for SMS verification. The production web app uses **Astro**, **React**, **Cloudflare Pages Functions**, and **Supabase**. An optional Express API is also included for local or alternate deployments.

**New here? Start with [the beginner setup guide](./docs/BEGINNER-SETUP.md) or [the complete architecture guide](./docs/OTPwala-Complete-Guide.md).**

---

## Architecture Overview

```
                          ┌──────────────────────┐
                          │   Tiger SMS API      │
                          │ (Upstream Provider)  │
                          └──────────┬───────────┘
                                     │
                        Base cost ($)│ Activation / SMS Polling
                                     ▼
┌──────────────────┐      ┌──────────────────────────┐      ┌──────────────────┐
│   Astro.js Web   │◄────►│ Cloudflare Pages / API   │◄────►│  Supabase (PG)   │
│ (React Islands)  │ HTTP │ (@otpwala/web & /api)    │  SQL │ - Profiles       │
│  - Landing Page  │      │ - Dynamic Pricing Engine │      │ - Orders & Logs  │
│  - Buy Flow      │      │ - Single-Device Session  │      │ - Wallet Ledger  │
│  - User Wallet   │      │ - Referral Fraud Engine  │      │ - Security Logs  │
│  - Admin Suite   │      │ - IP/ISP Edge Telemetry  │      │ - Margin Rules   │
│  - Export Engine │      │ - Universal Data Export  │      │ - Row Level Sec  │
└──────────────────┘      └──────────────────────────┘      └──────────────────┘
```

---

## Key Features & Capabilities

### 1. Lightning Fast Astro Frontend (`apps/web`)
- **Astro static-site architecture**: Public pages are prebuilt for fast delivery, with responsive layouts and interactive React components for account and admin tasks.
- **Interactive React Islands (`client:load`)**:
  - **Service and country browsing**: Search available services and countries, see provider catalog icons and country flags, filter by availability, and view prices in the selected currency.
  - **Number purchase and OTP status**: Follow a number from waiting to OTP received, cancellation, or expiry. Copy the phone number without its country calling code, or copy a received OTP.
  - **Refund status**: A waiting order is not treated as refunded. A refund is recorded only after the provider confirms cancellation or expiry; a denied cancellation leaves the order active.
  - **Wallet (`/dashboard/wallet`)**: Shared balance display, deposit requests, and a transaction history. User-facing prices show only the currency selected by the user.
  - **Order history (`/dashboard/orders`)**: Filter orders by status, view service and country icons, and refresh the current history.
  - **Settings and security (`/dashboard/settings`)**: TOTP authenticator MFA, active-session information, single-device session protection, data export, and account-deletion requests.
  - **Responsive navigation and pages**: Public, customer, and admin pages adapt to phone, tablet, and desktop layouts.

### 2. Multi-Tiered Referral Fraud Prevention Engine
- **Network-Level Fraud Defense**:
  - **Direct IP Collision**: Blocks referee and referrer sharing identical public IPs.
  - **IPv6 Cellular Subnet Matching (`/64` prefix)**: Indian cellular carriers (Reliance Jio, Bharti Airtel, Vodafone Idea) allocate a `/64` IPv6 prefix to a single subscriber or mobile hotspot. Accounts sharing the first 4 blocks of IPv6 are flagged and blocked from claiming referral bonuses.
  - **IPv4 Local Subnet Matching (`/24` prefix)**: Detects shared local networks, LANs, and local proxies.
  - **Historical Telemetry Cross-Referencing**: Analyzes `user_security_logs` to ensure accounts that ever shared network access on previous days cannot exploit the referral system.
  - **Automated Anti-Abuse Actions**: Auto-downgrades suspicious deposits, suppresses illegitimate upline referral payouts, and logs forensic evidence to `referral_fraud_logs`.

### 3. Single-Device Session Enforcement & Security Telemetry
- **Concurrent Device Protection**: Restricts user accounts to one active authenticated device at any given time. Signing in on a new phone or browser invalidates previous device sessions immediately.
- **Cloudflare Edge Telemetry**: Captures Zero-Cost edge headers (`cf-connecting-ip`, `asOrganization` e.g. *Reliance Jio Infocomm Ltd*, *Bharti Airtel Ltd*, ASN, and Country/City) into immutable audit tables (`user_security_logs`).

### 4. Universal Data Export & Formatted Dossier Engine
- **Interactive Standalone HTML Report (`.html`) — Best Format**:
  - Double-click to open in any web browser without third-party software.
  - Formatted like an executive bank audit statement with OTPWALA branding, summary stat cards, and styled tables.
  - Includes a 1-click **"Print / Save as PDF"** button with dedicated `@media print` styling for clean white-paper PDF saving.
- **Multi-Section CSV Spreadsheet (`.csv`)**: Formatted for import into Microsoft Excel or Google Sheets.
- **Structured JSON Archive (`.json`)**: Formatted indented machine-readable backup for developer restoration.
- **Admin Full User Dossier (`/admin/users`)**: 1-click download of any user's complete historical profile, IP/ISP login history, order history with SMS codes, wallet ledger, payment requests, referrals, and support tickets.

### 5. Universal In-Site Confirmation Modal System (Zero Browser Popups)
- Completely eliminates standard browser-level popups (`window.confirm`, `window.alert`, `window.prompt`).
- Powered by `showConfirm`: Beautiful frosted glass backdrop blur, centered cards, danger/warning/info badges, smooth spring animations, and keyboard accessibility (`Escape` key dismissal).

### 6. Admin Management Suite (`/admin`)
- **Dashboard Overview**: Financial health checks, provider balance status, platform revenue vs wallet liabilities, pending deposits with 1-click in-site approve/reject.
- **User Management (`/admin/users`)**: Search users, view balance details & ledger history, export complete user dossiers, credit funds with mandatory funding source, ban/unban, promote/demote, and toggle zero-markup status.
- **History controls**: Superadmins can hide a user's visible activity while keeping the account, either preserving deposits and balance or hiding all visible history and resetting the spendable balance. This is separate from the existing irreversible Purge User action.
- **Funding Sources & Balance Sheet (`/admin/recharges`)**: Explicit distinction between cash collected (UPI / confirmed manual funding) and free granted balance (promotional/goodwill).
- **Dynamic Profit Margins (`/admin/pricing`)**: Percentage and fixed markup rules globally, per-service, or per-country with profit margin simulator.
- **Catalog Controls (`/admin/catalog`)**: Enable or disable services and countries with 1-click toggles and batch actions.
- **Order Audit Log (`/admin/orders`)**: Service and country icons, phone numbers, OTP status, sale price, provider cost, and gross profit.
- **Support & Privacy Erasure Queue (`/admin/support`)**: Support tickets with threaded replies, internal admin notes, and data erasure approval workflows.
- **Admin Audit Trail (`/admin/audit`)**: Immutable log of privileged administrator actions with structured columns, categorized color-coded action badges, live payload previews, interactive JSON inspection modal with 1-click copy and file download, and full JSON audit trail export.
- **System Settings (`/admin/settings`)**: Currency rates, payment instructions, Telegram admin notifications, order notification mode, provider balance alerts, and maintenance controls.
  - **Order notifications** can be limited to OTP-completed orders or use one Telegram message per order that is updated as its status changes.

---

## Quick Setup Guide

### 1. Prerequisites
- Node.js >= 22.12.0
- `pnpm` 11.19.0 (run `npm install -g pnpm@11.19.0`)
- A [Supabase](https://supabase.com) project
- Tiger SMS API Key

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```env
TIGER_SMS_API_KEY=your-tiger-sms-api-key
TIGER_SMS_BASE_URL=https://api.tiger-sms.com

# Supabase Project Settings
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
PUBLIC_API_URL=http://localhost:3001
```

### 4. Database Setup (Supabase)
- For a new Supabase project: Run [`supabase/otpwala-standalone.sql`](./supabase/otpwala-standalone.sql) once in the SQL Editor.
- For an existing project: first compare migration history with `npx supabase migration list --linked --workdir apps/api`. Do not blindly apply local-only migrations to a database that may have received the same SQL manually. Review and reconcile the schema and migration history before applying changes.
- Current migrations include user-history controls, hardened and optimized RLS policies, and removal of duplicate indexes. Supabase production migration history was reconciled through `20260925140000`; only the Auth leaked-password-protection setting remains an Advisor warning, and it must be enabled in Supabase Auth settings. See [the complete setup guide](./docs/OTPwala-Complete-Guide.md) for safe migration procedures.

To promote your account to Admin:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
```

---

## Running the Application

### Start Development Server:
```bash
pnpm dev
```

Or run individual services:
```bash
# Terminal 1: Express API (Port 3001)
pnpm dev:api

# Terminal 2: Astro Web App (Port 4321)
pnpm dev:web
```

- **Web Frontend**: [http://localhost:4321](http://localhost:4321)
- **API Server**: [http://localhost:3001](http://localhost:3001)
- **Admin Panel**: [http://localhost:4321/admin](http://localhost:4321/admin) (Requires admin role)

---

## Testing & Verification

```bash
npm run verify:production
```

Cloudflare deployment after `npx wrangler login`:

```bash
npm --prefix apps/web run build
Push-Location apps/web
npx wrangler pages deploy dist --project-name=otpwala --commit-dirty=true
Pop-Location
npx wrangler deploy --config workers/wrangler.jsonc
```

---

## Security & Privacy Compliance
- **Server-Side Secret Isolation**: Provider API keys, service-role keys, and Telegram tokens belong in server/edge settings and must never be exposed in client bundles.
- **Single-Device Protection**: Automatic invalidation of displaced sessions protects user accounts against concurrent unauthorized use.
- **Pseudonymized Data Erasure**: Compliant with data privacy standards; user account deletion erases authentication and personal data while preserving legally mandated financial accounting records in pseudonymized form.
- **Zero Browser Popups**: All user confirmation flows are rendered within custom accessible styled dialogs.
- **Catalog visuals**: Service artwork and country flags come from the configured catalog; status, action, and navigation symbols use the site's SVG icon set.
