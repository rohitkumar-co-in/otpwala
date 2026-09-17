-- Keep wallet_transactions as the single immutable balance ledger.
-- These read-only views separate financial concerns for reporting and admin tools
-- without duplicating rows or creating multiple competing balance sources.

CREATE OR REPLACE VIEW public.wallet_topups
WITH (security_invoker = true) AS
SELECT id, user_id, amount, balance_after, description, status,
       reference_type, reference_id, idempotency_key, created_at
FROM public.wallet_transactions
WHERE type = 'topup';

CREATE OR REPLACE VIEW public.wallet_deductions
WITH (security_invoker = true) AS
SELECT id, user_id, amount, balance_after, description, status,
       reference_type, reference_id, idempotency_key, created_at
FROM public.wallet_transactions
WHERE type = 'deduction';

CREATE OR REPLACE VIEW public.wallet_refunds
WITH (security_invoker = true) AS
SELECT id, user_id, amount, balance_after, description, status,
       reference_type, reference_id, idempotency_key, created_at
FROM public.wallet_transactions
WHERE type = 'refund';

CREATE OR REPLACE VIEW public.wallet_admin_funding
WITH (security_invoker = true) AS
SELECT id, user_id, type AS funding_type, amount, balance_after,
       description, status, reference_type, reference_id,
       idempotency_key, created_at
FROM public.wallet_transactions
WHERE type IN ('admin_credit', 'admin_grant');

CREATE OR REPLACE VIEW public.wallet_referral_bonuses
WITH (security_invoker = true) AS
SELECT id, user_id, amount, balance_after, description, status,
       reference_type, reference_id, idempotency_key, created_at
FROM public.wallet_transactions
WHERE type = 'referral_bonus';

REVOKE ALL ON public.wallet_topups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.wallet_deductions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.wallet_refunds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.wallet_admin_funding FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.wallet_referral_bonuses FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.wallet_topups TO service_role;
GRANT SELECT ON public.wallet_deductions TO service_role;
GRANT SELECT ON public.wallet_refunds TO service_role;
GRANT SELECT ON public.wallet_admin_funding TO service_role;
GRANT SELECT ON public.wallet_referral_bonuses TO service_role;
