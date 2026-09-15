-- Ensure orders created before expiry tracking was introduced are reconciled.
UPDATE public.orders
SET expires_at = created_at + INTERVAL '20 minutes'
WHERE status = 'waiting'
  AND expires_at IS NULL;

CREATE INDEX IF NOT EXISTS orders_waiting_expiry_idx
  ON public.orders (expires_at)
  WHERE status = 'waiting';
