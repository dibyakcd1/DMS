
-- Migration: Add is_void to invoices and cancel_reason to orders
BEGIN;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Update types/views if necessary
-- v_invoices might need it
-- (Assuming standard views don't need explicit recreation for new columns unless listed)

COMMIT;
