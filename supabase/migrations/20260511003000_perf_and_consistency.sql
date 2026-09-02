-- Add missing index for dispatched_at to improve dashboard performance
-- and fix item_pack_type inconsistency if any

BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_dispatched_at ON public.orders(dispatched_at);

-- Add missing unit types to products if not present
UPDATE public.products SET unit_type = 'pcs' WHERE unit_type IS NULL;

COMMIT;
