-- OTPWala standalone Supabase schema
-- Generated from supabase/migration.sql plus all apps/api/supabase/migrations.
-- Run this single file in Supabase SQL Editor for a fresh project.
-- Sections are ordered by dependency.

-- ===== BASE SCHEMA: supabase/migration.sql =====
-- ╔══════════════════════════════════════════════════════════════════╗
-- ║              OTPWala — Complete Supabase Schema                  ║
-- ║  Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS +    ║
-- ║  ON CONFLICT DO NOTHING / DROP POLICY IF EXISTS everywhere)     ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ─── 1. USER PROFILES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email           TEXT NOT NULL,
    full_name       TEXT,
    role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    wallet_balance  DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    total_spent     DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    total_orders    INTEGER NOT NULL DEFAULT 0,
    is_banned       BOOLEAN NOT NULL DEFAULT FALSE,
    referral_code   TEXT UNIQUE,
    referred_by     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Service role full access profiles" ON public.profiles;
CREATE POLICY "Service role full access profiles" ON public.profiles FOR ALL USING (true);

-- Add new columns to existing profiles table (safe on re-run)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by   TEXT;

-- Add unique constraint on referral_code if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_referral_code_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);
  END IF;
END $$;

-- ─── 2. WALLET TRANSACTIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('topup','deduction','refund','admin_credit','referral_bonus')),
    amount          DECIMAL(12,4) NOT NULL,
    balance_after   DECIMAL(12,4) NOT NULL,
    description     TEXT,
    payment_id      TEXT,
    payment_method  TEXT,
    status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view own transactions" ON public.wallet_transactions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access wallet_transactions" ON public.wallet_transactions;
CREATE POLICY "Service role full access wallet_transactions" ON public.wallet_transactions FOR ALL USING (true);

-- ─── 3. ORDERS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    activation_id   TEXT NOT NULL,
    service_code    TEXT NOT NULL,
    service_name    TEXT NOT NULL,
    country_code    INTEGER NOT NULL,
    country_name    TEXT NOT NULL,
    phone_number    TEXT NOT NULL,
    cost_price_usd  DECIMAL(12,6) NOT NULL,
    sell_price_inr  DECIMAL(12,4) NOT NULL,
    price_inr       DECIMAL(12,4),
    sms_code        TEXT,
    sms_text        TEXT,
    status          TEXT NOT NULL DEFAULT 'waiting' CHECK (
                        status IN ('waiting','code_received','completed','cancelled','refunded','expired')),
    tiger_status    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access orders" ON public.orders;
CREATE POLICY "Service role full access orders" ON public.orders FOR ALL USING (true);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

-- Add price_inr and expires_at columns to existing orders table (safe on re-run)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS price_inr DECIMAL(12,4);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
-- Backfill price_inr from sell_price_inr for existing rows
UPDATE public.orders SET price_inr = sell_price_inr WHERE price_inr IS NULL;

-- ─── 4. PRICING RULES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_rules (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_code    TEXT,
    country_code    INTEGER,
    markup_type     TEXT NOT NULL CHECK (markup_type IN ('percentage','flat','fixed_price')),
    markup_value    DECIMAL(12,4) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    priority        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read pricing" ON public.pricing_rules;
CREATE POLICY "Public read pricing" ON public.pricing_rules FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manage pricing" ON public.pricing_rules;
CREATE POLICY "Service role manage pricing" ON public.pricing_rules FOR ALL USING (true);

-- ─── 5. SETTINGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read settings" ON public.settings;
CREATE POLICY "Public read settings" ON public.settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manage settings" ON public.settings;
CREATE POLICY "Service role manage settings" ON public.settings FOR ALL USING (true);

INSERT INTO public.settings (key, value) VALUES
    ('usd_to_inr_rate',                 '"86.50"'),
    ('dollar_rate_mode',                '"custom"'),
    ('tiger_default_rate',              '"85.00"'),
    ('custom_dollar_rate',              '"86.50"'),
    ('default_markup_percentage',       '"25"'),
    ('min_deposit_inr',                 '"50"'),
    ('max_deposit_inr',                 '"50000"'),
    ('disabled_services',               '[]'),
    ('disabled_countries',              '[]'),
    ('zero_markup_user_ids',            '[]'),
    ('brand_name',                      '"OTPWala"'),
    ('title_separator',                 '"—"'),
    ('brand_slogan',                    '"Instant Virtual Numbers for SMS Verification"'),
    ('maintenance_mode',                '"false"'),
    ('upi_id',                          '""'),
    ('upi_name',                        '""'),
    ('upi_qr_url',                      '""'),
    ('telegram_bot_token',              '""'),
    ('telegram_admin_chat_id',          '""'),
    ('telegram_notifications_enabled',  '"true"'),
    ('referral_bonus_percent_1',        '"20"'),
    ('referral_bonus_percent_2',        '"5"'),
    ('referral_bonus_percent_3',        '"5"'),
    ('referral_bonus_window_days',      '"30"'),
    ('referral_claim_window_hours',     '"24"')
ON CONFLICT (key) DO NOTHING;

-- ─── 6. PAYMENT REQUESTS (UPI manual top-up) ────────────────────
CREATE TABLE IF NOT EXISTS public.payment_requests (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    amount          DECIMAL(12,4),
    transaction_id  TEXT,
    payment_method  TEXT NOT NULL DEFAULT 'upi',
    screenshot_url  TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    admin_notes     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe migration for existing payment_requests tables created with old schema
DO $$
BEGIN
    -- 1. amount column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'amount_inr'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'amount'
    ) THEN
        ALTER TABLE public.payment_requests RENAME COLUMN amount_inr TO amount;
    ELSE
        ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS amount DECIMAL(12,4);
    END IF;

    -- 2. transaction_id column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'gateway_payment_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'transaction_id'
    ) THEN
        ALTER TABLE public.payment_requests RENAME COLUMN gateway_payment_id TO transaction_id;
    ELSE
        ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS transaction_id TEXT;
    END IF;

    -- 3. payment_method column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'gateway'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'payment_requests' AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE public.payment_requests RENAME COLUMN gateway TO payment_method;
    ELSE
        ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'upi';
    END IF;

    -- 4. Additional fields
    ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
    ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT;
    ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- 5. Drop old status check constraints and set default to pending
    ALTER TABLE public.payment_requests ALTER COLUMN status SET DEFAULT 'pending';
    ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_status_check;
    ALTER TABLE public.payment_requests 
        ADD CONSTRAINT payment_requests_status_check 
        CHECK (status IN ('pending', 'approved', 'rejected', 'created', 'paid', 'failed', 'expired'));
