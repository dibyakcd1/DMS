
-- Step 2: Migrate data to new enum types and fix consistency
-- 2026-05-02 - Part 2

-- 1. Prerequisites: Drop dependent view
DROP VIEW IF EXISTS public.margin_report_view;

-- 2. Helper Functions to map legacy shop types to new categories
CREATE OR REPLACE FUNCTION public.map_legacy_shop_type(old_type text) 
RETURNS public.shop_type_new AS $body$
BEGIN
    RETURN CASE 
        WHEN old_type IN ('distributor', 'chain', 'premium', 'dist') THEN 'premium'::public.shop_type_new
        WHEN old_type IN ('wholesaler', 'gold', 'wholesale') THEN 'gold'::public.shop_type_new
        WHEN old_type IN ('retailer', 'silver', 'retail') THEN 'silver'::public.shop_type_new
        WHEN old_type IN ('semi-wholesaler', 'bronze', 'semi_wholesaler') THEN 'bronze'::public.shop_type_new
        ELSE 'basic'::public.shop_type_new
    END;
END;
$body$ LANGUAGE plpgsql;

-- 2. Helper Function to map legacy pack types to new categories
CREATE OR REPLACE FUNCTION public.map_legacy_pack_type(old_type text) 
RETURNS public.pack_type_new AS $body$
BEGIN
    RETURN CASE 
        WHEN old_type IN ('bag', 'carton', 'case', 'box') THEN 'case'::public.pack_type_new
        WHEN old_type IN ('pouch', 'packet', 'pkg') THEN 'packet'::public.pack_type_new
        ELSE 'unit'::public.pack_type_new
    END;
END;
$body$ LANGUAGE plpgsql;

-- 3. Resolve potential duplicate key violations in product_price_tiers before casting
-- We keep the most recently updated record if multiple legacy types map to the same new type
DELETE FROM public.product_price_tiers t1
USING public.product_price_tiers t2
WHERE t1.id < t2.id 
  AND t1.product_id = t2.product_id
  AND COALESCE(t1.valid_from, '1900-01-01') = COALESCE(t2.valid_from, '1900-01-01')
  AND public.map_legacy_shop_type(t1.shop_type::text) = public.map_legacy_shop_type(t2.shop_type::text)
  AND public.map_legacy_pack_type(t1.pack_type::text) = public.map_legacy_pack_type(t2.pack_type::text);

-- 4. Alter columns to use new types with default value handling

-- Update Shops: Drop default, change type, set new default
ALTER TABLE public.shops ALTER COLUMN shop_type DROP DEFAULT;
ALTER TABLE public.shops 
  ALTER COLUMN shop_type TYPE public.shop_type_new 
  USING public.map_legacy_shop_type(shop_type::text);
ALTER TABLE public.shops ALTER COLUMN shop_type SET DEFAULT 'silver'::public.shop_type_new;

-- Update Price Tiers: Drop defaults, change types, set new defaults
ALTER TABLE public.product_price_tiers ALTER COLUMN shop_type DROP DEFAULT;
ALTER TABLE public.product_price_tiers ALTER COLUMN pack_type DROP DEFAULT;
ALTER TABLE public.product_price_tiers 
  ALTER COLUMN shop_type TYPE public.shop_type_new 
  USING public.map_legacy_shop_type(shop_type::text),
  ALTER COLUMN pack_type TYPE public.pack_type_new 
  USING public.map_legacy_pack_type(pack_type::text);
ALTER TABLE public.product_price_tiers ALTER COLUMN shop_type SET DEFAULT 'basic'::public.shop_type_new;
ALTER TABLE public.product_price_tiers ALTER COLUMN pack_type SET DEFAULT 'unit'::public.pack_type_new;

-- Update Products if column exists
DO $body$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'item_pack_type') THEN
    ALTER TABLE public.products ALTER COLUMN item_pack_type DROP DEFAULT;
    ALTER TABLE public.products 
      ALTER COLUMN item_pack_type TYPE public.pack_type_new 
      USING public.map_legacy_pack_type(item_pack_type::text);
    ALTER TABLE public.products ALTER COLUMN item_pack_type SET DEFAULT 'packet'::public.pack_type_new;
  END IF;
END $body$;

-- 5. Cleanup the temporary types and replace the originals
-- Note: In Supabase/Managed PG, renaming types works best if we keep them distinct or drop and rename
-- To avoid breaking dependencies, we drop old and rename new if possible
DROP TYPE public.shop_type CASCADE;
DROP TYPE public.pack_type CASCADE;

ALTER TYPE public.shop_type_new RENAME TO shop_type;
ALTER TYPE public.pack_type_new RENAME TO pack_type;

-- 6. Restore the margin_report_view
CREATE OR REPLACE VIEW public.margin_report_view AS
WITH current_cost AS (
  SELECT 
    product_id, 
    AVG(landed_cost) as avg_landed_cost
  FROM public.inventory_batches
  WHERE remaining_qty > 0
  GROUP BY product_id
),
basic_unit_price AS (
  SELECT 
    product_id,
    MIN(price) as standard_selling_price -- Use MIN in case of multiple, but usually we want basic/unit
  FROM public.product_price_tiers
  WHERE shop_type = 'basic' AND pack_type = 'unit'
  GROUP BY product_id
)
SELECT 
  p.id as product_id,
  p.name as product_name,
  p.sku,
  COALESCE(bup.standard_selling_price, p.mrp) as standard_selling_price,
  COALESCE(cc.avg_landed_cost, 0) as avg_landed_cost,
  CASE 
    WHEN COALESCE(bup.standard_selling_price, p.mrp) > 0 THEN 
      ((COALESCE(bup.standard_selling_price, p.mrp) - COALESCE(cc.avg_landed_cost, 0)) / COALESCE(bup.standard_selling_price, p.mrp)) * 100 
    ELSE 0 
  END as margin_percent
FROM public.products p
LEFT JOIN current_cost cc ON p.id = cc.product_id
LEFT JOIN basic_unit_price bup ON p.id = bup.product_id
WHERE p.is_active = true;

-- 7. Cleanup helper functions
DROP FUNCTION IF EXISTS public.map_legacy_shop_type(text);
DROP FUNCTION IF EXISTS public.map_legacy_pack_type(text);
