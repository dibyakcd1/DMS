-- FIX: Missing columns in orders table
-- This migration ensures that the orders table has the required timestamp columns for the dashboard.

DO $body$ 
BEGIN
  -- 1. Ensure delivered_at exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivered_at') THEN
    ALTER TABLE public.orders ADD COLUMN delivered_at TIMESTAMPTZ;
  END IF;

  -- 2. Ensure dispatched_at exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'dispatched_at') THEN
    ALTER TABLE public.orders ADD COLUMN dispatched_at TIMESTAMPTZ;
  END IF;

  -- 3. Ensure approved_at exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'approved_at') THEN
    ALTER TABLE public.orders ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;
  
  -- 4. Ensure delivery_note exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivery_note') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_note TEXT;
  END IF;

END $body$;
