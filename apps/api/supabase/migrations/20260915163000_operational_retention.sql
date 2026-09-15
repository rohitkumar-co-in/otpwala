CREATE OR REPLACE FUNCTION public.cleanup_operational_records()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recovered_count INTEGER := 0;
  intent_count INTEGER := 0;
  alert_count INTEGER := 0;
BEGIN
  UPDATE public.purchase_intents
  SET status = 'failed',
      error_code = 'processing_timeout',
      error_message = 'Purchase processing timed out. Please start a new purchase.',
      updated_at = now()
  WHERE status = 'processing'
    AND updated_at < now() - interval '15 minutes';
  GET DIAGNOSTICS recovered_count = ROW_COUNT;

  DELETE FROM public.purchase_intents
  WHERE status IN ('completed', 'failed')
    AND updated_at < now() - interval '30 days';
  GET DIAGNOSTICS intent_count = ROW_COUNT;

  DELETE FROM public.operational_alerts
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS alert_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'timed_out_intents', recovered_count,
    'deleted_intents', intent_count,
    'deleted_alerts', alert_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_operational_records() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_operational_records() TO service_role;
