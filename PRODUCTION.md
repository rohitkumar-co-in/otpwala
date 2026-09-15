# OTPWala production operations

## Required deployment order

1. Rotate the Tiger SMS API key and Supabase service-role key if they have ever appeared in source history.
2. Apply all files in `apps/api/supabase/migrations` to the production Supabase project.
3. Configure every variable documented in `.env.example` in Cloudflare; never expose server keys with a `PUBLIC_` prefix.
4. Deploy only after the GitHub `Production checks` workflow succeeds.
5. Schedule `POST /api/cron/reconcile` every minute with `Authorization: Bearer <CRON_SECRET>`.

## Financial definitions

- **Total funds collected:** completed `topup` wallet transactions only. Admin credits are excluded.
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
- Duplicate UTR submissions: blocked by the unique database index.
- Provider/API health and balance: review separately; a positive balance does not prove API health.

## Recovery rule

Never repair balances by editing `profiles.wallet_balance` directly. Post a referenced `admin_credit` through the admin API so the ledger remains auditable.

