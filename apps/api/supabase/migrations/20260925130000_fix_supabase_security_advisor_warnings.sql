-- Harden the legacy public RPCs flagged by Supabase's database linter.
-- Keep handle_new_user executable by the trigger owner; trigger invocation
-- does not require granting the function to API roles.
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public, auth, extensions;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, supabase_auth_admin;

ALTER FUNCTION public.check_email_exists(TEXT) SET search_path = pg_catalog, public, auth, extensions;
REVOKE ALL ON FUNCTION public.check_email_exists(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO service_role;

ALTER FUNCTION public.increment_total_orders(UUID) SET search_path = pg_catalog, public, auth, extensions;
REVOKE ALL ON FUNCTION public.increment_total_orders(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_total_orders(UUID) TO service_role;

ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public, auth, extensions;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO postgres, supabase_admin;

-- These tables are accessed through the server API using service_role, which
-- has BYPASSRLS. No permissive catch-all RLS policy is needed for that role.
DROP POLICY IF EXISTS "Service role full access referral fraud logs" ON public.referral_fraud_logs;
DROP POLICY IF EXISTS "Service role full access on referral fraud logs" ON public.referral_fraud_logs;
DROP POLICY IF EXISTS "Service role full access security logs" ON public.user_security_logs;
