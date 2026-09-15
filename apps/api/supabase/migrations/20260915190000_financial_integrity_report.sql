CREATE OR REPLACE FUNCTION public.financial_integrity_report()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH
orders_without_debit AS (
  SELECT count(*) AS n FROM orders o
  WHERE NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
order_debit_mismatch AS (
  SELECT count(*) AS n FROM orders o JOIN wallet_transactions w ON w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed'
  WHERE abs(coalesce(w.amount,0)-coalesce(o.sell_price_inr,o.price_inr,0)) > 0.01
),
refund_without_credit AS (
  SELECT count(*) AS n FROM orders o WHERE o.refund_status='refunded'
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='refund' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
refund_amount_mismatch AS (
  SELECT count(*) AS n FROM orders o JOIN wallet_transactions w ON w.type='refund' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed'
  WHERE abs(coalesce(w.amount,0)-coalesce(o.sell_price_inr,o.price_inr,0)) > 0.01
),
topup_without_credit AS (
  SELECT count(*) AS n FROM payment_requests p WHERE p.status IN('approved','paid')
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed')
),
topup_amount_mismatch AS (
  SELECT count(*) AS n FROM payment_requests p JOIN wallet_transactions w ON w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed'
  WHERE p.status IN('approved','paid') AND abs(coalesce(w.amount,0)-coalesce(p.amount,0)) > 0.01
),
wallet_balance_mismatch AS (
  SELECT count(*) AS n FROM profiles p
  LEFT JOIN LATERAL (SELECT balance_after FROM wallet_transactions w WHERE w.user_id=p.id AND w.status='completed' ORDER BY w.created_at DESC,w.id DESC LIMIT 1) latest ON true
  WHERE (latest.balance_after IS NOT NULL AND abs(coalesce(p.wallet_balance,0)-latest.balance_after)>0.01)
     OR (latest.balance_after IS NULL AND abs(coalesce(p.wallet_balance,0))>0.01)
),
totals AS (
  SELECT (SELECT n FROM orders_without_debit) orders_without_debit,
         (SELECT n FROM order_debit_mismatch) order_debit_mismatch,
         (SELECT n FROM refund_without_credit) refund_without_credit,
         (SELECT n FROM refund_amount_mismatch) refund_amount_mismatch,
         (SELECT n FROM topup_without_credit) topup_without_credit,
         (SELECT n FROM topup_amount_mismatch) topup_amount_mismatch,
         (SELECT n FROM wallet_balance_mismatch) wallet_balance_mismatch
)
SELECT jsonb_build_object(
  'checkedAt',now(),
  'ordersWithoutDebit',orders_without_debit,
  'orderDebitMismatch',order_debit_mismatch,
  'refundsWithoutCredit',refund_without_credit,
  'refundAmountMismatch',refund_amount_mismatch,
  'topupsWithoutCredit',topup_without_credit,
  'topupAmountMismatch',topup_amount_mismatch,
  'walletBalanceMismatch',wallet_balance_mismatch,
  'totalIssues',orders_without_debit+order_debit_mismatch+refund_without_credit+refund_amount_mismatch+topup_without_credit+topup_amount_mismatch+wallet_balance_mismatch
) FROM totals;
$$;
REVOKE ALL ON FUNCTION public.financial_integrity_report() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.financial_integrity_report() TO service_role;
