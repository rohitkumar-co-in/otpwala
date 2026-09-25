-- Clear a user's visible history without deleting the account or mutating the
-- append-only wallet ledger. Financial/audit exports retain the original rows.
CREATE TABLE IF NOT EXISTS public.admin_user_history_clears (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cleared_at TIMESTAMPTZ NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('all', 'preserve_funding')),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  wallet_balance_before DECIMAL(12,4) NOT NULL DEFAULT 0,
  wallet_balance_after DECIMAL(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_user_history_clears_user_time_idx
  ON public.admin_user_history_clears (user_id, cleared_at DESC);

ALTER TABLE public.admin_user_history_clears ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_user_history_clears FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_user_history_clears TO service_role;

CREATE OR REPLACE FUNCTION public.clear_user_history(
  p_user_id UUID,
  p_actor_id UUID,
  p_mode TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target public.profiles%ROWTYPE;
  actor_role TEXT;
  clear_id UUID := gen_random_uuid();
  clear_time TIMESTAMPTZ := clock_timestamp();
  orders_count INTEGER := 0;
  requests_count INTEGER := 0;
BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('all', 'preserve_funding') THEN
    RAISE EXCEPTION 'History clear mode must be all or preserve_funding';
  END IF;

  SELECT role INTO actor_role FROM public.profiles WHERE id = p_actor_id;
  IF actor_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Only a superadmin can clear user history';
  END IF;

  SELECT * INTO target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF target.id = p_actor_id THEN RAISE EXCEPTION 'You cannot clear your own history'; END IF;
  IF target.role <> 'user' THEN RAISE EXCEPTION 'History can only be cleared for standard user accounts'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE user_id = p_user_id AND status = 'waiting'
  ) THEN
    RAISE EXCEPTION 'This user has a waiting order. Resolve it before clearing history.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions w
    WHERE w.user_id = p_user_id
      AND w.type = 'deduction'
      AND w.reference_type = 'order'
      AND w.created_at >= now() - interval '5 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = w.reference_id)
  ) THEN
    RAISE EXCEPTION 'An order purchase is still being processed. Wait a few minutes before clearing history.';
  END IF;

  IF p_mode = 'all' AND EXISTS (
    SELECT 1 FROM public.payment_requests
    WHERE user_id = p_user_id AND status IN ('pending', 'created')
  ) THEN
    RAISE EXCEPTION 'This user has a pending deposit request. Resolve it before clearing all history.';
  END IF;

  SELECT count(*) INTO orders_count FROM public.orders WHERE user_id = p_user_id;
  SELECT count(*) INTO requests_count FROM public.payment_requests WHERE user_id = p_user_id;

  -- Full clear resets the spendable balance through the trusted ledger RPC.
  -- The debit stays in the protected audit trail but is hidden from the user's
  -- ordinary history feed by its dedicated reference type.
  IF p_mode = 'all' AND target.wallet_balance > 0 THEN
    PERFORM public.post_wallet_transaction(
      p_user_id,
      -target.wallet_balance,
      'deduction',
      'Wallet balance reset during admin history clear',
      'admin_history_clear',
      clear_id::text,
      'history-clear:' || clear_id::text
    );
  END IF;

  INSERT INTO public.admin_user_history_clears (
    id, user_id, cleared_at, mode, actor_id,
    wallet_balance_before, wallet_balance_after
  ) VALUES (
    clear_id, p_user_id, clear_time, p_mode, p_actor_id,
    target.wallet_balance,
    CASE WHEN p_mode = 'all' THEN 0 ELSE target.wallet_balance END
  );

  RETURN jsonb_build_object(
    'id', clear_id,
    'user_id', p_user_id,
    'mode', p_mode,
    'cleared_at', clear_time,
    'orders_hidden', orders_count,
    'payment_requests_hidden', CASE WHEN p_mode = 'all' THEN requests_count ELSE 0 END,
    'wallet_balance_before', target.wallet_balance,
    'wallet_balance_after', CASE WHEN p_mode = 'all' THEN 0 ELSE target.wallet_balance END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_user_history(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_user_history(UUID, UUID, TEXT) TO service_role;

-- Extend the user-facing order summary so old, hidden orders do not leak back
-- into counts after a history clear. Existing calls remain valid.
CREATE OR REPLACE FUNCTION public.user_order_metrics(
  p_user_id UUID,
  p_created_after TIMESTAMPTZ
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalOrders', count(*),
    'activeOrders', count(*) FILTER (WHERE status = 'waiting'),
    'otpDelivered', count(*) FILTER (WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'otpNotReceived', count(*) FILTER (WHERE sms_code IS NULL AND status IN ('cancelled','expired','refunded')),
    'totalRefunded', coalesce(sum(sell_price_inr) FILTER (WHERE refund_status = 'refunded'),0),
    'spentOnDelivered', coalesce(sum(sell_price_inr) FILTER (WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),0)
  ) FROM public.orders
  WHERE user_id = p_user_id AND (p_created_after IS NULL OR created_at >= p_created_after);
$$;

REVOKE ALL ON FUNCTION public.user_order_metrics(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_order_metrics(UUID, TIMESTAMPTZ) TO service_role;
