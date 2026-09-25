# OTPWala production operations

For a clean deployment on a new domain, follow [`docs/FRESH-DOMAIN-HOSTING.md`](./docs/FRESH-DOMAIN-HOSTING.md) before using this release runbook.

## Release gates

1. For a new Supabase project, run `supabase/otpwala-standalone.sql` once. For an existing project, compare `npx supabase migration list --linked --workdir apps/api` with the real production schema before applying changes. Never blindly apply local-only migrations or rerun the standalone script over production.
2. Configure required secrets and public settings in Cloudflare Pages. Never expose server keys with a `PUBLIC_` prefix.
3. Require the GitHub `Verify production safeguards` workflow in `.github/workflows/verify.yml` to pass. Run the same gate locally with `npm run verify:production`.
4. Deploy the separate reconciliation Worker from `workers/wrangler.jsonc`, set its `CRON_SECRET`, and confirm its scheduled trigger runs every minute. The Worker calls `POST /api/cron/reconcile` with the bearer secret. Avoid creating a second scheduler without checking the existing trigger.
5. Confirm the Cloudflare deployment is for the intended `main` commit, then check `https://otpwala.me/api/health` and the public status page.

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
- Deposit approval: verify it changes the request to `approved`, creates exactly one `topup` ledger row, and updates wallet and navigation balances.
- Provider/API health and balance: review separately; a positive balance does not prove API health.
- Low provider-balance Telegram alerts use the Admin Settings threshold and are limited to two IST windows per day.
- Referral fraud alerts: review `public.referral_fraud_logs` for repeated IP/subnet collision attempts.
- Security and compliance logs: `public.user_security_logs` stores edge telemetry for audit trails and account rights requests.

## Production walkthrough

Use a staging project and disposable accounts for flows that spend money, change permissions, clear history, purge data, or send external notifications. Do not run destructive tests against real customer records.

### Guest experience

1. Open Home. Check navigation, slogan, footer, page title, canonical URL, and mobile menu. Opening the guest menu should lock background scrolling and the menu itself should not scroll.
2. Open Services and Countries. Search, sort/filter, open a service, and check catalog images, country flags, availability labels, and selected-currency prices.
3. Open Pricing, How It Works, Contact, Terms, Privacy, Refund Policy, Acceptable Use, and Status. Check page content and links; do not advertise a public Telegram channel that does not exist.
4. Check `/robots.txt`, `/sitemap-index.xml`, canonical URLs, and structured data on public pages. Confirm private pages use `noindex`.
5. At mobile, tablet, and desktop widths, check clipped text, horizontal overflow, navigation overlap, and keyboard focus. The connected in-app browser was unavailable during the audit, so this visual check remains outstanding.

### Authentication and customer experience

1. In staging, register an account, verify email, sign in by each enabled method, and test MFA enrollment with an invalid and valid authenticator code.
2. Sign in on a second device and confirm the first session is invalidated. Test sign-out, password reset, and session expiry.
3. Visit Dashboard, Buy Number, My Orders, Wallet, Referrals, Settings, and Support. Confirm signed-out users cannot retrieve protected data.
4. Check service/country filters, live stock and quote, displayed number, copy behavior, and primary-currency-only prices. Do not make a live purchase as part of routine smoke testing.
5. For a controlled staging order, verify waiting remains waiting with no refund. Test OTP receipt, provider-denied cancellation, provider-confirmed cancellation, and provider-confirmed expiry. Compare order status, ledger, balance, and transaction text after each result.
6. For a staging deposit, submit a unique payment reference, approve it once in Admin or the configured Telegram action, then verify one top-up ledger entry and the same balance in Wallet and navigation. Test duplicate-reference rejection and deposit rejection.
7. Test referral attribution with independent test accounts and a same-network collision case. Check referral history and fraud logs.
8. Create a support ticket, reply as user and admin, test status transitions and an allowed image attachment. Export test-account data. Test account deletion only with a disposable account through the approved review flow.

