-- Establish an explicit baseline before enforcing live cross-ledger checks.
-- Historic records from before this timestamp used the prior non-atomic wallet flow.
CREATE TABLE IF NOT EXISTS public.financial_ledger_baselines (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  cutover_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_ledger_baselines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_ledger_baselines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.financial_ledger_baselines TO service_role;

INSERT INTO public.financial_ledger_baselines (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

-- Opening balances are a zero-value audit snapshot, not revenue, a top-up, or a credit.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type = ANY (ARRAY['topup'::text, 'deduction'::text, 'refund'::text, 'admin_credit'::text, 'opening_balance'::text]));

INSERT INTO public.wallet_transactions
  (user_id, type, amount, balance_after, description, status, reference_type, reference_id, idempotency_key)
SELECT p.id, 'opening_balance', 0, p.wallet_balance,
       'Opening balance recorded at financial-ledger baseline', 'completed',
       'financial_ledger_baseline', p.id::text, 'opening-balance:' || p.id::text
FROM public.profiles p
WHERE coalesce(p.wallet_balance, 0) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions w
    WHERE w.user_id = p.id AND w.status = 'completed'
  )
ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

CREATE OR REPLACE FUNCTION public.financial_integrity_report()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH baseline AS (
  SELECT cutover_at FROM financial_ledger_baselines WHERE singleton = true
),
orders_without_debit AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b
  WHERE o.created_at >= b.cutover_at
    AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
order_debit_mismatch AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b JOIN wallet_transactions w ON w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed'
  WHERE o.created_at >= b.cutover_at AND abs(coalesce(w.amount,0)-coalesce(o.sell_price_inr,o.price_inr,0)) > 0.01
),
refund_without_credit AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b WHERE o.created_at >= b.cutover_at AND o.refund_status='refunded'
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='refund' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
refund_amount_mismatch AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b JOIN wallet_transactions w ON w.type='refund' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed'
  WHERE o.created_at >= b.cutover_at AND abs(coalesce(w.amount,0)-coalesce(o.sell_price_inr,o.price_inr,0)) > 0.01
),
topup_without_credit AS (
  SELECT count(*) AS n FROM payment_requests p CROSS JOIN baseline b WHERE p.created_at >= b.cutover_at AND p.status IN('approved','paid')
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed')
),
topup_amount_mismatch AS (
  SELECT count(*) AS n FROM payment_requests p CROSS JOIN baseline b JOIN wallet_transactions w ON w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed'
  WHERE p.created_at >= b.cutover_at AND p.status IN('approved','paid') AND abs(coalesce(w.amount,0)-coalesce(p.amount,0)) > 0.01
),
wallet_balance_mismatch AS (
  SELECT count(*) AS n FROM profiles p
  LEFT JOIN LATERAL (SELECT balance_after FROM wallet_transactions w WHERE w.user_id=p.id AND w.status='completed' ORDER BY w.created_at DESC,w.id DESC LIMIT 1) latest ON true
  WHERE (latest.balance_after IS NOT NULL AND abs(coalesce(p.wallet_balance,0)-latest.balance_after)>0.01)
     OR (latest.balance_after IS NULL AND abs(coalesce(p.wallet_balance,0))>0.01)
),
legacy_unlinked_orders AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b WHERE o.created_at < b.cutover_at
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
legacy_unlinked_topups AS (
  SELECT count(*) AS n FROM payment_requests p CROSS JOIN baseline b WHERE p.created_at < b.cutover_at AND p.status IN('approved','paid')
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed')
),
totals AS (
  SELECT (SELECT cutover_at FROM baseline) cutover_at,
         (SELECT n FROM orders_without_debit) orders_without_debit,
         (SELECT n FROM order_debit_mismatch) order_debit_mismatch,
         (SELECT n FROM refund_without_credit) refunds_without_credit,
         (SELECT n FROM refund_amount_mismatch) refund_amount_mismatch,
         (SELECT n FROM topup_without_credit) topups_without_credit,
         (SELECT n FROM topup_amount_mismatch) topup_amount_mismatch,
         (SELECT n FROM wallet_balance_mismatch) wallet_balance_mismatch,
         (SELECT n FROM legacy_unlinked_orders) legacy_unlinked_orders,
         (SELECT n FROM legacy_unlinked_topups) legacy_unlinked_topups
)
SELECT jsonb_build_object(
  'checkedAt',now(), 'baselineAt',cutover_at,
  'ordersWithoutDebit',orders_without_debit, 'orderDebitMismatch',order_debit_mismatch,
  'refundsWithoutCredit',refunds_without_credit, 'refundAmountMismatch',refund_amount_mismatch,
  'topupsWithoutCredit',topups_without_credit, 'topupAmountMismatch',topup_amount_mismatch,
  'walletBalanceMismatch',wallet_balance_mismatch,
  'legacyUnlinkedOrders',legacy_unlinked_orders, 'legacyUnlinkedTopups',legacy_unlinked_topups,
  'totalIssues',orders_without_debit+order_debit_mismatch+refunds_without_credit+refund_amount_mismatch+topups_without_credit+topup_amount_mismatch+wallet_balance_mismatch
) FROM totals;
$$;
REVOKE ALL ON FUNCTION public.financial_integrity_report() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.financial_integrity_report() TO service_role;
