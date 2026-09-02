
-- Restore pack_type column to order_items which was dropped by CASCADE in 20260502120010
-- First ensure kg is in the enum (just in case)
DO $body$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type') THEN
        ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'kg';
    END IF;
END $body$;

-- Restore the column
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS pack_type public.pack_type NOT NULL DEFAULT 'unit';

-- Restore column to other potentially affected tables
ALTER TABLE public.product_price_tiers ADD COLUMN IF NOT EXISTS pack_type public.pack_type NOT NULL DEFAULT 'unit';

-- Add comments for clarity
COMMENT ON COLUMN public.order_items.pack_type IS 'The packaging type of the item being ordered (unit, packet, case, kg)';
