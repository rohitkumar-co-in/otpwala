CREATE OR REPLACE FUNCTION public.approve_payment_request_atomic(p_request_id UUID, p_admin_id TEXT)
RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request public.payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.payment_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'payment_request_not_found'; END IF;
  IF v_request.status IN ('approved', 'paid') THEN RAISE EXCEPTION 'payment_request_already_approved'; END IF;
  IF v_request.status NOT IN ('pending', 'created') THEN RAISE EXCEPTION 'payment_request_not_pending'; END IF;

  IF COALESCE(v_request.amount, 0) <= 0 THEN RAISE EXCEPTION 'invalid_payment_amount'; END IF;

  UPDATE public.payment_requests
  SET status = 'approved',
      admin_notes = concat('Approved by ', p_admin_id),
      updated_at = now()
  WHERE id = p_request_id;

  RETURN QUERY SELECT * FROM public.post_wallet_transaction(
    v_request.user_id,
    v_request.amount,
    'topup',
    concat('Deposit approved (UTR: ', COALESCE(v_request.transaction_id, v_request.id::text), ')'),
    'payment_request',
    v_request.id::text,
    concat('topup:', v_request.id::text)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_payment_request_atomic(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payment_request_atomic(UUID, TEXT) TO service_role;