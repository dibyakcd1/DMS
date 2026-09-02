-- Add backdating capability to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT CURRENT_DATE;

-- Ensure inventory_batches received_at can be easily updated (it already is TIMESTAMPTZ)
-- No changes needed for inventory_batches schema for basic backdating logic.
