-- CONSOLIDATED SCHEMA FIX: Enums, Inventory Table and Unique Constraints
-- This migration ensures that all parts of the system use the same names for enums and columns.

DO $body$ 
BEGIN
  -- 1. Standardize shop_type Enum
  -- We want: premium, gold, silver, bronze, basic
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shop_type') THEN
    BEGIN ALTER TYPE public.shop_type ADD VALUE 'premium'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.shop_type ADD VALUE 'gold'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.shop_type ADD VALUE 'silver'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.shop_type ADD VALUE 'bronze'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.shop_type ADD VALUE 'basic'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ELSE
    CREATE TYPE public.shop_type AS ENUM ('premium', 'gold', 'silver', 'bronze', 'basic');
  END IF;

  -- 2. Standardize pack_type Enum
  -- We want: unit, packet, case, kg, and others
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type') THEN
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'unit'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'packet'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'case'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'kg'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ELSE
    CREATE TYPE public.pack_type AS ENUM ('unit', 'packet', 'case', 'kg');
  END IF;

  -- 3. Standardize Inventory Table
  -- Some migrations used 'stock_base_units', some used 'quantity'. 
  -- We'll standardize on 'quantity' and ensure 'stock_base_units' is a valid alias if needed.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'quantity') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'stock_base_units') THEN
      ALTER TABLE public.inventory RENAME COLUMN stock_base_units TO quantity;
    ELSE
      ALTER TABLE public.inventory ADD COLUMN quantity NUMERIC(15,2) DEFAULT 0 NOT NULL;
    END IF;
  END IF;

  -- 4. Ensure product_price_tiers has a proper unique constraint for upsert
  -- PostgREST upsert works best with a named constraint or a unique index that it can find.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_price_tiers_unique_key') THEN
    ALTER TABLE public.product_price_tiers ADD CONSTRAINT product_price_tiers_unique_key UNIQUE (product_id, shop_type, pack_type);
  END IF;

END $body$;

-- 5. Fix recompute_inventory RPC to be robust
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id uuid)
RETURNS void AS $body$
BEGIN
  INSERT INTO public.inventory (product_id, quantity, updated_at)
  SELECT 
    _product_id,
    COALESCE(SUM(remaining_qty), 0),
    now()
  FROM public.inventory_batches
  WHERE product_id = _product_id
  ON CONFLICT (product_id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    updated_at = now();
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Refresh the v_product_stock view to ensure it matches the standardized columns
DROP VIEW IF EXISTS public.v_product_stock;
CREATE OR REPLACE VIEW public.v_product_stock AS
SELECT 
  p.*,
  COALESCE(i.quantity, 0) as stock_base_units,
  COALESCE(i.quantity, 0) as stock_pcs,
  CASE 
    WHEN p.units_per_packet > 0 THEN floor(COALESCE(i.quantity, 0) / p.units_per_packet)
    ELSE 0 
  END as stock_packets,
  CASE 
    WHEN p.units_per_case > 0 THEN floor(COALESCE(i.quantity, 0) / p.units_per_case)
    ELSE 0 
  END as stock_cases,
  CASE 
    WHEN LOWER(p.pack_size_unit) = 'g' OR LOWER(p.pack_size_unit) = 'gms' THEN (COALESCE(i.quantity, 0) * COALESCE(p.pack_size_value, 0)) / 1000.0
    WHEN LOWER(p.pack_size_unit) = 'kg' THEN (COALESCE(i.quantity, 0) * COALESCE(p.pack_size_value, 0))
    ELSE 0 
  END as stock_kg,
  COALESCE(i.quantity, 0) <= p.min_stock as is_low_stock,
  i.updated_at as last_stock_update
FROM public.products p
LEFT JOIN public.inventory i ON p.id = i.product_id;
