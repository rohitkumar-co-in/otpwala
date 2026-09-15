ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS public_reply TEXT CHECK (public_reply IS NULL OR length(public_reply) <= 4000);
