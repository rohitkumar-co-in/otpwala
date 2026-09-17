# ⚡ OTPWala

> High-speed virtual number marketplace for instant SMS & OTP verification powered by **Astro.js**, **React Islands**, **Express.js**, **Supabase**, and **Tiger SMS API**.

**New here? Start with [the beginner setup guide](./docs/BEGINNER-SETUP.md).**

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
┌──────────────────┐      ┌──────────────────────┐      ┌──────────────────┐
│   Astro.js Web   │◄────►│  Express.js Backend  │◄────►│  Supabase (PG)   │
│ (React Islands)  │ HTTP │   (@otpwala/api)     │  SQL │ - Profiles       │
│  - Landing Page  │      │ - Pricing Engine     │      │ - Orders & Logs  │
│  - Buy Flow      │      │ - Margin Rules       │      │ - Wallet Ledger  │
│  - User Wallet   │      │ - Atomic Balances    │      │ - Margin Rules   │
│  - Admin Suite   │      │ - Tiger SMS Client   │      │ - Row Level Sec  │
└──────────────────┘      └──────────────────────┘      └──────────────────┘
```

---

## ✨ Key Features

1. **Lightning Fast Astro Frontend (`apps/web`)**
   - Pure SSG/SSR speed with modern glassmorphism dark aesthetic.
   - Interactive React Islands (`client:load`) for interactive flows:
     - **Buy Flow**: Real-time service picker (WhatsApp, Telegram, Google, 100+ services), country picker (190+ countries), instant pricing quote in ₹ INR.
     - **Live OTP Waiting Room**: Real-time polling with progress countdown, instant clipboard copy for phone number & SMS code, auto-refund if cancelled or expired.
     - **User Wallet**: Balance display, quick preset top-ups, transaction audit history, UPI deposit instructions.
     - **Order History**: Filter by status (`waiting`, `code_received`, `completed`, `cancelled`, `expired`).

2. **Admin Suite (`/admin`)**
   - **Dashboard Overview**: Live Tiger SMS provider balance status, total platform revenue (₹), daily revenue, active waiting orders, user statistics.
   - **Pending Top-ups**: One-click approval for customer UPI / manual balance deposits.
   - **Dynamic Profit Margins (`/admin/pricing`)**: Set percentage or fixed margins globally, per-service, or per-country with interactive profit margin simulator.
   - **Catalog & Visibility Controls (`/admin/catalog`)**: Enable or disable any of the 100+ services and 190+ countries with 1-click toggles, plus batch actions ("Top Popular Only", "Enable All", "Disable All").
   - **User Management (`/admin/users`)**: Search users, manually credit wallet balances with custom notes, ban/unban users. Every admin credit must declare a funding source (manually funded = money received, or free funds = no money received).
   - **Funding Sources & Balance Sheet (`/admin/recharges`)**: Wallet funding is split into UPI top-ups (cash), manual funding confirmed by an admin (cash) and free funds granted by an admin (never revenue). Filter by source and see collected cash versus granted balance at a glance.
   - **Orders Audit Log (`/admin/orders`)**: Complete platform audit log with phone numbers, OTP codes, cost vs sell prices, timestamps.
   - **System Settings (`/admin/settings`)**: Configurable USD-to-INR conversion rate, fallback markups, UPI IDs, maintenance mode.

3. **Backend Service Layer (`apps/api`)**
   - **Tiger SMS API Client**: Wrapped with error handling, number purchase (`getNumber`), status polling (`getStatus`), order completion (`setStatus 6`), order cancellation (`setStatus 8`).
   - **Pricing Engine**: Multi-tiered resolution:
     - Specific Service + Country Rule ➔ Specific Service Rule ➔ Specific Country Rule ➔ Global Setting Fallback.
   - **Atomic Wallet Ledger**: Database stored procedures prevent race conditions and double-spending.
   - **Role-Based Access Control**: Supabase JWT authentication + Admin role middleware.

---

## 🚀 Quick Setup Guide

### 1. Prerequisites
- Node.js >= 18.0.0 (Recommended 20+)
- `pnpm` (run `npm install -g pnpm`)
- A free [Supabase](https://supabase.com) project
- Tiger SMS API Key (pre-configured in `.env`)

### 2. Install Dependencies
In the root directory `otpwala/`:
```bash
pnpm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` (or customize the existing `.env`):
```env
TIGER_SMS_API_KEY=your-tiger-sms-api-key
TIGER_SMS_BASE_URL=https://api.tiger-sms.com

# Your Supabase Project Settings
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
PUBLIC_API_URL=http://localhost:3001
```

### 4. Database Setup (Supabase)
For a new Supabase project, run [`supabase/otpwala-standalone.sql`](./supabase/otpwala-standalone.sql) once in the SQL Editor. It contains the base schema and all migrations in dependency order.

For an existing project, run each file in [`apps/api/supabase/migrations`](./apps/api/supabase/migrations) once, in filename order. Do not rerun the standalone file over production.

The financial model keeps `wallet_transactions` as the single immutable balance ledger. Read-only views separate reporting into `wallet_topups`, `wallet_deductions`, `wallet_refunds`, `wallet_admin_funding`, and `wallet_referral_bonuses`.

Funding categories are explicit:

- `topup`: customer payment submitted through the website and approved by an admin.
- `admin_credit`: money received outside the website and manually credited.
- `admin_grant`: free balance added by an admin; never revenue.

Never edit `profiles.wallet_balance` or `wallet_transactions` directly in production. Use the application RPCs/admin flows so balances and history remain consistent.

To promote your user account to Admin:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
```

---

## 🏃 Running the Application

### Start Both Frontend & Backend Concurrently:
```bash
pnpm dev
```

Or run individually:
```bash
# Terminal 1: Express Backend (Port 3001)
pnpm dev:api

# Terminal 2: Astro Frontend (Port 4321)
pnpm dev:web
```

- **Frontend**: [http://localhost:4321](http://localhost:4321)
- **Backend API**: [http://localhost:3001](http://localhost:3001)
- **Admin Panel**: [http://localhost:4321/admin](http://localhost:4321/admin) (Requires admin role)

---

## 🛡️ Security & Reliability
- Upstream Tiger SMS API key is stored strictly on the server backend (`apps/api`) and is **never** exposed to the client.
- Orders are automatically refunded to the user's wallet if Tiger SMS does not receive an SMS or if the order is cancelled within the active window.
- Rate limiting is configured on all API endpoints to protect against abuse.
- Keep `.env` and `supabse-cred/` local and ignored; never commit service-role, Tiger, Telegram, payment, or cron secrets.
- Before release, run `npm run verify:production` and confirm the Cloudflare Pages deployment uses the intended `main` commit.
