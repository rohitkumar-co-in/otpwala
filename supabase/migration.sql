-- ╔══════════════════════════════════════════════════════════════╗
-- ║                 OTPWala — Supabase Migration                 ║
-- ║  Run this in Supabase SQL Editor to create all tables       ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─── 1. User Profiles ───
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    wallet_balance DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    total_spent DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    total_orders INTEGER NOT NULL DEFAULT 0,
    is_banned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Users can update their own non-sensitive fields
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ─── 2. Wallet Transactions ───
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('topup', 'deduction', 'refund', 'admin_credit')),
    amount DECIMAL(12,4) NOT NULL,
    balance_after DECIMAL(12,4) NOT NULL,
    description TEXT,
    payment_id TEXT,
    payment_method TEXT,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.wallet_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- ─── 3. Orders ───
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) NOT NULL,
    activation_id TEXT NOT NULL,
    service_code TEXT NOT NULL,
    service_name TEXT NOT NULL,
    country_code INTEGER NOT NULL,
    country_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    cost_price_usd DECIMAL(12,4) NOT NULL,
    sell_price_inr DECIMAL(12,4) NOT NULL,
    sms_code TEXT,
    sms_text TEXT,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (
        status IN ('waiting', 'code_received', 'completed', 'cancelled', 'refunded', 'expired')
    ),
    tiger_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders" ON public.orders
    FOR SELECT USING (auth.uid() = user_id);

-- Enable realtime for orders (OTP status push)
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- ─── 4. Pricing Rules ───
CREATE TABLE IF NOT EXISTS public.pricing_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_code TEXT,
    country_code INTEGER,
    markup_type TEXT NOT NULL CHECK (markup_type IN ('percentage', 'flat', 'fixed_price')),
    markup_value DECIMAL(12,4) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. Platform Settings ───
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.settings (key, value) VALUES
    ('usd_to_inr_rate', '"85.00"'),
    ('default_markup_percentage', '"30"'),
    ('min_deposit_inr', '"50"'),
    ('max_deposit_inr', '"50000"'),
    ('platform_name', '"OTPWala"'),
    ('maintenance_mode', '"false"')
ON CONFLICT (key) DO NOTHING;

-- ─── 6. Payment Requests ───
CREATE TABLE IF NOT EXISTS public.payment_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) NOT NULL,
    amount_inr DECIMAL(12,4) NOT NULL,
    gateway TEXT NOT NULL,
    gateway_order_id TEXT,
    gateway_payment_id TEXT,
    status TEXT NOT NULL DEFAULT 'created' CHECK (
        status IN ('created', 'paid', 'failed', 'expired')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment requests" ON public.payment_requests
    FOR SELECT USING (auth.uid() = user_id);

-- ─── 7. Auto-create profile on signup ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 8. Helper: Increment total_orders ───
CREATE OR REPLACE FUNCTION public.increment_total_orders(p_user_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.profiles
    SET total_orders = total_orders + 1,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 9. Indexes for performance ───
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON public.wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_requests_user_id ON public.payment_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_active ON public.pricing_rules(is_active) WHERE is_active = TRUE;

-- ─── 10. Grant permissions to Supabase roles ───
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ─── 11. Read policies for Settings and Pricing Rules ───
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read settings" ON public.settings;
CREATE POLICY "Public read settings" ON public.settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manage settings" ON public.settings;
CREATE POLICY "Service role manage settings" ON public.settings FOR ALL USING (true);

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read pricing" ON public.pricing_rules;
CREATE POLICY "Public read pricing" ON public.pricing_rules FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manage pricing" ON public.pricing_rules;
CREATE POLICY "Service role manage pricing" ON public.pricing_rules FOR ALL USING (true);
