import { readFileSync } from 'node:fs';

const files = {
  config: readFileSync(new URL('../functions/lib/config.ts', import.meta.url), 'utf8'),
  migration: readFileSync(new URL('../apps/api/supabase/migrations/20260915130000_production_financial_integrity.sql', import.meta.url), 'utf8'),
  admin: readFileSync(new URL('../functions/lib/admin.ts', import.meta.url), 'utf8'),
  order: readFileSync(new URL('../functions/lib/order.ts', import.meta.url), 'utf8'),
  routes: readFileSync(new URL('../functions/api/[[path]].ts', import.meta.url), 'utf8'),
  headers: readFileSync(new URL('../apps/web/public/_headers', import.meta.url), 'utf8'),
  auditMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915142500_admin_audit_log.sql', import.meta.url), 'utf8'),
  supportMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915145500_support_tickets.sql', import.meta.url), 'utf8'),
  purchaseMigration: readFileSync(new URL('../apps/api/supabase/migrations/20260915153000_purchase_idempotency.sql', import.meta.url), 'utf8'),
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
requireText(files.order, 'providerBalance < costPriceUsd', 'Provider pre-charge balance guard is missing');
requireText(files.auditMigration, 'ENABLE ROW LEVEL SECURITY', 'Audit-log RLS is missing');
requireText(files.auditMigration, 'REVOKE ALL', 'Audit-log public access is not revoked');
requireText(files.supportMigration, 'ENABLE ROW LEVEL SECURITY', 'Support-ticket RLS is missing');
requireText(files.routes, "path === '/api/admin/audit-logs'", 'Admin audit API is missing');
requireText(files.routes, "path === '/api/support/tickets'", 'User support API is missing');
requireText(files.headers, 'Content-Security-Policy:', 'Content Security Policy is missing');
requireText(files.headers, 'Strict-Transport-Security:', 'HSTS is missing');
requireText(files.purchaseMigration, 'request_id UUID PRIMARY KEY', 'Purchase idempotency key is not unique');
requireText(files.routes, "prior.status === 'completed'", 'Completed purchase replay protection is missing');

if (failures.length) {
  console.error(`Production guardrails failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Production guardrails passed.');
