# ⚡ OTPWala

> High-speed virtual number marketplace for instant SMS & OTP verification powered by **Astro.js**, **React Islands**, **Cloudflare Pages Functions (Edge)**, **Express.js API**, **Supabase (PostgreSQL)**, and **Tiger SMS Provider API**.

**New here? Start with [the beginner setup guide](./docs/BEGINNER-SETUP.md) or [the complete architecture guide](./docs/OTPwala-Complete-Guide.md).**

---

## 🎯 Architecture Overview

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

## ✨ Key Features & Capabilities

### 1. Lightning Fast Astro Frontend (`apps/web`)
- **Astro SSG/SSR Architecture**: Blazing fast load times with modern glassmorphism dark aesthetic and responsive layouts.
- **Interactive React Islands (`client:load`)**:
  - **Live Buy Flow**: Real-time service picker (WhatsApp, Telegram, Google, Instagram, 100+ services), country selector (190+ countries), and instant pricing quotes in ₹ INR / $ USD.
  - **Real-Time OTP Room**: Live order status polling, countdown timer, sound alerts, 1-click clipboard copy for phone numbers and SMS verification codes, and automatic refunds for expired/cancelled orders.
  - **User Wallet (`/dashboard/wallet`)**: Live balance display, quick deposit presets, transaction ledger with running balance after every entry, and strict payment reference validation (strictly 12-digit numeric UPI UTR and numeric Binance Pay Order IDs).
  - **Order History (`/dashboard/orders`)**: Filter orders by status (`waiting`, `code_received`, `completed`, `cancelled`, `expired`) with in-place refresh feedback and toast notifications.
  - **Account Settings & Security (`/dashboard/settings`)**: Two-Factor Authentication (TOTP Authenticator app), active session command center with live IP and ISP carrier telemetry, single-device session protection, formatted data export, and in-site account deletion requests.

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
  - Includes a 1-click **"🖨️ Print / Save as PDF"** button with dedicated `@media print` styling for clean white-paper PDF saving.
- **Multi-Section CSV Spreadsheet (`.csv`)**: Formatted for import into Microsoft Excel or Google Sheets.
- **Structured JSON Archive (`.json`)**: Formatted indented machine-readable backup for developer restoration.
- **Admin Full User Dossier (`/admin/users`)**: 1-click download of any user's complete historical profile, IP/ISP login history, order history with SMS codes, wallet ledger, payment requests, referrals, and support tickets.

### 5. Universal In-Site Confirmation Modal System (Zero Browser Popups)
- Completely eliminates standard browser-level popups (`window.confirm`, `window.alert`, `window.prompt`).
- Powered by `showConfirm`: Beautiful frosted glass backdrop blur, centered cards, danger/warning/info badges, smooth spring animations, and keyboard accessibility (`Escape` key dismissal).

### 6. Admin Management Suite (`/admin`)
- **Dashboard Overview**: Financial health checks, provider balance status, platform revenue vs wallet liabilities, pending deposits with 1-click in-site approve/reject.
- **User Management (`/admin/users`)**: Search users, view balance details & ledger history, export complete user dossiers, credit funds with mandatory funding source, ban/unban, promote/demote, and toggle zero-markup status.
- **Funding Sources & Balance Sheet (`/admin/recharges`)**: Explicit distinction between cash collected (UPI / confirmed manual funding) and free granted balance (promotional/goodwill).
- **Dynamic Profit Margins (`/admin/pricing`)**: Percentage and fixed markup rules globally, per-service, or per-country with profit margin simulator.
- **Catalog Controls (`/admin/catalog`)**: Enable or disable services and countries with 1-click toggles and batch actions.
- **Order Audit Log (`/admin/orders`)**: Comprehensive platform audit log with phone numbers, OTP codes, provider cost vs selling price, and profit margins.
- **Support & Privacy Erasure Queue (`/admin/support`)**: Support tickets with threaded replies, internal admin notes, and data erasure approval workflows.
- **Audit Trail (`/admin/audit`)**: Immutable log of privileged administrator actions with search, filters, and refresh toasts.
- **System Settings (`/admin/settings`)**: Currency FX rates, USD/INR conversion, payment gateway credentials, Telegram bot token, webhook configuration, and maintenance mode toggles.

---

## 🚀 Quick Setup Guide

### 1. Prerequisites
- Node.js >= 20.0.0 (Recommended 22+)
- `pnpm` (run `npm install -g pnpm`)
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
- For an existing project: Apply migrations in [`apps/api/supabase/migrations`](./apps/api/supabase/migrations) in sequential order.

To promote your account to Admin:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
```

---

## 🏃 Running the Application

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

## 🧪 Testing & Verification

```bash
# Run unit tests
npm run test:unit

# Verify production safeguards
npm run test:guardrails

# Build web frontend for production
npm run build:web
```

---

## 🛡️ Security & Privacy Compliance
- **Server-Side Secret Isolation**: Provider API keys, service-role keys, and Telegram tokens are strictly isolated in server/edge runtimes and are **never** exposed in client bundles.
- **Single-Device Protection**: Automatic invalidation of displaced sessions protects user accounts against concurrent unauthorized use.
- **Pseudonymized Data Erasure**: Compliant with data privacy standards; user account deletion erases authentication and personal data while preserving legally mandated financial accounting records in pseudonymized form.
- **Zero Browser Popups**: All user confirmation flows are rendered within custom accessible styled dialogs.