END $$;

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own payment requests" ON public.payment_requests;
CREATE POLICY "Users can view own payment requests" ON public.payment_requests FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own payment requests" ON public.payment_requests;
CREATE POLICY "Users can insert own payment requests" ON public.payment_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access payment_requests" ON public.payment_requests;
CREATE POLICY "Service role full access payment_requests" ON public.payment_requests FOR ALL USING (true);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ─── 7. REFERRALS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referrals (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    referrer_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    referred_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    referral_code   TEXT NOT NULL,
    deposit_count   INTEGER NOT NULL DEFAULT 0,
    bonus_paid_1    BOOLEAN NOT NULL DEFAULT FALSE,
    bonus_paid_2    BOOLEAN NOT NULL DEFAULT FALSE,
    bonus_paid_3    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (referred_id)
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access referrals" ON public.referrals;
CREATE POLICY "Service role full access referrals" ON public.referrals FOR ALL USING (true);
DROP POLICY IF EXISTS "Users can view own referrals" ON public.referrals;
CREATE POLICY "Users can view own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- ─── 8. TRIGGERS & FUNCTIONS ────────────────────────────────────

-- Auto-create profile + unique referral code on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_code TEXT;
BEGIN
    v_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    INSERT INTO public.profiles (id, email, full_name, referral_code)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        v_code
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Check if email exists in auth.users or profiles (callable by API with SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(p_email))
    ) OR EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(email) = lower(trim(p_email))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon, authenticated, service_role;

-- Backfill any existing auth.users into profiles if missing
INSERT INTO public.profiles (id, email, full_name, referral_code)
SELECT 
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
    upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Increment total_orders helper
