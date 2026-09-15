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
