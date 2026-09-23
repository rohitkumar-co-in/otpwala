-- Allow a superadmin to purge banned admin accounts while protecting superadmins.
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
  IF target.role = 'superadmin' THEN RAISE EXCEPTION 'Super Admin accounts cannot be purged'; END IF;
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

  DELETE FROM public.data_deletion_requests WHERE user_id = p_user_id;
  DELETE FROM public.referral_fraud_logs WHERE referrer_id = p_user_id OR referee_id = p_user_id;
  IF p_mode = 'complete' THEN
    DELETE FROM public.admin_audit_logs WHERE target_type = 'user' AND target_id = p_user_id::text;
  END IF;
  DELETE FROM public.profiles WHERE id = p_user_id;
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