CREATE OR REPLACE FUNCTION public.increment_total_orders(p_user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.profiles
    SET total_orders = total_orders + 1, updated_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at      ON public.profiles;
DROP TRIGGER IF EXISTS trg_orders_updated_at         ON public.orders;
DROP TRIGGER IF EXISTS trg_payment_requests_updated  ON public.payment_requests;
DROP TRIGGER IF EXISTS trg_pricing_rules_updated     ON public.pricing_rules;
DROP TRIGGER IF EXISTS trg_referrals_updated         ON public.referrals;

CREATE TRIGGER trg_profiles_updated_at      BEFORE UPDATE ON public.profiles          FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated_at        BEFORE UPDATE ON public.orders             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payment_requests_updated BEFORE UPDATE ON public.payment_requests   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pricing_rules_updated    BEFORE UPDATE ON public.pricing_rules      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_referrals_updated        BEFORE UPDATE ON public.referrals          FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 9. INDEXES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_user_id         ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at      ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_activation_id   ON public.orders(activation_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_id      ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created_at   ON public.wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_req_user_id    ON public.payment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_req_status     ON public.payment_requests(status);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_active   ON public.pricing_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_profiles_email         ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer     ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred     ON public.referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code         ON public.referrals(referral_code);

-- ─── 10. GRANTS ─────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;

-- ===== MIGRATION: 20260914183228_update_role_constraint.sql =====

-- ===== MIGRATION: 20260915130000_production_financial_integrity.sql =====
-- Production financial integrity and RLS hardening.
-- Apply through the Supabase migration runner before deploying matching API code.

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_idempotency_key_uidx
  ON public.wallet_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fx_rate DECIMAL(12,6),
  ADD COLUMN IF NOT EXISTS cost_price_inr DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS refund_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_transaction_id UUID REFERENCES public.wallet_transactions(id),
  ADD COLUMN IF NOT EXISTS refund_failure_reason TEXT;

DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_refund_status_check
    CHECK (refund_status IN ('not_applicable','pending','processing','refunded','failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_transaction_id_uidx
  ON public.payment_requests (lower(trim(transaction_id)))
  WHERE transaction_id IS NOT NULL AND trim(transaction_id) <> '';

-- Service-role clients bypass RLS; permissive USING(true) policies expose data to
-- normal PostgREST roles and must not exist.
DROP POLICY IF EXISTS "Service role full access profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access wallet_transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Service role full access orders" ON public.orders;
DROP POLICY IF EXISTS "Service role manage pricing" ON public.pricing_rules;
DROP POLICY IF EXISTS "Service role manage settings" ON public.settings;
DROP POLICY IF EXISTS "Service role full access payment_requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Service role full access referrals" ON public.referrals;
DROP POLICY IF EXISTS "Public read pricing" ON public.pricing_rules;
DROP POLICY IF EXISTS "Public read settings" ON public.settings;
DROP POLICY IF EXISTS "Users can insert own payment requests" ON public.payment_requests;

-- Customers may edit only non-financial profile fields through the API. Direct
-- profile updates are disabled to protect role, bans, balances and counters.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE OR REPLACE FUNCTION public.post_wallet_transaction(
  p_user_id UUID,
  p_amount DECIMAL,
  p_type TEXT,
  p_description TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance DECIMAL(12,4);
  v_tx public.wallet_transactions%ROWTYPE;
BEGIN
  IF p_amount = 0 OR p_type NOT IN ('topup','deduction','refund','admin_credit','referral_bonus') THEN
    RAISE EXCEPTION 'invalid_wallet_transaction';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_tx FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN QUERY SELECT v_tx.id, v_tx.balance_after;
      RETURN;
    END IF;
  END IF;

  SELECT wallet_balance INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_balance + p_amount < 0 THEN RAISE EXCEPTION 'insufficient_wallet_balance'; END IF;

  v_balance := round(v_balance + p_amount, 4);
  UPDATE public.profiles SET wallet_balance = v_balance, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.wallet_transactions
    (user_id,type,amount,balance_after,description,status,reference_type,reference_id,idempotency_key)
  VALUES
    (p_user_id,p_type,abs(p_amount),v_balance,p_description,'completed',p_reference_type,p_reference_id,p_idempotency_key)
  RETURNING * INTO v_tx;

  RETURN QUERY SELECT v_tx.id, v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_payment_request_atomic(p_request_id UUID, p_admin_id TEXT)
RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request public.payment_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_request_not_found'; END IF;
  IF v_request.status IN ('approved','paid') THEN RAISE EXCEPTION 'payment_request_already_approved'; END IF;
  IF v_request.status NOT IN ('pending','created') THEN RAISE EXCEPTION 'payment_request_not_pending'; END IF;
  IF coalesce(v_request.amount,0) <= 0 THEN RAISE EXCEPTION 'invalid_payment_amount'; END IF;

  UPDATE public.payment_requests
    SET status = 'approved', admin_notes = concat('Approved by ', p_admin_id), updated_at = now()
    WHERE id = p_request_id;

  RETURN QUERY SELECT * FROM public.post_wallet_transaction(
    v_request.user_id, v_request.amount, 'topup',
    concat('Deposit approved (UTR: ', coalesce(v_request.transaction_id, v_request.id::text), ')'),
    'payment_request', v_request.id::text, concat('topup:', v_request.id::text)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_order_atomic(p_order_id UUID, p_terminal_status TEXT, p_reason TEXT)
RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_result RECORD;
BEGIN
  IF p_terminal_status NOT IN ('cancelled','expired') THEN RAISE EXCEPTION 'invalid_terminal_status'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.sms_code IS NOT NULL OR v_order.status IN ('code_received','completed') THEN
    RAISE EXCEPTION 'otp_delivered_not_refundable';
  END IF;

  SELECT * INTO v_result FROM public.post_wallet_transaction(
    v_order.user_id, v_order.sell_price_inr, 'refund', p_reason,
    'order', v_order.id::text, concat('refund:', v_order.id::text)
  );

  UPDATE public.orders SET
    status = p_terminal_status,
    refund_status = 'refunded',
    refund_transaction_id = v_result.transaction_id,
    refunded_at = coalesce(refunded_at, now()),
    cancelled_at = CASE WHEN p_terminal_status = 'cancelled' THEN coalesce(cancelled_at, now()) ELSE cancelled_at END,
    expired_at = CASE WHEN p_terminal_status = 'expired' THEN coalesce(expired_at, now()) ELSE expired_at END,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN QUERY SELECT v_result.transaction_id, v_result.balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalUsers', (SELECT count(*) FROM profiles),
    'totalOrders', (SELECT count(*) FROM orders),
    'ordersToday', (SELECT count(*) FROM orders WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'activeOrders', (SELECT count(*) FROM orders WHERE status = 'waiting'),
    'otpDelivered', (SELECT count(*) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'otpNotReceived', (SELECT count(*) FROM orders WHERE sms_code IS NULL AND status IN ('cancelled','expired','refunded')),
    'totalTopups', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed'),
    'topupsToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'adminCredits', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_credit' AND status = 'completed'),
    'refundAmount', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'refund' AND status = 'completed'),
    'refundCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'refund' AND status = 'completed'),
    'refundsPending', (SELECT count(*) FROM orders WHERE refund_status IN ('pending','processing','failed')),
    'grossOtpSales', (SELECT coalesce(sum(sell_price_inr),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'providerCostInr', (SELECT coalesce(sum(cost_price_inr),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'grossProfit', (SELECT coalesce(sum(sell_price_inr - coalesce(cost_price_inr,0)),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'walletLiability', (SELECT coalesce(sum(wallet_balance),0) FROM profiles WHERE role = 'user')
  );
$$;

CREATE OR REPLACE FUNCTION public.user_order_metrics(p_user_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalOrders', count(*),
    'activeOrders', count(*) FILTER (WHERE status = 'waiting'),
    'otpDelivered', count(*) FILTER (WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'otpNotReceived', count(*) FILTER (WHERE sms_code IS NULL AND status IN ('cancelled','expired','refunded')),
    'totalRefunded', coalesce(sum(sell_price_inr) FILTER (WHERE refund_status = 'refunded'),0),
    'spentOnDelivered', coalesce(sum(sell_price_inr) FILTER (WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),0)
  ) FROM orders WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_payment_request_atomic(UUID,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_order_atomic(UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dashboard_metrics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_order_metrics(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_payment_request_atomic(UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_order_atomic(UUID,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.user_order_metrics(UUID) TO service_role;

-- ===== MIGRATION: 20260915141000_backfill_legacy_order_expiry.sql =====
-- Ensure orders created before expiry tracking was introduced are reconciled.
UPDATE public.orders
SET expires_at = created_at + INTERVAL '20 minutes'
WHERE status = 'waiting'
  AND expires_at IS NULL;

CREATE INDEX IF NOT EXISTS orders_waiting_expiry_idx
  ON public.orders (expires_at)
  WHERE status = 'waiting';

-- ===== MIGRATION: 20260915142500_admin_audit_log.sql =====
-- Append-only audit trail for privileged administrative actions.
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 3 AND 100),
  target_type TEXT NOT NULL CHECK (length(target_type) BETWEEN 2 AND 50),
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx
  ON public.admin_audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx
  ON public.admin_audit_logs (target_type, target_id, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO service_role;

COMMENT ON TABLE public.admin_audit_logs IS
  'Append-only server-side record of privileged administrative actions.';

-- ===== MIGRATION: 20260915145500_support_tickets.sql =====
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 5 AND 120),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  admin_notes TEXT CHECK (admin_notes IS NULL OR length(admin_notes) <= 4000),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx ON public.support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx ON public.support_tickets(status, priority, created_at);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO service_role;

-- ===== MIGRATION: 20260915150000_support_public_reply.sql =====
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS public_reply TEXT CHECK (public_reply IS NULL OR length(public_reply) <= 4000);

-- ===== MIGRATION: 20260915153000_purchase_idempotency.sql =====
CREATE TABLE IF NOT EXISTS public.purchase_intents (
  request_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_code TEXT NOT NULL,
  country_code INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  response JSONB,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_intents_user_created_idx ON public.purchase_intents(user_id, created_at DESC);
ALTER TABLE public.purchase_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_intents TO service_role;

-- ===== MIGRATION: 20260915160000_operational_alerts.sql =====
CREATE TABLE IF NOT EXISTS public.operational_alerts (
  alert_key TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_alerts_type_created_idx ON public.operational_alerts(alert_type, created_at DESC);
ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operational_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.operational_alerts TO service_role;

-- ===== MIGRATION: 20260915163000_operational_retention.sql =====
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

-- ===== MIGRATION: 20260915170000_order_events.sql =====
CREATE TABLE IF NOT EXISTS public.order_events (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','status_changed','otp_received','refunded','snapshot')),
  from_status TEXT,
  to_status TEXT,
  refund_status TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_events_order_created_idx ON public.order_events(order_id, created_at ASC);
CREATE INDEX IF NOT EXISTS order_events_user_created_idx ON public.order_events(user_id, created_at DESC);
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.order_events TO service_role;

CREATE OR REPLACE FUNCTION public.capture_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE event_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_name := 'created';
  ELSIF NEW.sms_code IS NOT NULL AND OLD.sms_code IS DISTINCT FROM NEW.sms_code THEN
    event_name := 'otp_received';
  ELSIF NEW.refund_status = 'refunded' AND OLD.refund_status IS DISTINCT FROM NEW.refund_status THEN
    event_name := 'refunded';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    event_name := 'status_changed';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.order_events(order_id, user_id, event_type, from_status, to_status, refund_status, details, created_at)
  VALUES (
    NEW.id, NEW.user_id, event_name,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status, NEW.refund_status,
    jsonb_strip_nulls(jsonb_build_object('service', NEW.service_name, 'country', NEW.country_name)),
    COALESCE(NEW.updated_at, NEW.created_at, now())
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_capture_event ON public.orders;
CREATE TRIGGER orders_capture_event
AFTER INSERT OR UPDATE OF status, refund_status, sms_code ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.capture_order_event();

INSERT INTO public.order_events(order_id, user_id, event_type, to_status, refund_status, details, created_at)
SELECT o.id, o.user_id, 'snapshot', o.status, o.refund_status,
       jsonb_strip_nulls(jsonb_build_object('service', o.service_name, 'country', o.country_name, 'backfilled', true)),
       COALESCE(o.updated_at, o.created_at, now())
FROM public.orders o
WHERE NOT EXISTS (SELECT 1 FROM public.order_events e WHERE e.order_id = o.id);

REVOKE ALL ON FUNCTION public.capture_order_event() FROM PUBLIC, anon, authenticated;

-- ===== MIGRATION: 20260915180000_data_erasure_workflow.sql =====
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

-- ===== MIGRATION: 20260915190000_financial_integrity_report.sql =====
CREATE OR REPLACE FUNCTION public.financial_integrity_report()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH
orders_without_debit AS (
  SELECT count(*) AS n FROM orders o
  WHERE NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
order_debit_mismatch AS (
  SELECT count(*) AS n FROM orders o JOIN wallet_transactions w ON w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed'
  WHERE abs(coalesce(w.amount,0)-coalesce(o.sell_price_inr,o.price_inr,0)) > 0.01
),
refund_without_credit AS (
  SELECT count(*) AS n FROM orders o WHERE o.refund_status='refunded'
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='refund' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
refund_amount_mismatch AS (
  SELECT count(*) AS n FROM orders o JOIN wallet_transactions w ON w.type='refund' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed'
  WHERE abs(coalesce(w.amount,0)-coalesce(o.sell_price_inr,o.price_inr,0)) > 0.01
),
topup_without_credit AS (
  SELECT count(*) AS n FROM payment_requests p WHERE p.status IN('approved','paid')
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed')
),
topup_amount_mismatch AS (
  SELECT count(*) AS n FROM payment_requests p JOIN wallet_transactions w ON w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed'
  WHERE p.status IN('approved','paid') AND abs(coalesce(w.amount,0)-coalesce(p.amount,0)) > 0.01
),
wallet_balance_mismatch AS (
  SELECT count(*) AS n FROM profiles p CROSS JOIN baseline b
  LEFT JOIN LATERAL (SELECT balance_after, created_at FROM wallet_transactions w WHERE w.user_id=p.id AND w.status='completed' ORDER BY w.created_at DESC,w.id DESC LIMIT 1) latest ON true
  WHERE latest.created_at >= b.cutover_at
    AND latest.balance_after IS NOT NULL
    AND abs(coalesce(p.wallet_balance,0)-latest.balance_after)>0.01
),
totals AS (
  SELECT (SELECT n FROM orders_without_debit) orders_without_debit,
         (SELECT n FROM order_debit_mismatch) order_debit_mismatch,
         (SELECT n FROM refund_without_credit) refund_without_credit,
         (SELECT n FROM refund_amount_mismatch) refund_amount_mismatch,
         (SELECT n FROM topup_without_credit) topup_without_credit,
         (SELECT n FROM topup_amount_mismatch) topup_amount_mismatch,
         (SELECT n FROM wallet_balance_mismatch) wallet_balance_mismatch
)
SELECT jsonb_build_object(
  'checkedAt',now(),
  'ordersWithoutDebit',orders_without_debit,
  'orderDebitMismatch',order_debit_mismatch,
  'refundsWithoutCredit',refund_without_credit,
  'refundAmountMismatch',refund_amount_mismatch,
  'topupsWithoutCredit',topup_without_credit,
  'topupAmountMismatch',topup_amount_mismatch,
  'walletBalanceMismatch',wallet_balance_mismatch,
  'totalIssues',orders_without_debit+order_debit_mismatch+refund_without_credit+refund_amount_mismatch+topup_without_credit+topup_amount_mismatch+wallet_balance_mismatch
) FROM totals;
$$;
REVOKE ALL ON FUNCTION public.financial_integrity_report() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.financial_integrity_report() TO service_role;

-- ===== MIGRATION: 20260915191000_financial_ledger_baseline.sql =====
-- Establish an explicit baseline before enforcing live cross-ledger checks.
-- Historic records from before this timestamp used the prior non-atomic wallet flow.
CREATE TABLE IF NOT EXISTS public.financial_ledger_baselines (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  cutover_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_ledger_baselines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_ledger_baselines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.financial_ledger_baselines TO service_role;

INSERT INTO public.financial_ledger_baselines (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

-- Opening balances are a zero-value audit snapshot, not revenue, a top-up, or a credit.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type = ANY (ARRAY['topup'::text, 'deduction'::text, 'refund'::text, 'admin_credit'::text, 'opening_balance'::text]));

INSERT INTO public.wallet_transactions
  (user_id, type, amount, balance_after, description, status, reference_type, reference_id, idempotency_key)
SELECT p.id, 'opening_balance', 0, p.wallet_balance,
       'Opening balance recorded at financial-ledger baseline', 'completed',
       'financial_ledger_baseline', p.id::text, 'opening-balance:' || p.id::text
FROM public.profiles p
WHERE coalesce(p.wallet_balance, 0) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions w
    WHERE w.user_id = p.id AND w.status = 'completed'
  )
ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

CREATE OR REPLACE FUNCTION public.financial_integrity_report()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
WITH baseline AS (
  SELECT cutover_at FROM financial_ledger_baselines WHERE singleton = true
),
orders_without_debit AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b
  WHERE o.created_at >= b.cutover_at
    AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
order_debit_mismatch AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b JOIN wallet_transactions w ON w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed'
  WHERE o.created_at >= b.cutover_at AND abs(coalesce(w.amount,0)-coalesce(o.sell_price_inr,o.price_inr,0)) > 0.01
),
refund_without_credit AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b WHERE o.created_at >= b.cutover_at AND o.refund_status='refunded'
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='refund' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
refund_amount_mismatch AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b JOIN wallet_transactions w ON w.type='refund' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed'
  WHERE o.created_at >= b.cutover_at AND abs(coalesce(w.amount,0)-coalesce(o.sell_price_inr,o.price_inr,0)) > 0.01
),
topup_without_credit AS (
  SELECT count(*) AS n FROM payment_requests p CROSS JOIN baseline b WHERE p.created_at >= b.cutover_at AND p.status IN('approved','paid')
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed')
),
topup_amount_mismatch AS (
  SELECT count(*) AS n FROM payment_requests p CROSS JOIN baseline b JOIN wallet_transactions w ON w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed'
  WHERE p.created_at >= b.cutover_at AND p.status IN('approved','paid') AND abs(coalesce(w.amount,0)-coalesce(p.amount,0)) > 0.01
),
wallet_balance_mismatch AS (
  SELECT count(*) AS n FROM profiles p
  LEFT JOIN LATERAL (SELECT balance_after FROM wallet_transactions w WHERE w.user_id=p.id AND w.status='completed' ORDER BY w.created_at DESC,w.id DESC LIMIT 1) latest ON true
  WHERE (latest.balance_after IS NOT NULL AND abs(coalesce(p.wallet_balance,0)-latest.balance_after)>0.01)
     OR (latest.balance_after IS NULL AND abs(coalesce(p.wallet_balance,0))>0.01)
),
legacy_unlinked_orders AS (
  SELECT count(*) AS n FROM orders o CROSS JOIN baseline b WHERE o.created_at < b.cutover_at
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='deduction' AND w.reference_type='order' AND w.reference_id=o.id::text AND w.status='completed')
),
legacy_unlinked_topups AS (
  SELECT count(*) AS n FROM payment_requests p CROSS JOIN baseline b WHERE p.created_at < b.cutover_at AND p.status IN('approved','paid')
  AND NOT EXISTS (SELECT 1 FROM wallet_transactions w WHERE w.type='topup' AND w.reference_type='payment_request' AND w.reference_id=p.id::text AND w.status='completed')
),
totals AS (
  SELECT (SELECT cutover_at FROM baseline) cutover_at,
         (SELECT n FROM orders_without_debit) orders_without_debit,
         (SELECT n FROM order_debit_mismatch) order_debit_mismatch,
         (SELECT n FROM refund_without_credit) refunds_without_credit,
         (SELECT n FROM refund_amount_mismatch) refund_amount_mismatch,
         (SELECT n FROM topup_without_credit) topups_without_credit,
         (SELECT n FROM topup_amount_mismatch) topup_amount_mismatch,
         (SELECT n FROM wallet_balance_mismatch) wallet_balance_mismatch,
         (SELECT n FROM legacy_unlinked_orders) legacy_unlinked_orders,
         (SELECT n FROM legacy_unlinked_topups) legacy_unlinked_topups
)
SELECT jsonb_build_object(
  'checkedAt',now(), 'baselineAt',cutover_at,
  'ordersWithoutDebit',orders_without_debit, 'orderDebitMismatch',order_debit_mismatch,
  'refundsWithoutCredit',refunds_without_credit, 'refundAmountMismatch',refund_amount_mismatch,
  'topupsWithoutCredit',topups_without_credit, 'topupAmountMismatch',topup_amount_mismatch,
  'walletBalanceMismatch',wallet_balance_mismatch,
  'legacyUnlinkedOrders',legacy_unlinked_orders, 'legacyUnlinkedTopups',legacy_unlinked_topups,
  'totalIssues',orders_without_debit+order_debit_mismatch+refunds_without_credit+refund_amount_mismatch+topups_without_credit+topup_amount_mismatch+wallet_balance_mismatch
) FROM totals;
$$;
REVOKE ALL ON FUNCTION public.financial_integrity_report() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.financial_integrity_report() TO service_role;

-- ===== MIGRATION: 20260915192000_wallet_ledger_append_only.sql =====
-- The ledger is append-only. Production application code must use the
-- SECURITY DEFINER post_wallet_transaction RPC, which is owned by postgres.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type = ANY (ARRAY['topup'::text, 'deduction'::text, 'refund'::text, 'admin_credit'::text, 'referral_bonus'::text, 'opening_balance'::text]));

CREATE OR REPLACE FUNCTION public.enforce_wallet_ledger_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'wallet_ledger_is_append_only';
  END IF;

  IF current_setting('app.wallet_posting', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'wallet_ledger_must_use_post_wallet_transaction';
  END IF;

  IF NEW.balance_after IS NULL OR NEW.balance_after < 0 THEN
    RAISE EXCEPTION 'invalid_wallet_balance_after';
  END IF;
  IF NEW.type = 'opening_balance' THEN
    IF NEW.amount <> 0 OR NEW.reference_type <> 'financial_ledger_baseline' THEN
      RAISE EXCEPTION 'invalid_opening_balance_entry';
    END IF;
  ELSIF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'wallet_transaction_amount_must_be_positive';
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the posting function with sign checks; the table stores absolute
-- amounts, while the RPC input carries the debit/credit direction.
CREATE OR REPLACE FUNCTION public.post_wallet_transaction(
  p_user_id UUID,
  p_amount DECIMAL,
  p_type TEXT,
  p_description TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance DECIMAL(12,4);
  v_tx public.wallet_transactions%ROWTYPE;
BEGIN
  IF p_amount = 0 OR p_type NOT IN ('topup','deduction','refund','admin_credit','referral_bonus') THEN
    RAISE EXCEPTION 'invalid_wallet_transaction';
  END IF;
  IF p_type = 'deduction' AND p_amount >= 0 THEN
    RAISE EXCEPTION 'wallet_deduction_must_be_negative';
  END IF;
  IF p_type <> 'deduction' AND p_amount <= 0 THEN
    RAISE EXCEPTION 'wallet_credit_must_be_positive';
  END IF;

  -- The append-only trigger only permits this RPC's transaction-local marker.
  PERFORM set_config('app.wallet_posting', 'trusted', true);

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_tx FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN QUERY SELECT v_tx.id, v_tx.balance_after;
      RETURN;
    END IF;
  END IF;

  SELECT wallet_balance INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_balance + p_amount < 0 THEN RAISE EXCEPTION 'insufficient_wallet_balance'; END IF;

  v_balance := round(v_balance + p_amount, 4);
  UPDATE public.profiles SET wallet_balance = v_balance, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.wallet_transactions
    (user_id,type,amount,balance_after,description,status,reference_type,reference_id,idempotency_key)
  VALUES
    (p_user_id,p_type,abs(p_amount),v_balance,p_description,'completed',p_reference_type,p_reference_id,p_idempotency_key)
  RETURNING * INTO v_tx;

  RETURN QUERY SELECT v_tx.id, v_balance;
END;
$$;

DROP TRIGGER IF EXISTS wallet_transactions_append_only ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_append_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_ledger_append_only();
REVOKE ALL ON FUNCTION public.enforce_wallet_ledger_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;

-- ===== MIGRATION: 20260915200000_support_ticket_types_attachments.sql =====
-- Structured support routing and optional evidence image.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'general_help',
  ADD COLUMN IF NOT EXISTS attachment JSONB;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_ticket_type_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_ticket_type_check
  CHECK (ticket_type IN ('general_help','payment_issue','order_issue','bug_report','account_security'));

CREATE INDEX IF NOT EXISTS support_tickets_type_idx ON public.support_tickets(ticket_type, created_at DESC);

-- ===== MIGRATION: 20260915210000_admin_funding_sources.sql =====
-- Separate real customer money from goodwill balance added by an admin.
--   topup        -> UPI deposit approved by an admin        (real money in)
--   admin_credit -> manually funded, money received by admin (real money in)
--   admin_grant  -> free funds added by an admin             (NOT revenue)
-- Apply through the Supabase migration runner before deploying matching API code.

ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type = ANY (ARRAY['topup'::text, 'deduction'::text, 'refund'::text, 'admin_credit'::text, 'admin_grant'::text, 'referral_bonus'::text, 'opening_balance'::text]));

CREATE INDEX IF NOT EXISTS wallet_transactions_funding_idx
  ON public.wallet_transactions (type, created_at DESC)
  WHERE type = ANY (ARRAY['topup'::text, 'admin_credit'::text, 'admin_grant'::text]);

-- Recreated unchanged except that admin_grant is now a valid credit type.
CREATE OR REPLACE FUNCTION public.post_wallet_transaction(
  p_user_id UUID,
  p_amount DECIMAL,
  p_type TEXT,
  p_description TEXT,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE(transaction_id UUID, balance_after DECIMAL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance DECIMAL(12,4);
  v_tx public.wallet_transactions%ROWTYPE;
BEGIN
  IF p_amount = 0 OR p_type NOT IN ('topup','deduction','refund','admin_credit','admin_grant','referral_bonus') THEN
    RAISE EXCEPTION 'invalid_wallet_transaction';
  END IF;
  IF p_type = 'deduction' AND p_amount >= 0 THEN
    RAISE EXCEPTION 'wallet_deduction_must_be_negative';
  END IF;
  IF p_type <> 'deduction' AND p_amount <= 0 THEN
    RAISE EXCEPTION 'wallet_credit_must_be_positive';
  END IF;

  -- The append-only trigger only permits this RPC's transaction-local marker.
  PERFORM set_config('app.wallet_posting', 'trusted', true);

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_tx FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN QUERY SELECT v_tx.id, v_tx.balance_after;
      RETURN;
    END IF;
  END IF;

  SELECT wallet_balance INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_balance + p_amount < 0 THEN RAISE EXCEPTION 'insufficient_wallet_balance'; END IF;

  v_balance := round(v_balance + p_amount, 4);
  UPDATE public.profiles SET wallet_balance = v_balance, updated_at = now() WHERE id = p_user_id;

  INSERT INTO public.wallet_transactions
    (user_id,type,amount,balance_after,description,status,reference_type,reference_id,idempotency_key)
  VALUES
    (p_user_id,p_type,abs(p_amount),v_balance,p_description,'completed',p_reference_type,p_reference_id,p_idempotency_key)
  RETURNING * INTO v_tx;

  RETURN QUERY SELECT v_tx.id, v_balance;
END;
$$;

-- ── One-time history reclassification ───────────────────────────────────────
-- The current production ledger has four genuine user top-ups and the remaining
-- legacy admin_credit rows are known admin-added free funds. Only legacy rows
-- without any payment/reference marker are re-labelled; payment approvals use
-- type=topup and are therefore unaffected.
--
-- If that data assumption is not true, remove this UPDATE before applying the
-- migration and classify those rows manually. Do not reverse this with a direct
-- UPDATE later; the restored append-only trigger intentionally blocks that.
-- The ledger is append-only, so temporarily allow only this exact historical
-- type/reference rewrite. The strict append-only trigger is restored immediately
-- after the backfill.
CREATE OR REPLACE FUNCTION public.enforce_wallet_ledger_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('app.wallet_reclassification', true) = 'trusted'
     AND OLD.type = 'admin_credit'
     AND NEW.type = 'admin_grant'
     AND OLD.reference_type IS NULL
     AND NEW.reference_type = 'admin_funding'
     AND NEW.reference_id = 'grant'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.balance_after IS NOT DISTINCT FROM OLD.balance_after
     AND NEW.description IS NOT DISTINCT FROM OLD.description
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.idempotency_key IS NOT DISTINCT FROM OLD.idempotency_key THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'wallet_ledger_is_append_only';
  END IF;
  IF current_setting('app.wallet_posting', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'wallet_ledger_must_use_post_wallet_transaction';
  END IF;
  IF NEW.balance_after IS NULL OR NEW.balance_after < 0 THEN
    RAISE EXCEPTION 'invalid_wallet_balance_after';
  END IF;
  IF NEW.type = 'opening_balance' THEN
    IF NEW.amount <> 0 OR NEW.reference_type <> 'financial_ledger_baseline' THEN
      RAISE EXCEPTION 'invalid_opening_balance_entry';
    END IF;
  ELSIF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'wallet_transaction_amount_must_be_positive';
  END IF;
  RETURN NEW;
END;
$$;

SELECT set_config('app.wallet_reclassification', 'trusted', true);
SELECT set_config('app.wallet_posting', 'trusted', true);
UPDATE public.wallet_transactions
   SET type = 'admin_grant',
       reference_type = 'admin_funding',
       reference_id = 'grant'
 WHERE type = 'admin_credit'
   AND reference_type IS NULL;

-- Restore the normal append-only trigger after the one-time reclassification.
CREATE OR REPLACE FUNCTION public.enforce_wallet_ledger_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'wallet_ledger_is_append_only';
  END IF;
  IF current_setting('app.wallet_posting', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'wallet_ledger_must_use_post_wallet_transaction';
  END IF;
  IF NEW.balance_after IS NULL OR NEW.balance_after < 0 THEN
    RAISE EXCEPTION 'invalid_wallet_balance_after';
  END IF;
  IF NEW.type = 'opening_balance' THEN
    IF NEW.amount <> 0 OR NEW.reference_type <> 'financial_ledger_baseline' THEN
      RAISE EXCEPTION 'invalid_opening_balance_entry';
    END IF;
  ELSIF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'wallet_transaction_amount_must_be_positive';
    END IF;
  RETURN NEW;
END;
$$;

-- ─── Canonical funding-source totals ─────────────────────────────────────────
-- Single source of truth for the balance sheet: what customers really paid
-- versus what an admin handed out for free.
CREATE OR REPLACE FUNCTION public.wallet_funding_summary()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalTopups', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed'),
    'topupsToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'topupCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'topup' AND status = 'completed'),
    'manualFunding', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_credit' AND status = 'completed'),
    'manualFundingToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_credit' AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'manualFundingCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'admin_credit' AND status = 'completed'),
    'freeFunds', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_grant' AND status = 'completed'),
    'freeFundsToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'admin_grant' AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'freeFundsCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'admin_grant' AND status = 'completed'),
    'cashCollected', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type IN ('topup','admin_credit') AND status = 'completed'),
    'cashCollectedToday', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type IN ('topup','admin_credit') AND status = 'completed' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'walletLiability', (SELECT coalesce(sum(wallet_balance),0) FROM profiles WHERE role = 'user')
  );
$$;

-- Orders, support and profit metrics stay here; funding totals come from the
-- dedicated summary so both admin surfaces always agree.
CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'totalUsers', (SELECT count(*) FROM profiles),
    'totalOrders', (SELECT count(*) FROM orders),
    'ordersToday', (SELECT count(*) FROM orders WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date),
    'activeOrders', (SELECT count(*) FROM orders WHERE status = 'waiting'),
    'otpDelivered', (SELECT count(*) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'otpNotReceived', (SELECT count(*) FROM orders WHERE sms_code IS NULL AND status IN ('cancelled','expired','refunded')),
    'refundAmount', (SELECT coalesce(sum(amount),0) FROM wallet_transactions WHERE type = 'refund' AND status = 'completed'),
    'refundCount', (SELECT count(*) FROM wallet_transactions WHERE type = 'refund' AND status = 'completed'),
    'refundsPending', (SELECT count(*) FROM orders WHERE refund_status IN ('pending','processing','failed')),
    'grossOtpSales', (SELECT coalesce(sum(sell_price_inr),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'providerCostInr', (SELECT coalesce(sum(cost_price_inr),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed')),
    'grossProfit', (SELECT coalesce(sum(sell_price_inr - coalesce(cost_price_inr,0)),0) FROM orders WHERE sms_code IS NOT NULL OR status IN ('code_received','completed'))
  ) || public.wallet_funding_summary();
$$;

REVOKE ALL ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_funding_summary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_dashboard_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_transaction(UUID,DECIMAL,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_funding_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics() TO service_role;
