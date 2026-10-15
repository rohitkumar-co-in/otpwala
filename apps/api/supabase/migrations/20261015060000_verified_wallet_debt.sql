-- Only an audited, delivered-order recovery may create wallet debt.
-- Credits add to the signed balance, so partial recharges repay debt naturally.
CREATE OR REPLACE FUNCTION public.enforce_wallet_ledger_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'wallet_ledger_is_append_only'; END IF;
  IF current_setting('app.wallet_posting', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'wallet_ledger_must_use_post_wallet_transaction';
  END IF;
  IF NEW.balance_after IS NULL THEN RAISE EXCEPTION 'invalid_wallet_balance_after'; END IF;
  IF NEW.balance_after < 0 AND NEW.type = 'deduction' AND NOT (
    NEW.reference_type IS NOT DISTINCT FROM 'pricing_adjustment'
    AND NEW.reference_id IS NOT DISTINCT FROM nullif(current_setting('app.wallet_recovery_order', true), '')
    AND NEW.reference_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'unapproved_wallet_overdraft'; END IF;
  IF NEW.type = 'opening_balance' THEN
    IF NEW.amount <> 0 OR NEW.reference_type <> 'financial_ledger_baseline' OR NEW.balance_after < 0 THEN
      RAISE EXCEPTION 'invalid_opening_balance_entry';
    END IF;
  ELSIF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'wallet_transaction_amount_must_be_positive';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_wallet_transaction(
  p_user_id UUID, p_amount DECIMAL, p_type TEXT, p_description TEXT,
  p_reference_type TEXT DEFAULT NULL, p_reference_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance DECIMAL(12,4);
  v_tx public.wallet_transactions%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 OR p_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_type IS NULL OR p_type NOT IN ('topup','deduction','refund','admin_credit','admin_grant','referral_bonus') THEN
    RAISE EXCEPTION 'invalid_wallet_transaction';
  END IF;
  IF p_type = 'deduction' AND p_amount >= 0 THEN RAISE EXCEPTION 'wallet_deduction_must_be_negative'; END IF;
  IF p_type <> 'deduction' AND p_amount <= 0 THEN RAISE EXCEPTION 'wallet_credit_must_be_positive'; END IF;
  SELECT wallet_balance INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_tx FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_tx.user_id <> p_user_id OR v_tx.type <> p_type OR v_tx.amount <> abs(p_amount)
        OR v_tx.reference_type IS DISTINCT FROM p_reference_type OR v_tx.reference_id IS DISTINCT FROM p_reference_id THEN
        RAISE EXCEPTION 'wallet_idempotency_conflict';
      END IF;
      RETURN QUERY SELECT v_tx.id, v_tx.balance_after;
      RETURN;
    END IF;
  END IF;
  IF p_amount < 0 AND v_balance + p_amount < 0 AND NOT (
    p_reference_type IS NOT DISTINCT FROM 'pricing_adjustment'
    AND p_reference_id IS NOT DISTINCT FROM nullif(current_setting('app.wallet_recovery_order', true), '')
    AND p_reference_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'insufficient_wallet_balance'; END IF;
  PERFORM set_config('app.wallet_posting', 'trusted', true);
  v_balance := round(v_balance + p_amount, 4);
  UPDATE public.profiles SET wallet_balance = v_balance, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions
    (user_id,type,amount,balance_after,description,status,reference_type,reference_id,idempotency_key)
  VALUES (p_user_id,p_type,abs(p_amount),v_balance,p_description,'completed',p_reference_type,p_reference_id,p_idempotency_key)
  RETURNING * INTO v_tx;
  RETURN QUERY SELECT v_tx.id, v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_verified_pricing_recovery(p_order_id UUID, p_reason TEXT)
RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_meta JSONB;
  v_amount NUMERIC;
  v_price NUMERIC;
  v_key TEXT;
  v_tx public.wallet_transactions%ROWTYPE;
  v_result RECORD;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN RAISE EXCEPTION 'recovery_reason_required'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status NOT IN ('code_received','completed') THEN RAISE EXCEPTION 'recovery_requires_delivered_order'; END IF;
  SELECT metadata INTO v_meta FROM public.admin_audit_logs
    WHERE target_type = 'order' AND target_id = p_order_id::text AND action = 'pricing_recovery_pending'
    ORDER BY created_at DESC, id DESC LIMIT 1;
  IF v_meta IS NULL THEN RAISE EXCEPTION 'verified_pending_recovery_required'; END IF;
  v_amount := (v_meta->>'additional_charge_inr')::numeric;
  v_price := (v_meta->>'correct_price_inr')::numeric;
  v_key := v_meta->>'idempotency_key';
  IF v_amount IS NULL OR NOT (v_amount > 0 AND v_amount <= 1000000) OR v_price IS NULL
    OR v_key IS DISTINCT FROM concat('tiger-price-recovery-20261015:',p_order_id::text)
    OR v_amount IS DISTINCT FROM round(v_price - v_order.sell_price_inr,2)
    OR (v_meta->>'original_charge_inr')::numeric IS DISTINCT FROM v_order.sell_price_inr
    OR (v_meta->>'actual_provider_cost_usd')::numeric IS DISTINCT FROM v_order.cost_price_usd
    OR (v_meta->>'purchase_fx_rate')::numeric IS DISTINCT FROM v_order.fx_rate
    OR v_price IS DISTINCT FROM ceil(v_order.cost_price_usd * v_order.fx_rate * (1 + (v_meta->>'markup_percentage')::numeric / 100) * 2) / 2 THEN
    RAISE EXCEPTION 'recovery_evidence_mismatch';
  END IF;
  SELECT * INTO v_tx FROM public.wallet_transactions WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_tx.user_id <> v_order.user_id OR v_tx.type <> 'deduction' OR v_tx.amount <> v_amount
      OR v_tx.reference_type <> 'pricing_adjustment' OR v_tx.reference_id <> p_order_id::text THEN
      RAISE EXCEPTION 'wallet_idempotency_conflict';
    END IF;
    RETURN QUERY SELECT v_tx.id, v_tx.balance_after;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wallet_transactions WHERE user_id = v_order.user_id AND type = 'deduction'
    AND status = 'completed' AND reference_type = 'order' AND reference_id = p_order_id::text AND amount = v_order.sell_price_inr)
    OR EXISTS (SELECT 1 FROM public.wallet_transactions WHERE reference_id = p_order_id::text AND status = 'completed'
      AND (type = 'refund' OR reference_type = 'pricing_adjustment')) THEN
    RAISE EXCEPTION 'unexpected_recovery_ledger_state';
  END IF;
  PERFORM set_config('app.wallet_recovery_order', p_order_id::text, true);
  SELECT * INTO v_result FROM public.post_wallet_transaction(v_order.user_id,-v_amount,'deduction',
    concat('Verified Tiger price correction: ',v_order.service_name,' order ',p_order_id::text,' (negative balance approved)'),
    'pricing_adjustment',p_order_id::text,v_key);
  PERFORM set_config('app.wallet_recovery_order', '', true);
  INSERT INTO public.admin_audit_logs(action,target_type,target_id,metadata)
  VALUES ('pricing_recovery_applied','order',p_order_id::text,v_meta || jsonb_build_object(
    'status','applied','negative_balance_authorization',p_reason,'transaction_id',v_result.transaction_id,
    'balance_after',v_result.balance_after,'debt_repayment','Subsequent wallet credits offset the negative balance'));
  RETURN QUERY SELECT v_result.transaction_id, v_result.balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_balance_summary()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('walletLiability',coalesce(sum(greatest(wallet_balance,0)),0),
    'walletDebt',coalesce(sum(greatest(-wallet_balance,0)),0)) FROM public.profiles WHERE role = 'user';
$$;

REVOKE ALL ON FUNCTION public.post_wallet_transaction(UUID,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_verified_pricing_recovery(UUID,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_balance_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_transaction(UUID,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_verified_pricing_recovery(UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_balance_summary() TO service_role;
