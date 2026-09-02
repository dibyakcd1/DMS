-- Migration: Force add is_void column to orders
-- This migration ensures the column exists to prevent "column orders.is_void does not exist" errors.

DO $body$
BEGIN
    -- Check if column exists in orders
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'orders' 
        AND column_name = 'is_void'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN is_void BOOLEAN DEFAULT FALSE;
    END IF;

    -- Check if column exists in invoices (as a precaution)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'invoices' 
        AND column_name = 'is_void'
    ) THEN
        ALTER TABLE public.invoices ADD COLUMN is_void BOOLEAN DEFAULT FALSE;
    END IF;
END $body$;
