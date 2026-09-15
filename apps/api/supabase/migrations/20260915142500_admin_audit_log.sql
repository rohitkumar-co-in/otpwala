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
