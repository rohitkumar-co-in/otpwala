# OTPWala production operations

## Required deployment order

1. Rotate the Tiger SMS API key and Supabase service-role key if they have ever appeared in source history.
2. For a new project, run `supabase/otpwala-standalone.sql` once. For an existing project, apply every file in `apps/api/supabase/migrations` once, in filename order; never rerun the standalone file over production.
3. Configure every variable documented in `.env.example` in Cloudflare; never expose server keys with a `PUBLIC_` prefix.
4. Deploy only after the GitHub `Verify production safeguards` workflow in
   `.github/workflows/verify.yml` succeeds. It runs the same gate locally with:
   `npm run verify:production`.
5. Schedule `POST /api/cron/reconcile` every minute with `Authorization: Bearer <CRON_SECRET>`.

## Financial definitions

- **Total funds collected:** completed `topup` and `admin_credit` transactions. `admin_grant` is free balance and never revenue.
- **Funding views:** use `wallet_topups`, `wallet_deductions`, `wallet_refunds`, `wallet_admin_funding`, and `wallet_referral_bonuses` for read-only reporting. `wallet_transactions` remains the only balance source of truth.
- **Total orders:** every successfully recorded provider number purchase, regardless of outcome.
- **OTP delivered:** orders with an OTP code or a delivered/completed status.
- **OTP not received:** cancelled, expired, or refunded orders without an OTP code.
- **Gross OTP sales:** selling prices of OTP-delivered orders only.
- **Provider cost:** purchase-time provider cost converted using the stored purchase-time FX rate.
- **Gross profit:** gross OTP sales minus provider cost. It is not accounting net profit.
- **Wallet liability:** the sum of customer wallet balances.

## Daily checks

- Refunds pending or failed for more than 10 minutes: zero.
- Waiting orders past `expires_at`: zero after reconciliation.
- Wallet transactions without a business reference: investigate.
- Approved payment requests without a matching `wallet_topups` row: investigate before approving another request.
- Profile balances without a matching latest ledger balance: investigate; do not repair by direct SQL edits.
- Duplicate UTR submissions: blocked by the unique database index.
- Provider/API health and balance: review separately; a positive balance does not prove API health.

## Release verification

- The repository must be clean before release: `git status --short` should return no files.
- Confirm the deployed commit is the intended `main` commit before announcing a release.
- Run `npm run verify:production` locally when investigating a failed hosted check; it covers the web build, API type-check, unit tests, production guardrails, and live unauthenticated smoke checks.
- A successful build does not verify payment settlement, provider credit, or administrator MFA; those require the corresponding external operational checks.

## Recovery rule

Never repair balances by editing `profiles.wallet_balance` directly. Use the referenced admin API/RPC flow so the ledger remains auditable. Never delete or update ledger rows manually; use a backup/PITR restore when historical rows were removed accidentally.
