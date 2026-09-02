-- Migration: Add is_void to orders table
-- This fixes the error: column orders.is_void does not exist

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT FALSE;

-- Ensure invoices also has it (redundant check)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT FALSE;
