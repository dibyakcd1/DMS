
-- Step 1: Migration to modernize enums and cleanup legacy tables
-- 2026-05-02 - Part 1

-- 1. Create New Enum Types (to replace the restricted ones)
DO $body$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shop_type_new') THEN
        CREATE TYPE public.shop_type_new AS ENUM ('premium', 'gold', 'silver', 'bronze', 'basic');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type_new') THEN
        CREATE TYPE public.pack_type_new AS ENUM ('unit', 'packet', 'case');
    END IF;
END $body$;

-- 2. Drop legacy tables confirmed as redundant/unused
DROP TABLE IF EXISTS public.purchase_order_items CASCADE;
DROP TABLE IF EXISTS public.purchase_orders CASCADE;
DROP TABLE IF EXISTS public.import_mapping_templates CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;

-- 3. Cleanup invalid data in price tiers before we cast
DELETE FROM public.product_price_tiers WHERE price IS NULL OR price <= 0;
