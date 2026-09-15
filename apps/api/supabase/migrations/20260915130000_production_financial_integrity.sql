-- Production financial integrity and RLS hardening.
-- Apply through the Supabase migration runner before deploying matching API code.

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_idempotency_key_uidx
  ON public.wallet_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(12,6),
  ADD COLUMN IF NOT EXISTS cost_price_inr DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS refund_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_transaction_id UUID REFERENCES public.wallet_transactions(id),
  ADD COLUMN IF NOT EXISTS refund_failure_reason TEXT;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_refund_status_check
    CHECK (refund_status IN ('not_applicable','pending','processing','refunded','failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_transaction_id_uidx
  ON public.payment_requests (lower(trim(transaction_id)))
  WHERE transaction_id IS NOT NULL AND trim(transaction_id) <> '';

-- Service-role clients bypass RLS; permissive USING(true) policies expose data to
-- normal PostgREST roles and must not exist.
DROP POLICY IF EXISTS "Service role full access profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Service role full access orders" ON public.orders;
DROP POLICY IF EXISTS "Service role manage pricing" ON public.pricing_rules;
DROP POLICY IF EXISTS "Service role manage settings" ON public.settings;
DROP POLICY IF EXISTS "Service role full access payment_requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Service role full access referrals" ON public.referrals;
DROP POLICY IF EXISTS "Public read pricing" ON public.pricing_rules;
DROP POLICY IF EXISTS "Public read settings" ON public.settings;
DROP POLICY IF EXISTS "Users can insert own payment requests" ON public.payment_requests;

-- Customers may edit only non-financial profile fields through the API. Direct
-- profile updates are disabled to protect role, bans, balances and counters.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

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
  IF p_amount = 0 OR p_type NOT IN ('topup','deduction','refund','admin_credit','referral_bonus') THEN
    RAISE EXCEPTION 'invalid_wallet_transaction';
  END IF;

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

CREATE OR REPLACE FUNCTION public.approve_payment_request_atomic(p_request_id UUID, p_admin_id TEXT)
RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request public.payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_request_not_found'; END IF;
  IF v_request.status IN ('approved','paid') THEN RAISE EXCEPTION 'payment_request_already_approved'; END IF;
  IF v_request.status NOT IN ('pending','created') THEN RAISE EXCEPTION 'payment_request_not_pending'; END IF;
  IF coalesce(v_request.amount,0) <= 0 THEN RAISE EXCEPTION 'invalid_payment_amount'; END IF;

  UPDATE public.payment_requests
    SET status = 'approved', admin_notes = concat('Approved by ', p_admin_id), updated_at = now()
    WHERE id = p_request_id;

  RETURN QUERY SELECT * FROM public.post_wallet_transaction(
    v_request.user_id, v_request.amount, 'topup',
    concat('Deposit approved (UTR: ', coalesce(v_request.transaction_id, v_request.id::text), ')'),
    'payment_request', v_request.id::text, concat('topup:', v_request.id::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_order_atomic(p_order_id UUID, p_terminal_status TEXT, p_reason TEXT)
RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_result RECORD;
BEGIN
  IF p_terminal_status NOT IN ('cancelled','expired') THEN RAISE EXCEPTION 'invalid_terminal_status'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.sms_code IS NOT NULL OR v_order.status IN ('code_received','completed') THEN
    RAISE EXCEPTION 'otp_delivered_not_refundable';
  END IF;

  SELECT * INTO v_result FROM public.post_wallet_transaction(
    v_order.user_id, v_order.sell_price_inr, 'refund', p_reason,
    'order', v_order.id::text, concat('refund:', v_order.id::text)
  );

  UPDATE public.orders SET
    status = p_terminal_status,
    refund_status = 'refunded',
    refund_transaction_id = v_result.transaction_id,
    refunded_at = coalesce(refunded_at, now()),
    cancelled_at = CASE WHEN p_terminal_status = 'cancelled' THEN coalesce(cancelled_at, now()) ELSE cancelled_at END,
    expired_at = CASE WHEN p_terminal_status = 'expired' THEN coalesce(expired_at, now()) ELSE expired_at END,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN QUERY SELECT v_result.transaction_id, v_result.balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalUsers', (SELECT count(*) FROM profiles),
    'totalOrders', (SELECT count(*) FROM orders),
    'ordersToday', (SELECT count(*) FROM orders WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'activeOrders', (SELECT count(*) FROM orders WHERE status = 'waiting'),
    'otpDelivered', (SELECT count(*) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'otpNotReceived', (SELECT count(*) FROM orders WHERE sms_code IS NULL AND status IN ('cancelled','expired','refunded')),
    'totalTopups', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed'),
    'topupsToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'adminCredits', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_credit' AND status = 'completed'),
    'refundAmount', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'refund' AND status = 'completed'),
    'refundCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'refund' AND status = 'completed'),
    'refundsPending', (SELECT count(*) FROM orders WHERE refund_status IN ('pending','processing','failed')),
    'grossOtpSales', (SELECT coalesce(sum(sell_price_inr),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'providerCostInr', (SELECT coalesce(sum(cost_price_inr),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'grossProfit', (SELECT coalesce(sum(sell_price_inr - coalesce(cost_price_inr,0)),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'walletLiability', (SELECT coalesce(sum(wallet_balance),0) FROM profiles WHERE role = 'user')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_order_metrics(p_user_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalOrders', count(*),
    'activeOrders', count(*) FILTER (WHERE status = 'waiting'),
    'otpDelivered', count(*) FILTER (WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'otpNotReceived', count(*) FILTER (WHERE sms_code IS NULL AND status IN ('cancelled','expired','refunded')),
    'totalRefunded', coalesce(sum(sell_price_inr) FILTER (WHERE refund_status = 'refunded'),0),
    'spentOnDelivered', coalesce(sum(sell_price_inr) FILTER (WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),0)
  ) FROM orders WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_payment_request_atomic(UUID,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_order_atomic(UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dashboard_metrics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_order_metrics(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_payment_request_atomic(UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_order_atomic(UUID,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.user_order_metrics(UUID) TO service_role;
