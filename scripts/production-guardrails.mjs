import { readFileSync } from 'node:fs';

const files = {
  config: readFileSync(new URL('../functions/lib/config.ts', import.meta.url), 'utf8'),
  migration: readFileSync(new URL('../apps/api/supabase/migrations/20260915130000_production_financial_integrity.sql', import.meta.url), 'utf8'),
  admin: readFileSync(new URL('../functions/lib/admin.ts', import.meta.url), 'utf8'),
  order: readFileSync(new URL('../functions/lib/order.ts', import.meta.url), 'utf8'),
  routes: readFileSync(new URL('../functions/api/[[path]].ts', import.meta.url), 'utf8'),
  headers: readFileSync(new URL('../apps/web/public/_headers', import.meta.url), 'utf8'),
  globalCss: readFileSync(new URL('../apps/web/src/styles/global.css', import.meta.url), 'utf8'),
  auditMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915142500_admin_audit_log.sql', import.meta.url), 'utf8'),
  supportMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915145500_support_tickets.sql', import.meta.url), 'utf8'),
  purchaseMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915153000_purchase_idempotency.sql', import.meta.url), 'utf8'),
  alertsMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915160000_operational_alerts.sql', import.meta.url), 'utf8'),
  telegramSecurity: readFileSync(new URL('../functions/lib/telegram-security.ts', import.meta.url), 'utf8'),
  retentionMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915163000_operational_retention.sql', import.meta.url), 'utf8'),
  orderEventsMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915170000_order_events.sql', import.meta.url), 'utf8'),
  session: readFileSync(new URL('../functions/lib/session.ts', import.meta.url), 'utf8'),
  supabase: readFileSync(new URL('../functions/lib/supabase.ts', import.meta.url), 'utf8'),
  statusPage: readFileSync(new URL('../apps/web/src/pages/status.astro', import.meta.url), 'utf8'),
  erasureMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915180000_data_erasure_workflow.sql', import.meta.url), 'utf8'),
  integrityMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915190000_financial_integrity_report.sql', import.meta.url), 'utf8'),
  ledgerBaselineMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915191000_financial_ledger_baseline.sql', import.meta.url), 'utf8'),
};

const failures = [];
const requireText = (source, text, label) => {
  if (!source.includes(text)) failures.push(label);
};

if (/sb_secret_[A-Za-z0-9_-]+/.test(files.config)) failures.push('Hardcoded Supabase service-role secret detected');
if (/TIGER_SMS_API_KEY:\s*[^\n]*\|\|\s*['"][^'"]+/.test(files.config)) failures.push('Hardcoded Tiger API fallback detected');
requireText(files.migration, 'post_wallet_transaction', 'Atomic wallet RPC is missing');
requireText(files.migration, 'approve_payment_request_atomic', 'Atomic payment approval RPC is missing');
requireText(files.migration, 'refund_order_atomic', 'Atomic refund RPC is missing');
requireText(files.migration, 'admin_dashboard_metrics', 'Canonical admin metrics RPC is missing');
requireText(files.admin, "rpc('admin_dashboard_metrics')", 'Admin dashboard bypasses canonical metrics');
requireText(files.order, "rpc('refund_order_atomic'", 'Order refunds bypass atomic refund RPC');
requireText(files.order, 'reconcileExpiredOrders', 'Expired-order reconciliation is missing');
requireText(files.order, 'enforcePurchaseLimits', 'Purchase velocity controls are missing');
requireText(files.order, 'assertProviderCanFund(providerBalance, costPriceUsd)', 'Provider pre-charge balance guard is missing');
requireText(files.auditMigration, 'ENABLE ROW LEVEL SECURITY', 'Audit-log RLS is missing');
requireText(files.auditMigration, 'REVOKE ALL', 'Audit-log public access is not revoked');
requireText(files.supportMigration, 'ENABLE ROW LEVEL SECURITY', 'Support-ticket RLS is missing');
requireText(files.routes, "path === '/api/admin/audit-logs'", 'Admin audit API is missing');
requireText(files.routes, "path === '/api/support/tickets'", 'User support API is missing');
requireText(files.headers, 'Content-Security-Policy:', 'Content Security Policy is missing');
requireText(files.headers, 'Strict-Transport-Security:', 'HSTS is missing');
requireText(files.purchaseMigration, 'request_id UUID PRIMARY KEY', 'Purchase idempotency key is not unique');
requireText(files.routes, "prior.status === 'completed'", 'Completed purchase replay protection is missing');
requireText(files.alertsMigration, 'alert_key TEXT PRIMARY KEY', 'Operational alert deduplication is missing');
requireText(files.telegramSecurity, "{ name: 'HMAC', hash: 'SHA-256' }", 'Telegram action links are not HMAC signed');
requireText(files.telegramSecurity, 'ACTION_TOKEN_MAX_AGE_MS', 'Telegram action links do not expire');
requireText(files.routes, "X-Telegram-Bot-Api-Secret-Token", 'Telegram webhook authentication is missing');
requireText(files.retentionMigration, 'cleanup_operational_records', 'Operational retention cleanup is missing');
requireText(files.retentionMigration, "interval '15 minutes'", 'Stuck purchase-intent recovery is missing');
requireText(files.order, "rpc('cleanup_operational_records')", 'Scheduled operational cleanup is not invoked');
requireText(files.orderEventsMigration, 'CREATE TRIGGER orders_capture_event', 'Durable order lifecycle events are missing');
requireText(files.routes, "from('order_events')", 'User order history does not include lifecycle events');
requireText(files.session, "reason: 'concurrent_session'", 'Replaced device sessions are not rejected');
requireText(files.session, 'isSessionCurrent', 'Session replacement is not enforced by the authenticated heartbeat');
requireText(files.routes, 'smsProvider: provider', 'Component-level health reporting is missing');
requireText(files.statusPage, "fetch('/api/health'", 'Public status page is not connected to health reporting');
requireText(files.admin, "from('operational_alerts')", 'Admin dashboard does not load operational alert history');
requireText(files.erasureMigration, 'erase_user_personal_data', 'Reviewed personal-data erasure workflow is missing');
requireText(files.erasureMigration, 'financial_records_retained', 'Data erasure does not preserve financial records');
requireText(files.routes, "privacy.erasure_completed", 'Completed data erasures are not audited');
if (/from\('wallet_transactions'\)\.delete\(\)/.test(files.routes)) failures.push('User deletion still destroys the financial ledger');
requireText(files.integrityMigration, 'financial_integrity_report', 'Financial cross-ledger integrity report is missing');
requireText(files.ledgerBaselineMigration, 'financial_ledger_baselines', 'Financial ledger baseline is missing');
requireText(files.ledgerBaselineMigration, 'opening_balance', 'Legacy opening balances are not recorded safely');
requireText(files.admin, "rpc('financial_integrity_report')", 'Admin dashboard does not run financial integrity checks');
requireText(files.routes, "auth.hasVerifiedMfa && auth.aal !== 'aal2'", 'Admin AAL2 enforcement is missing');
requireText(files.globalCss, ':focus-visible', 'Keyboard focus visibility is missing');
requireText(files.globalCss, 'prefers-reduced-motion: reduce', 'Reduced-motion support is missing');

if (failures.length) {
  console.error(`Production guardrails failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Production guardrails passed.');
