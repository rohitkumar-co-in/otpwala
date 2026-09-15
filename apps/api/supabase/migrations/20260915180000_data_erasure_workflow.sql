CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  user_message TEXT CHECK (user_message IS NULL OR length(user_message) <= 1000),
  admin_notes TEXT CHECK (admin_notes IS NULL OR length(admin_notes) <= 2000),
  processed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS data_deletion_one_pending_idx ON public.data_deletion_requests(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS data_deletion_queue_idx ON public.data_deletion_requests(status, requested_at);
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.data_deletion_requests TO service_role;

CREATE OR REPLACE FUNCTION public.erase_user_personal_data(p_user_id UUID, p_actor_id UUID, p_request_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE;
DECLARE active_orders INTEGER;
DECLARE pending_payments INTEGER;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF p.role IN ('admin','superadmin') THEN RAISE EXCEPTION 'Administrator accounts cannot be erased'; END IF;
  IF NOT COALESCE(p.is_banned,false) THEN RAISE EXCEPTION 'User must be suspended before erasure'; END IF;
  IF COALESCE(p.wallet_balance,0) <> 0 THEN RAISE EXCEPTION 'Wallet balance must be zero before erasure'; END IF;

  SELECT count(*) INTO active_orders FROM public.orders WHERE user_id=p_user_id AND status='waiting';
  IF active_orders > 0 THEN RAISE EXCEPTION 'Active orders must finish before erasure'; END IF;
  SELECT count(*) INTO pending_payments FROM public.payment_requests WHERE user_id=p_user_id AND status IN ('pending','created');
  IF pending_payments > 0 THEN RAISE EXCEPTION 'Pending top-ups must be resolved before erasure'; END IF;

  UPDATE public.orders SET phone_number=NULL, sms_code=NULL, sms_text=NULL, updated_at=now() WHERE user_id=p_user_id;
  UPDATE public.support_tickets SET subject='Support record', message='[Personal content erased]', public_reply=NULL, admin_notes=NULL, updated_at=now() WHERE user_id=p_user_id;
  UPDATE public.profiles SET email='deleted+' || replace(p_user_id::text,'-','') || '@redacted.invalid', full_name='Deleted User', is_banned=true, updated_at=now() WHERE id=p_user_id;

  IF p_request_id IS NOT NULL THEN
    UPDATE public.data_deletion_requests SET status='completed', processed_by=p_actor_id, processed_at=now(), updated_at=now() WHERE id=p_request_id AND user_id=p_user_id;
  END IF;
  RETURN jsonb_build_object('user_id',p_user_id,'financial_records_retained',true,'personal_data_erased',true);
END; $$;
REVOKE ALL ON FUNCTION public.erase_user_personal_data(UUID,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.erase_user_personal_data(UUID,UUID,UUID) TO service_role;
