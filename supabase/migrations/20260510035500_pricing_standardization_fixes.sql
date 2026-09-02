-- Migration: Pricing Standardization & Fixes
BEGIN;

-- 1. Standardize pack_type enum
-- Add 'pcs' to the pack_type enum
DO $body$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'pack_type' AND e.enumlabel = 'pcs') THEN
            ALTER TYPE public.pack_type ADD VALUE 'pcs';
        END IF;
    END IF;
END $body$;

-- 2. Update existing rows from 'unit' to 'pcs' across the database
UPDATE public.products SET unit = 'pcs' WHERE unit = 'unit';
UPDATE public.products SET item_pack_type = 'pcs' WHERE item_pack_type = 'unit';
UPDATE public.product_price_tiers SET pack_type = 'pcs' WHERE pack_type = 'unit';
UPDATE public.order_items SET pack_type = 'pcs' WHERE pack_type = 'unit';
UPDATE public.purchase_invoice_items SET pack_type = 'pcs' WHERE pack_type = 'unit';

-- 3. Add Foreign Key for product_price_history to public.profiles
-- This ensures that frontend joins on profiles work correctly
ALTER TABLE public.product_price_history 
DROP CONSTRAINT IF EXISTS product_price_history_changed_by_fkey,
ADD CONSTRAINT product_price_history_changed_by_fkey 
FOREIGN KEY (changed_by) REFERENCES public.profiles(id);

-- 4. RPC for global margin sync (Fixes BUG 7.2)
-- Using a dedicated RPC avoids hacky client-side filters like .neq("id", "00000000-...")
CREATE OR REPLACE FUNCTION public.sync_product_margins(
    p_premium numeric,
    p_gold numeric,
    p_silver numeric,
    p_bronze numeric,
    p_basic numeric
)
RETURNS void AS $body$
BEGIN
    UPDATE public.products
    SET 
        target_margin_premium = p_premium,
        target_margin_gold = p_gold,
        target_margin_silver = p_silver,
        target_margin_bronze = p_bronze,
        target_margin_basic = p_basic
    WHERE is_active = true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
