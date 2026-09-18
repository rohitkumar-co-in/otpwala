-- ─── REFERRAL FRAUD DETECTION & AUDIT LOGS ─────────────────────
-- Add fraud metadata to public.referrals table
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS fraud_status TEXT NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS fraud_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attribution_ip TEXT,
  ADD COLUMN IF NOT EXISTS attribution_isp TEXT,
  ADD COLUMN IF NOT EXISTS attribution_user_agent TEXT;

-- Create immutable referral fraud logs table for investigation & forensics
CREATE TABLE IF NOT EXISTS public.referral_fraud_logs (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    referee_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    referral_code TEXT,
    ip_address    TEXT NOT NULL,
    isp           TEXT,
    user_agent    TEXT,
    fraud_score   INTEGER NOT NULL DEFAULT 0,
    reasons       TEXT[] NOT NULL DEFAULT '{}',
    action_taken  TEXT NOT NULL CHECK (action_taken IN ('blocked', 'flagged_for_review', 'commission_denied')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fraud investigation and velocity lookups
CREATE INDEX IF NOT EXISTS idx_referrals_fraud_status
  ON public.referrals(fraud_status);

CREATE INDEX IF NOT EXISTS idx_referrals_attribution_ip
  ON public.referrals(attribution_ip);

CREATE INDEX IF NOT EXISTS idx_referral_fraud_logs_referee
  ON public.referral_fraud_logs(referee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_fraud_logs_referrer
  ON public.referral_fraud_logs(referrer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_fraud_logs_ip
  ON public.referral_fraud_logs(ip_address);

-- Row-Level Security for referral_fraud_logs
ALTER TABLE public.referral_fraud_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view referral fraud logs" ON public.referral_fraud_logs;
CREATE POLICY "Admins can view referral fraud logs" ON public.referral_fraud_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

DROP POLICY IF EXISTS "Service role full access referral fraud logs" ON public.referral_fraud_logs;
CREATE POLICY "Service role full access referral fraud logs" ON public.referral_fraud_logs
  FOR ALL USING (true);
