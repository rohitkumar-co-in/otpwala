-- Persist the provider balance alert threshold used by reconciliation.
-- The application throttles notifications to two IST windows per day.

INSERT INTO public.settings (key, value)
VALUES ('provider_low_balance_threshold_usd', '"5"'::jsonb)
ON CONFLICT (key) DO NOTHING;
