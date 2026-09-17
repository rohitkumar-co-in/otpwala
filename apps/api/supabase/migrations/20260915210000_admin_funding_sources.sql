-- Separate real customer money from goodwill balance added by an admin.
--   topup        -> UPI deposit approved by an admin        (real money in)
--   admin_credit -> manually funded, money received by admin (real money in)
--   admin_grant  -> free funds added by an admin             (NOT revenue)
-- Apply through the Supabase migration runner before deploying matching API code.

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type = ANY (ARRAY['topup'::text, 'deduction'::text, 'refund'::text, 'admin_credit'::text, 'admin_grant'::text, 'referral_bonus'::text, 'opening_balance'::text]));

CREATE INDEX IF NOT EXISTS wallet_transactions_funding_idx
  ON public.wallet_transactions (type, created_at DESC)
  WHERE type = ANY (ARRAY['topup'::text, 'admin_credit'::text, 'admin_grant'::text]);

-- Recreated unchanged except that admin_grant is now a valid credit type.
CREATE OR REPLACE FUNCTION public.post_wallet_transaction(
  p_user_id UUID,
  p_amount DECIMAL,
  p_type TEXT,
  p_description TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance DECIMAL(12,4);
  v_tx public.wallet_transactions%ROWTYPE;
BEGIN
  IF p_amount = 0 OR p_type NOT IN ('topup','deduction','refund','admin_credit','admin_grant','referral_bonus') THEN
    RAISE EXCEPTION 'invalid_wallet_transaction';
  END IF;
  IF p_type = 'deduction' AND p_amount >= 0 THEN
    RAISE EXCEPTION 'wallet_deduction_must_be_negative';
  END IF;
  IF p_type <> 'deduction' AND p_amount <= 0 THEN
    RAISE EXCEPTION 'wallet_credit_must_be_positive';
  END IF;

  -- The append-only trigger only permits this RPC's transaction-local marker.
  PERFORM set_config('app.wallet_posting', 'trusted', true);

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_tx FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN QUERY SELECT v_tx.id, v_tx.balance_after;
      RETURN;
    END IF;
  END IF;

  SELECT wallet_balance INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_balance + p_amount < 0 THEN RAISE EXCEPTION 'insufficient_wallet_balance'; END IF;

  v_balance := round(v_balance + p_amount, 4);
  UPDATE public.profiles SET wallet_balance = v_balance, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.wallet_transactions
    (user_id,type,amount,balance_after,description,status,reference_type,reference_id,idempotency_key)
  VALUES
    (p_user_id,p_type,abs(p_amount),v_balance,p_description,'completed',p_reference_type,p_reference_id,p_idempotency_key)
  RETURNING * INTO v_tx;

  RETURN QUERY SELECT v_tx.id, v_balance;
END;
$$;

-- ── One-time history reclassification ───────────────────────────────────────
-- The current production ledger has four genuine user top-ups and the remaining
-- legacy admin_credit rows are known admin-added free funds. Only legacy rows
-- without any payment/reference marker are re-labelled; payment approvals use
-- type=topup and are therefore unaffected.
--
-- If that data assumption is not true, remove this UPDATE before applying the
-- migration and classify those rows manually. Do not reverse this with a direct
-- UPDATE later; the restored append-only trigger intentionally blocks that.
-- The ledger is append-only, so temporarily allow only this exact historical
-- type/reference rewrite. The strict append-only trigger is restored immediately
-- after the backfill.
CREATE OR REPLACE FUNCTION public.enforce_wallet_ledger_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('app.wallet_reclassification', true) = 'trusted'
     AND OLD.type = 'admin_credit'
     AND NEW.type = 'admin_grant'
     AND OLD.reference_type IS NULL
     AND NEW.reference_type = 'admin_funding'
     AND NEW.reference_id = 'grant'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.balance_after IS NOT DISTINCT FROM OLD.balance_after
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'wallet_ledger_is_append_only';
  END IF;
  IF current_setting('app.wallet_posting', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'wallet_ledger_must_use_post_wallet_transaction';
  END IF;
  IF NEW.balance_after IS NULL OR NEW.balance_after < 0 THEN
    RAISE EXCEPTION 'invalid_wallet_balance_after';
  END IF;
  IF NEW.type = 'opening_balance' THEN
    IF NEW.amount <> 0 OR NEW.reference_type <> 'financial_ledger_baseline' THEN
      RAISE EXCEPTION 'invalid_opening_balance_entry';
    END IF;
  ELSIF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'wallet_transaction_amount_must_be_positive';
  END IF;
  RETURN NEW;
END;
$$;

SELECT set_config('app.wallet_reclassification', 'trusted', true);
SELECT set_config('app.wallet_posting', 'trusted', true);
UPDATE public.wallet_transactions
   SET type = 'admin_grant',
       reference_type = 'admin_funding',
       reference_id = 'grant'
 WHERE type = 'admin_credit'
   AND reference_type IS NULL;

-- Restore the normal append-only trigger after the one-time reclassification.
CREATE OR REPLACE FUNCTION public.enforce_wallet_ledger_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'wallet_ledger_is_append_only';
  END IF;
  IF current_setting('app.wallet_posting', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'wallet_ledger_must_use_post_wallet_transaction';
  END IF;
  IF NEW.balance_after IS NULL OR NEW.balance_after < 0 THEN
    RAISE EXCEPTION 'invalid_wallet_balance_after';
  END IF;
  IF NEW.type = 'opening_balance' THEN
    IF NEW.amount <> 0 OR NEW.reference_type <> 'financial_ledger_baseline' THEN
      RAISE EXCEPTION 'invalid_opening_balance_entry';
    END IF;
  ELSIF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'wallet_transaction_amount_must_be_positive';
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Canonical funding-source totals ─────────────────────────────────────────
-- Single source of truth for the balance sheet: what customers really paid
-- versus what an admin handed out for free.
CREATE OR REPLACE FUNCTION public.wallet_funding_summary()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalTopups', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed'),
    'topupsToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'topupCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed'),
    'manualFunding', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_credit' AND status = 'completed'),
    'manualFundingToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_credit' AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'manualFundingCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'admin_credit' AND status = 'completed'),
    'freeFunds', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_grant' AND status = 'completed'),
    'freeFundsToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_grant' AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'freeFundsCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'admin_grant' AND status = 'completed'),
    'cashCollected', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type IN ('topup','admin_credit') AND status = 'completed'),
    'cashCollectedToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type IN ('topup','admin_credit') AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'walletLiability', (SELECT coalesce(sum(wallet_balance),0) FROM profiles WHERE role = 'user')
  );
$$;

-- Orders, support and profit metrics stay here; funding totals come from the
-- dedicated summary so both admin surfaces always agree.
CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalUsers', (SELECT count(*) FROM profiles),
    'totalOrders', (SELECT count(*) FROM orders),
    'ordersToday', (SELECT count(*) FROM orders WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'activeOrders', (SELECT count(*) FROM orders WHERE status = 'waiting'),
    'otpDelivered', (SELECT count(*) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'otpNotReceived', (SELECT count(*) FROM orders WHERE sms_code IS NULL AND status IN ('cancelled','expired','refunded')),
    'refundAmount', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'refund' AND status = 'completed'),
    'refundCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'refund' AND status = 'completed'),
    'refundsPending', (SELECT count(*) FROM orders WHERE refund_status IN ('pending','processing','failed')),
    'grossOtpSales', (SELECT coalesce(sum(sell_price_inr),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'providerCostInr', (SELECT coalesce(sum(cost_price_inr),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'grossProfit', (SELECT coalesce(sum(sell_price_inr - coalesce(cost_price_inr,0)),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed'))
  ) || public.wallet_funding_summary();
$$;

REVOKE ALL ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_funding_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dashboard_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_funding_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics() TO service_role;