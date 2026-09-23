-- Admin-controlled user purge with an explicit non-PII history option.
CREATE TABLE IF NOT EXISTS public.user_purge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id UUID NOT NULL,
  user_reference TEXT NOT NULL,
  user_email_hash TEXT NOT NULL,
  purge_mode TEXT NOT NULL CHECK (purge_mode IN ('complete', 'history')),
  orders_count INTEGER NOT NULL DEFAULT 0,
  wallet_transactions_count INTEGER NOT NULL DEFAULT 0,
  payment_requests_count INTEGER NOT NULL DEFAULT 0,
  total_order_sales DECIMAL(12,4) NOT NULL DEFAULT 0,
  total_deposits DECIMAL(12,4) NOT NULL DEFAULT 0,
  purged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  purged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_purge_history_purged_at_idx
  ON public.user_purge_history (purged_at DESC);
ALTER TABLE public.user_purge_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_purge_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.user_purge_history TO service_role;

CREATE OR REPLACE FUNCTION public.purge_user_account(
  p_user_id UUID,
  p_actor_id UUID,
  p_mode TEXT DEFAULT 'history'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target public.profiles%ROWTYPE;
  actor_role TEXT;
  order_count INTEGER;
  transaction_count INTEGER;
  payment_count INTEGER;
  order_sales DECIMAL(12,4);
  deposit_total DECIMAL(12,4);
  history_id UUID;
BEGIN
  IF p_mode NOT IN ('complete', 'history') THEN
    RAISE EXCEPTION 'Purge mode must be complete or history';
  END IF;

  SELECT role INTO actor_role FROM public.profiles WHERE id = p_actor_id;
  IF actor_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Only a superadmin can purge user accounts';
  END IF;

  SELECT * INTO target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF target.id = p_actor_id THEN RAISE EXCEPTION 'You cannot purge your own account'; END IF;
  IF target.role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Administrator accounts cannot be purged'; END IF;
  IF NOT COALESCE(target.is_banned, false) THEN RAISE EXCEPTION 'User must be suspended before purge'; END IF;

  SELECT count(*), COALESCE(sum(sell_price_inr), 0)
    INTO order_count, order_sales
    FROM public.orders WHERE user_id = p_user_id;
  SELECT count(*), COALESCE(sum(amount) FILTER (WHERE type = 'topup'), 0)
    INTO transaction_count, deposit_total
    FROM public.wallet_transactions WHERE user_id = p_user_id;
  SELECT count(*) INTO payment_count FROM public.payment_requests WHERE user_id = p_user_id;

  IF p_mode = 'history' THEN
    INSERT INTO public.user_purge_history (
      original_user_id, user_reference, user_email_hash, purge_mode,
      orders_count, wallet_transactions_count, payment_requests_count,
      total_order_sales, total_deposits, purged_by
    ) VALUES (
      p_user_id,
      'purged:' || replace(p_user_id::text, '-', ''),
      md5(lower(trim(target.email))),
      p_mode,
      order_count, transaction_count, payment_count,
      order_sales, deposit_total, p_actor_id
    ) RETURNING id INTO history_id;
  END IF;

  -- This table has a restrictive FK and must be cleared before profiles cascades.
  DELETE FROM public.data_deletion_requests WHERE user_id = p_user_id;
  -- These rows set the referrer FK to NULL on profile deletion, so remove them
  -- explicitly to avoid retaining user-linked fraud evidence in complete mode.
  DELETE FROM public.referral_fraud_logs WHERE referrer_id = p_user_id OR referee_id = p_user_id;
  IF p_mode = 'complete' THEN
    DELETE FROM public.admin_audit_logs WHERE target_type = 'user' AND target_id = p_user_id::text;
  END IF;
  DELETE FROM public.profiles WHERE id = p_user_id;
  -- Remove the Supabase Auth identity in both modes; only the summary differs.
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'history_id', history_id,
    'user_id', p_user_id,
    'mode', p_mode,
    'orders_deleted', order_count,
    'wallet_transactions_deleted', transaction_count,
    'payment_requests_deleted', payment_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_account(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_account(UUID,UUID,TEXT) TO service_role;
