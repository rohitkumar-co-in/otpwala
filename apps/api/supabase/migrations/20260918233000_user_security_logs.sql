-- ─── USER SECURITY LOGS & IP/ISP COMPLIANCE ─────────────────────
-- Add IP, ISP, ASN, and geo-location tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_ip TEXT,
  ADD COLUMN IF NOT EXISTS signup_isp TEXT,
  ADD COLUMN IF NOT EXISTS signup_country TEXT,
  ADD COLUMN IF NOT EXISTS signup_city TEXT,
  ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_login_isp TEXT,
  ADD COLUMN IF NOT EXISTS last_login_country TEXT,
  ADD COLUMN IF NOT EXISTS last_login_city TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Create immutable user security logs table for legal & compliance retention (CERT-In / SaaS safety)
CREATE TABLE IF NOT EXISTS public.user_security_logs (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    event_type  TEXT NOT NULL CHECK (event_type IN ('signup', 'login', 'oauth_login', 'password_reset', 'session_refresh')),
    ip_address  TEXT NOT NULL,
    isp         TEXT,
    asn         INTEGER,
    country     TEXT,
    region      TEXT,
    city        TEXT,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user history lookup
CREATE INDEX IF NOT EXISTS idx_user_security_logs_user_id_created_at
  ON public.user_security_logs(user_id, created_at DESC);

-- Index for IP/ISP investigation
CREATE INDEX IF NOT EXISTS idx_user_security_logs_ip_address
  ON public.user_security_logs(ip_address);

-- Row-Level Security
ALTER TABLE public.user_security_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own security logs" ON public.user_security_logs;
CREATE POLICY "Users can view own security logs" ON public.user_security_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all security logs" ON public.user_security_logs;
CREATE POLICY "Admins can view all security logs" ON public.user_security_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

DROP POLICY IF EXISTS "Service role full access security logs" ON public.user_security_logs;
CREATE POLICY "Service role full access security logs" ON public.user_security_logs
  FOR ALL USING (true);
