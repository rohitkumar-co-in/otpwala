-- Keep the accepted quote separate from the provider purchase receipt.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS quoted_provider_cost_usd NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS price_quoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_cost_source TEXT;
