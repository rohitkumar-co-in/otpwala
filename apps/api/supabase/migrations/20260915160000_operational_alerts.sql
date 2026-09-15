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
