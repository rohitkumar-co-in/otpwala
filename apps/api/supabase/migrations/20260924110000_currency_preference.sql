ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS currency_preference TEXT
  CHECK (currency_preference IS NULL OR currency_preference IN ('INR','USD'));
