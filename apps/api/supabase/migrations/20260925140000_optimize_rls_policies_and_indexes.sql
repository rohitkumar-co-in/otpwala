-- Avoid per-row auth.uid() evaluation in user-facing RLS policies.
-- The service API uses service_role, which bypasses these SELECT policies.

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own payment requests" ON public.payment_requests;
CREATE POLICY "Users can view own payment requests"
  ON public.payment_requests FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view own transactions"
  ON public.wallet_transactions FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own referrals" ON public.referrals;
CREATE POLICY "Users can view own referrals"
  ON public.referrals FOR SELECT
  USING ((SELECT auth.uid()) = referrer_id OR (SELECT auth.uid()) = referred_id);

DROP POLICY IF EXISTS "Admins can view referral fraud logs" ON public.referral_fraud_logs;
CREATE POLICY "Admins can view referral fraud logs"
  ON public.referral_fraud_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'admin'
    )
  );

-- A single combined policy preserves both permissions while avoiding two
-- permissive policies being evaluated for every security-log row.
DROP POLICY IF EXISTS "Admins can view all security logs" ON public.user_security_logs;
DROP POLICY IF EXISTS "Users can view own security logs" ON public.user_security_logs;
CREATE POLICY "Users and admins can view security logs"
  ON public.user_security_logs FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY (ARRAY['admin'::text, 'superadmin'::text])
    )
  );

-- Keep one canonical copy of each confirmed identical index.
DROP INDEX IF EXISTS public.idx_payment_req_user_id;
DROP INDEX IF EXISTS public.idx_wallet_tx_created_at;
DROP INDEX IF EXISTS public.idx_wallet_tx_user_id;
