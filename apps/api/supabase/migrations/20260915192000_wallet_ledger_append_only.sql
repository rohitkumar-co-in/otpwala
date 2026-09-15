-- The ledger is append-only. Production application code must use the
-- SECURITY DEFINER post_wallet_transaction RPC, which is owned by postgres.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type = ANY (ARRAY['topup'::text, 'deduction'::text, 'refund'::text, 'admin_credit'::text, 'referral_bonus'::text, 'opening_balance'::text]));

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

-- Recreate the posting function with sign checks; the table stores absolute
-- amounts, while the RPC input carries the debit/credit direction.
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

DROP TRIGGER IF EXISTS wallet_transactions_append_only ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_append_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_ledger_append_only();
REVOKE ALL ON FUNCTION public.enforce_wallet_ledger_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
