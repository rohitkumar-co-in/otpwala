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

-- Add price_inr column to existing orders table (safe on re-run)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS price_inr DECIMAL(12,4);
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
