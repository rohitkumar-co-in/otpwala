-- Structured support routing and optional evidence image.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'general_help',
  ADD COLUMN IF NOT EXISTS attachment JSONB;

ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_ticket_type_check;
ALTER TABLE public.support_tickets ADD CONSTRAINT support_tickets_ticket_type_check
  CHECK (ticket_type IN ('general_help','payment_issue','order_issue','bug_report','account_security'));

CREATE INDEX IF NOT EXISTS support_tickets_type_idx ON public.support_tickets(ticket_type, created_at DESC);