### Admin experience

1. Sign in as admin. Confirm a normal user cannot retrieve admin data or use admin APIs. Enroll and verify MFA for privileged accounts.
2. Check dashboard financial totals and integrity warnings against the ledger. A waiting order must not be displayed as refunded.
3. At phone and desktop widths, review Orders and Users. Check service/country icons, copying, OTP status, currency, sale/cost/profit placement, filters, and pagination. In the Users cards, confirm Registered and Last Login each show date and time together in the value column.
4. In staging, test global, service, country, and service-country pricing overrides. Confirm a quote before buying.
5. Test catalog enable/disable, featured ordering, and search in staging.
6. Test recharge review, one-time approve/reject, funding-source classification, and resulting ledger balance.
7. Test support queue, audit filters/export, settings save, operational alerts, and provider status.
8. With a disposable banned test user, verify Clear Activity (keeps deposits and balance), Clear All (resets spendable balance), retained audit data, and each Purge User mode. Never test a purge on a real account.
9. In a private test chat, test Telegram order modes: `completion_only` and `lifecycle`. Confirm lifecycle changes edit the same Telegram message when possible.

## Audit snapshot (2026-09-25)

- Historical live check: Cloudflare Pages showed production `main` at commit `be0f79c`; `/api/health` reported the website, database, and SMS provider operational. GitHub `main` has since advanced to `6ac9703` (including the responsive admin-user timestamp fix). Confirm the Cloudflare deployment separately before treating that commit as live.
- Production verification passed: web build, API type-check, 24 unit tests, production guardrails, and 10/10 unauthenticated smoke checks.
- Read-only GET checks returned HTTP 200 for the listed public pages, auth screens, customer dashboard pages, and admin page shells. This does not prove authenticated flows work.
- Web and API production dependency audits reported no known vulnerabilities.
- Supabase production migration history was reconciled against the live schema. All 30 local migration versions now appear in remote history through `20260925150000`; older schema/data effects were verified before recording their versions, and only the history-clear, RLS/index optimization, and unused-branding cleanup migrations were newly applied in this reconciliation.
- After the RLS and duplicate-index fixes, Supabase Advisors reported only the Auth leaked-password-protection warning. Enable it in the project's Auth settings (Pro plan or higher) and rerun Advisors to clear the final warning.
- Visual walkthrough of signed-in, payment, OTP, and responsive interactions was not completed because the connected in-app browser could not be opened.

The earlier automated release gate passed. Authenticated visual and payment/OTP flows still require staging checks; the Auth leaked-password setting also remains outstanding.

## Release verification

- Confirm the deployed commit is the intended `main` commit before announcing a release.
- Run `npm run verify:production` when investigating a failed hosted check. It covers the web build, API type-check, unit tests, production guardrails, and live unauthenticated smoke checks.
- A successful build does not verify payment settlement, provider credit, MFA enrollment, or authenticated UI flows; test these in staging or through the corresponding external operational checks.
- Before applying database changes, run `npx supabase migration list --linked --workdir apps/api` and safely reconcile local and remote history.

## Current deployment

- Production site: `https://otpwala.me`
- Cloudflare Pages preview URLs are unique to each deployment; use the Cloudflare Pages deployment list for the current URL.
- GitHub branch: `main`
- Reconciliation Worker: `https://otpwala-reconciliation.banhoga.workers.dev`

Manual deployment uses the workspace Wrangler installation:

```bash
npm --prefix apps/web run build
Push-Location apps/web
npx wrangler pages deploy dist --project-name=otpwala --commit-dirty=true
Pop-Location
npx wrangler deploy --config workers/wrangler.jsonc
```

## Recovery rule

Never repair balances by editing `profiles.wallet_balance` directly. Use the referenced admin API/RPC flow so the ledger remains auditable. Never delete or update ledger rows manually; use a backup/PITR restore when historical rows were removed accidentally.
