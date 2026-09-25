# Host OTPWala on a New Domain

This is the end-to-end checklist for launching a separate OTPWala installation on a new domain. It covers the application, database, DNS, authentication, scheduled reconciliation, and go-live checks. Use placeholders below and keep every account, database, and secret under the new operator's control.

> Important: this repository currently contains OTPWala-specific domain and Cloudflare project values. A new deployment is not domain-neutral until the references in Step 3 are updated. Do not point a new domain at the existing production database unless you intentionally want to move the current live site.

## 1. Decide what you are launching

Write down these values before setup:

| Setting | Example | Notes |
| --- | --- | --- |
| Canonical website origin | `https://example.com` | Choose either the apex (`example.com`) or `www.example.com`; redirect the other to it. |
| Cloudflare Pages project name | `otpwala-new-site` | Must be unique in your Cloudflare account. |
| Supabase project | `otpwala-production` | Create a new project and database for this installation. |
| Support email | `support@example.com` | Set up and test this mailbox before publishing it. |
| Public brand name | `OTPWala` | Change only if you own the rights and intend to rebrand the product. |

Decide whether this will be a fresh service with no existing customer accounts, or a migration of the existing live service. These instructions create an empty database. Moving customer identities, wallet balances, payment history, orders, provider credentials, and the existing domain requires a separately planned migration and a verified backup; do not point the new app at production and do not copy production secrets into a test installation.

## 2. Accounts, access, and prerequisites

Have owner/admin access to:

- The domain registrar and its DNS settings.
- Cloudflare, including Pages, DNS, SSL/TLS, and Workers.
- GitHub and the repository that will deploy the site.
- Supabase, including Auth, SQL Editor, project API keys, and database settings.
- Tiger SMS, with an API key and funded provider balance.
- Google Cloud only if Google sign-in will be enabled.
- A transactional email provider and a mailbox at the new domain. Email OTP, verification, and password reset must be deliverable reliably.
- Telegram only if you want private admin alerts.

Install Node.js 22 or newer and pnpm 11.19.0. On Windows, use PowerShell for the commands below. On macOS/Linux, use the matching shell commands.

## 3. Create a deployment copy and update domain-specific values

1. Create a private or public fork/copy of the repository in a GitHub account you control. Protect `main` and require the verification workflow to pass before merging.
2. Clone your copy and install the locked dependencies:

   ```bash
   git clone https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
   cd YOUR-REPOSITORY
   pnpm install --frozen-lockfile
   ```

3. Search before editing to discover any newly added domain-specific references:

   ```bash
   rg -n "otpwala\.me|otpwala\.pages\.dev|otpwala-reconciliation|project-name=otpwala" apps functions workers package.json
   ```

4. Update the references that define the live origin or deployment identity:

   - `apps/web/astro.config.mjs`: set Astro's `site` to the chosen canonical HTTPS origin. This is used by Astro tooling and generated URLs.
   - `apps/web/src/layouts/BaseLayout.astro` and public page templates: update canonical URLs, structured data, social preview URLs, legal website/contact details, and any old support email. Keep SEO URLs on one canonical host. Search other files from Step 3 and update page-specific structured data too.
   - `functions/api/[[path]].ts`: update the allowed CORS origin if the API will be called from a separate origin. The recommended deployment serves the API as same-origin `/api` Pages Functions and leaves `PUBLIC_API_URL` unset. Do not use `*` for credentialed API access.
   - `apps/web/src/components/dashboard/ReferEarnPage.tsx` and `functions/lib/telegram.ts`: update any old-domain fallback URLs so referral links and notification buttons use the new site.
   - `workers/otpwala-reconciliation.js`: point `RECONCILIATION_URL` at `https://YOUR-CANONICAL-DOMAIN/api/cron/reconcile`.
   - `workers/wrangler.jsonc`: choose a unique Worker name.
   - `workers/configure-reconciliation.mjs`, the root `package.json`, and `apps/web/package.json`: update any hard-coded Cloudflare Pages project name used by deployment/configuration commands.
   - Email and legal pages: update contact addresses, domain names, business/operator identity, and disclosures only to accurate details. Have the Terms, Privacy, Refund, and Acceptable Use pages reviewed for the new operator and jurisdiction before accepting customers.

   Do not replace every occurrence of the brand name mechanically. The brand can remain OTPWala while the domain changes. Likewise, only change email addresses if the new mailbox exists and is monitored.

