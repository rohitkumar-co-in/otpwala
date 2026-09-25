-- Older deployments used a slightly different name for this catch-all policy.
-- service_role bypasses RLS and does not need a permissive policy.
DROP POLICY IF EXISTS "Service role full access referral fraud logs" ON public.referral_fraud_logs;
DROP POLICY IF EXISTS "Service role full access on referral fraud logs" ON public.referral_fraud_logs;