5. Run the verification commands in Step 12 and review the diff. Search again for old production origins. Remaining references should be intentional, such as a migration note or an unrelated upstream-provider URL.

## 4. Create and prepare the Supabase project

1. Create a new hosted Supabase project in the region closest to your customers and application. Save the database password in a password manager. Enable backups/PITR appropriate to the service's recovery requirements.
2. In Project Settings → API, record the project URL, publishable/anon key, and service-role key. The publishable/anon key is allowed in the browser; it is not a substitute for correct RLS. The service-role key bypasses RLS and must stay server-side.
3. Open the SQL Editor in this new, empty project and run `supabase/otpwala-standalone.sql` exactly once. This consolidated schema contains the base schema and the current migrations. Never run it on the existing OTPWala production database or on a project containing customer data.
4. The SQL Editor does not populate the CLI migration-history table. If you intend to maintain this database with Supabase CLI, first install the standalone schema, then link the CLI and mark the versions represented by that schema as applied. This records history only; it does not run SQL:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF --workdir apps/api
   npx supabase migration list --linked --workdir apps/api
   ```

   Confirm that the standalone schema was run successfully on this exact empty project. Then, from PowerShell, reconcile each migration file represented by the standalone schema:

   ```powershell
   Get-ChildItem apps/api/supabase/migrations/*.sql | ForEach-Object {
     $version = $_.BaseName.Split('_')[0]
     npx supabase migration repair $version --status applied --linked --workdir apps/api
     if ($LASTEXITCODE -ne 0) { throw "Could not record migration $version" }
   }
   npx supabase migration list --linked --workdir apps/api
   ```

   Do not mark versions applied if the standalone schema did not finish. For every future database update, review the migration SQL and remote history first, then use the normal migration workflow. Never use `db reset` against a production project. See [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations).

5. In Supabase Auth → URL Configuration:
   - Set Site URL to the canonical origin, for example `https://example.com`.
   - Add the exact production redirects used by the app, including `https://example.com/auth/callback` and `https://example.com/auth/reset-password`.
   - Add localhost redirects only if you need local development. Add preview URLs narrowly and remove them when no longer needed. Do not allow arbitrary redirect domains.
6. Configure Auth email delivery with a production SMTP provider. Verify the sender domain and configure its SPF, DKIM, and DMARC records at DNS. Test OTP/verification and password-reset delivery, expiry, links, sender name, and spam placement. Do not rely on a low-volume test email service for production.
7. If the Supabase Security Advisor reports leaked-password protection disabled, enable it in Auth settings if available on your plan. Review all new-project Security Advisor and Performance Advisor findings after the schema is installed.

## 5. Configure Google sign-in (optional)

1. In Google Cloud Console, create/select the correct project, configure the OAuth consent screen, and create a web OAuth client. Use the real app name, authorized domains, support email, and privacy/terms URLs. Publish/verify the consent screen as required for your audience.
2. In the Google OAuth client, add the Supabase Auth callback URL shown by your Supabase project, usually `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`, as an authorized redirect URI. This is the Supabase callback, not your website's `/auth/callback` page.
3. In Supabase Auth → Providers → Google, enable the provider and enter the Google client ID and secret.
4. Test Google sign-in on the canonical domain and confirm the user returns to `/auth/callback`, completes any required MFA, and reaches the expected page. Keep OAuth secrets out of Git and browser variables.

If you do not configure Google, confirm the login page does not invite users to use it or clearly disable the option before launch.

## 6. Add the domain to Cloudflare and preserve existing DNS

1. Add the domain as a Cloudflare zone if you plan to use the apex domain (`example.com`). Cloudflare Pages requires the apex zone to be on the same Cloudflare account as the Pages project.
2. At the registrar, set the nameservers to the exact Cloudflare nameservers shown for the zone. Before changing them, copy/recreate all existing records needed for email, verification, and other services, especially MX, SPF, DKIM, DMARC, and ownership TXT records. A nameserver change can interrupt email if these are missed.
3. Wait until Cloudflare reports the zone active. Do not guess DNS addresses or delete records to speed up activation.
4. For a subdomain only (for example, `app.example.com`), keep DNS at the current provider if desired and create the CNAME Cloudflare Pages instructs you to use. First attach the custom domain in Pages; a CNAME by itself is not enough to activate it.

Follow the current [Cloudflare Pages custom-domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/). Do not switch live DNS until the project has a successful deployment and the custom domain is ready to attach.

## 7. Create the Cloudflare Pages project

1. In Cloudflare → Workers & Pages, create a Pages project from your GitHub copy. Authorize only the repository you intend to deploy.
2. Use the repository root as the project root. Configure the build:

   | Field | Value |
   | --- | --- |
   | Production branch | `main` |
   | Build command | `npm run build:web` |
   | Build output directory | `apps/web/dist` |
   | Node.js version | `22` (or the currently supported version required by the project) |

   The root build script installs no dependencies itself. Configure the build system to run `pnpm install --frozen-lockfile` before the build, or use the Cloudflare-supported pnpm install detection with the checked-in `pnpm-lock.yaml`. Confirm build logs show `apps/web/scripts/sync-pages-functions.mjs` ran; it copies the shared root `functions/` source into the web project before Astro builds. Pages Functions are required for `/api/*`; do not deploy this as a plain static-only host.

3. Add the domain in Pages → your project → Custom domains. Attach the canonical hostname and, if desired, the alternate `www`/apex hostname. Configure a Cloudflare redirect from the alternate host to the one canonical origin and use a permanent redirect only after testing. Wait for the certificate/HTTPS status to become active before launch.
4. Add production environment variables and secrets in Pages → Settings → Variables and Secrets. Set them for the production environment (and set separate values for previews if previews are enabled):

   **Public build variables** (available in the browser):

   - `PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`
   - `PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY`
   - Leave `PUBLIC_API_URL` unset/empty for the same-origin `/api` setup.

   **Server-only secrets/variables** (mark secret values as secrets):

   - `SUPABASE_URL` — same project URL. The API reads the public/anon key from `PUBLIC_SUPABASE_ANON_KEY` too.
   - `SUPABASE_SERVICE_ROLE_KEY` — secret; never prefix with `PUBLIC_`.
   - `TIGER_SMS_API_KEY` — secret; use the new installation's own provider credential.
   - `TIGER_SMS_BASE_URL=https://api.tiger-sms.com`.
   - `CRON_SECRET` — a newly generated, long, random secret.

   Use unique credentials for production, previews, local development, and each new installation. Do not reuse the current live site's service-role, provider, OAuth, or cron secrets. Do not commit `.env` files or paste secrets into issues, docs, or screenshots.

5. Trigger a production build. Check Cloudflare build logs and the preview/`pages.dev` deployment before attaching customer traffic. If the project name differs from the existing `otpwala` name, update hard-coded project names in the deploy scripts noted in Step 3.

Cloudflare's Git integration runs the repository's GitHub verification workflow separately from Pages builds. Confirm both GitHub Actions and the Pages deployment succeed; a passing workflow alone does not mean Pages deployed.

## 8. Configure and test the reconciliation Worker

The Worker calls the website's `/api/cron/reconcile` endpoint every minute to finish eligible waiting orders, process provider updates, and keep wallet/order state consistent. It must target the new canonical domain and share the exact `CRON_SECRET` with Pages.

1. Update the Worker name in `workers/wrangler.jsonc` and the target URL in `workers/otpwala-reconciliation.js` as described in Step 3.
2. From the repository root, deploy the Worker and set its secret when prompted/configured:

   ```bash
   npx wrangler login
   npx wrangler deploy --config workers/wrangler.jsonc
   npx wrangler secret put CRON_SECRET --config workers/wrangler.jsonc
   ```

3. Enter the same generated value as the Pages `CRON_SECRET` secret. Do not put the value in the committed Worker config or source.
4. Check the Worker dashboard for a successful scheduled invocation. Test the authenticated endpoint only with the Worker secret and a safe staging project. An unauthenticated request should not trigger reconciliation.

If you use `workers/configure-reconciliation.mjs`, review it first: it contains project-specific deployment identifiers and performs real Cloudflare secret/deploy operations. Update it for the new project before running it.

## 9. Set up the first admin and operational settings

1. Visit the HTTPS canonical origin and create your owner account through the normal registration flow. Verify email before continuing.
2. Promote that exact account using the Supabase SQL Editor:

   ```sql
   UPDATE public.profiles
   SET role = 'admin', updated_at = now()
   WHERE email = 'owner@example.com';
   ```

   Confirm exactly one row was updated. Sign out and back in so the new role is reflected in a fresh session. Grant `superadmin` only to the trusted owner account that needs destructive user-history/purge approvals; do not make every administrator a superadmin.

3. In Admin → Settings, set the currency exchange rate and mode, default markup, minimum/maximum deposit limits, payment instructions/UPI details, and maintenance/catalog settings. Confirm values and fees with the actual business owner before accepting funds.
4. Add Telegram bot credentials/chat ID only if private admin alerts are required. Choose and test the order notification mode. Do not advertise a Telegram customer-support channel unless one exists and is monitored.
5. Check Tiger SMS credentials and provider balance. Make a low-value controlled test only after the account, refund path, and support process are ready. Do not use real customer funds for testing.
6. Verify the support email, privacy contact, legal operator name, refund process, supported customer locations, age/use restrictions, provider disclosures, and data-retention process. Obtain local legal/accounting advice where needed; this guide is operational, not legal advice.

## 10. DNS, redirects, and email checklist

- HTTPS certificate is active for the canonical domain.
- Apex and `www` (or chosen app subdomain) resolve as intended; the alternate hostname redirects to the canonical one.
- No stale A, AAAA, or CNAME record points the website hostname to an old host.
- MX, SPF, DKIM, DMARC, and required Supabase/Google verification TXT records are present and correct.
- Supabase Auth Site URL and redirect allow-list use the canonical hostname.
- Google authorized domain and callback URI match the new installation.
- Cloudflare Pages production variables are set, preview secrets are not accidentally copied from production, and the Worker uses the matching cron secret.

## 11. Launch smoke test

Use a new test account and a small, controlled budget. Complete the following before announcing the domain:

### Public site and delivery

- Home page loads over HTTPS with no console/runtime errors. Check every public page, navigation link, footer, contact address, logo, social preview, canonical URL, robots rules, and sitemap.
- Test phone, tablet, and desktop widths, keyboard navigation, contrast, menu behavior, clipped content, and horizontal overflow.
- Check the complete Services and Countries directories, their search/filter controls, the responsive footer link groups, and table-card readability without expecting a load-more action.
- Confirm canonical URLs, structured data, `robots.txt`, and sitemap all use the new domain. Remove any `noindex` launch setting from pages intended for search, while keeping private/admin pages out of indexing.
- Test from a private browser session and at least one external mobile connection.

### Authentication and database

- Register, verify email, log in and out, refresh the page, and use password reset. Verify all email links return to the new domain.
- Test Google sign-in if enabled. Confirm unprivileged users cannot access `/admin` data or functions.
- Enroll MFA on the owner/admin account and test valid and invalid codes.
- Confirm a signup creates the corresponding profile and referral code. Check Supabase logs and advisors for errors/warnings.

### Catalog, payments, and order lifecycle

- Confirm service artwork, country flags, stock, provider quotes, and primary-currency-only user prices are valid.
- Check currency and markup math with a quote before purchase.
- Verify UPI/payment instructions are yours and correct. Test a deposit through the approved method, approve once, and confirm one ledger entry and the same balance in the wallet and navigation. Verify duplicate payment references are rejected.
- With a small controlled test order, check number formatting and copy, waiting state, OTP display, cancellation denial, provider-confirmed cancellation/refund, and expiry/refund. A waiting order must not show as refunded. Check Worker and API logs for reconciliation.

### Admin and operations

- Verify dashboard totals against the wallet ledger, user details, admin order status/price/profit fields, phone layouts, pagination, search, catalog controls, top-up review, audit logs, support, and exports. Confirm recent overview orders show the available profile image, email, shortened order ID, and copy action; confirm the Users page labels account IDs as **User ID**.
- Confirm refunded amounts match sale amounts in font size, weight, and success color in both admin and customer order views. Check table text emphasis across pages while preserving semantic badge colors.
- Verify admin roles, MFA, alert routing, and that destructive user history/purge controls are available only to the intended superadmin. Never run purge tests on real customer accounts.
- Check `https://YOUR-CANONICAL-DOMAIN/api/health` and `/status`. Confirm the Pages deployment, Worker cron, Supabase, email, and provider all report healthy.
- Confirm GitHub Actions is green, Cloudflare Pages deployed the expected commit, and no production secrets appear in Git history or browser bundles.
- Set up monitoring for domain expiry, billing/quotas, failed Pages/Worker deployments, Supabase backups, provider balance, SMTP delivery, and failed reconciliation/refunds.

Do not use automated smoke tests as proof that payment processing or real SMS delivery is safe. The full production verification command also contacts live endpoints; read `PRODUCTION.md` and run financial/destructive checks only against staging/disposable accounts.

The smoke test defaults to `https://otpwala.me`. For a new installation, set `OTPWALA_ORIGIN` so the checks target the new deployment rather than the existing site. In PowerShell:

```powershell
$env:OTPWALA_ORIGIN = 'https://example.com'
npm run verify:production
Remove-Item Env:OTPWALA_ORIGIN
```

Only run this after DNS, HTTPS, the database, required secrets, and the Worker are configured. The verification suite includes live unauthenticated requests; the smoke test checks protected-route boundaries but does not perform a purchase or payment.

## 12. Backup and rollback

Before launch, record the commit SHA, deployment ID, Pages project/domain mapping, Supabase project reference, migration versions, and secret names (not secret values). Follow [`DATABASE-BACKUPS.md`](./DATABASE-BACKUPS.md) to enable the GitHub Actions logical database dump, including the exact Session Pooler URI selection path, and test restoring it. This dump excludes Supabase-managed Auth and Storage schemas, so it is not a full project recovery plan. Keep an encrypted copy of required credentials in a password manager or secrets vault.

- Run `npm run clean` before making a source backup if you want to omit generated output. This removes root/web/API `dist` and `apps/web/.astro`; it does not remove `node_modules`, `.wrangler`, source files, or local `.env` files. Exclude secrets deliberately from archives.
- Confirm scheduled Supabase backups/PITR and document how to restore a snapshot into a separate test project before relying on recovery.
- Keep GitHub history and a known-good deployment. For an application rollback, redeploy a known-good commit in Pages and check compatibility with the database migrations already applied.
- Do not roll the database back just because a web deployment failed. Database rollback can lose financial records or conflict with newer code. Restore only from a verified backup with a documented recovery plan.
- For DNS rollback, change the Pages custom-domain/redirect configuration deliberately. Avoid deleting mail records or changing nameservers under time pressure.

## 13. Official references

- [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase Auth redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)

For routine releases and incident response after launch, continue using [`PRODUCTION.md`](../PRODUCTION.md). For local installation, see [`BEGINNER-SETUP.md`](./BEGINNER-SETUP.md).
