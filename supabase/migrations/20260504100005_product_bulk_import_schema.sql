
-- Ensure enums exist with correct values
DO $body$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type') THEN
    CREATE TYPE public.pack_type AS ENUM ('packet', 'pouch', 'sachet', 'jar', 'bottle', 'bag', 'acb');
  ELSE
    -- Add missing values if they don't exist
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'packet'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'pouch'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'sachet'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'jar'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'bottle'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'bag'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'acb'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $body$;

DO $body$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sell_unit') THEN
    CREATE TYPE public.sell_unit AS ENUM ('pkt', 'pcs', 'case', 'kg', 'g', 'ml', 'l', 'unit');
  ELSE
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'pkt'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'pcs'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'case'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'kg'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'g'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'ml'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'l'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'unit'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $body$;

-- Update Products Table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS brand text DEFAULT 'BharatMasala',
  ADD COLUMN IF NOT EXISTS division text,
  ADD COLUMN IF NOT EXISTS division_category text NOT NULL DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS sub_category text,
  ADD COLUMN IF NOT EXISTS hsn text,
  ADD COLUMN IF NOT EXISTS item_pack_type public.pack_type,
  ADD COLUMN IF NOT EXISTS pack_size_value numeric,
  ADD COLUMN IF NOT EXISTS pack_size_unit text,
  ADD COLUMN IF NOT EXISTS base_unit text,
  ADD COLUMN IF NOT EXISTS units_per_packet integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS packets_per_case integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS units_per_case integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS case_qty_value numeric,
  ADD COLUMN IF NOT EXISTS case_qty_unit text,
  ADD COLUMN IF NOT EXISTS mrp numeric,
  ADD COLUMN IF NOT EXISTS gst_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preferred_sell_unit public.sell_unit DEFAULT 'pkt',
  ADD COLUMN IF NOT EXISTS is_mrp_priced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_chain_item boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS chain_mrp_label text,
  ADD COLUMN IF NOT EXISTS target_margin_basic numeric,
  ADD COLUMN IF NOT EXISTS target_margin_premium numeric,
  ADD COLUMN IF NOT EXISTS target_margin_gold numeric,
  ADD COLUMN IF NOT EXISTS target_margin_silver numeric,
  ADD COLUMN IF NOT EXISTS target_margin_bronze numeric,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_stock integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS batch_number text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Ensure unique constraint on SKU
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_sku_key') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_sku_key UNIQUE (sku);
  END IF;
END $body$;

-- Update Inventory Table
-- Assuming inventory table already exists from previous migrations, otherwise create it
CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  stock_base_units integer DEFAULT 0,
  warehouse_id uuid, -- could link to a warehouses table if exists
  location_code text,
  reorder_level integer DEFAULT 0,
  reorder_qty integer DEFAULT 0,
  last_updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_product_warehouse_key UNIQUE (product_id, warehouse_id)
);

-- If inventory was created before, ensure it has the right columns
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS stock_base_units integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS location_code text,
  ADD COLUMN IF NOT EXISTS reorder_level integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_qty integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_updated_at timestamp with time zone DEFAULT now();

-- Ensure unique constraint on inventory
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_product_warehouse_key') THEN
    ALTER TABLE public.inventory ADD CONSTRAINT inventory_product_warehouse_key UNIQUE (product_id, warehouse_id);
  END IF;
END $body$;

-- Stock Ledger Table
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reference_type text NOT NULL, -- 'sale' | 'purchase' | 'adjustment' | 'return' | 'import'
  reference_id uuid,
  sell_unit_used public.sell_unit,
  qty_transacted numeric NOT NULL,
  base_units_delta integer NOT NULL,
  stock_before integer NOT NULL,
  stock_after integer NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now()
);

-- RLS for stock_ledger
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for authenticated users" ON public.stock_ledger FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.stock_ledger FOR INSERT TO authenticated WITH CHECK (true);

-- View v_product_stock
DROP VIEW IF EXISTS public.v_product_stock;
CREATE OR REPLACE VIEW public.v_product_stock AS
SELECT 
  p.*,
  COALESCE(i.stock_base_units, 0) as stock_base_units,
  COALESCE(i.stock_base_units, 0) as stock_pcs,
  CASE 
    WHEN p.units_per_packet > 0 THEN FLOOR(COALESCE(i.stock_base_units, 0)::numeric / p.units_per_packet)
    ELSE 0 
  END as stock_packets,
  CASE 
    WHEN p.units_per_case > 0 THEN FLOOR(COALESCE(i.stock_base_units, 0)::numeric / p.units_per_case)
    ELSE 0 
  END as stock_cases,
  CASE 
    WHEN p.pack_size_unit = 'g' THEN ROUND((COALESCE(i.stock_base_units, 0) * COALESCE(p.pack_size_value, 0) / 1000)::numeric, 2)
    WHEN p.pack_size_unit = 'kg' THEN ROUND((COALESCE(i.stock_base_units, 0) * COALESCE(p.pack_size_value, 0))::numeric, 2)
    ELSE 0
  END as stock_kg,
  (COALESCE(i.stock_base_units, 0) <= p.min_stock) as is_low_stock
FROM 
  public.products p
LEFT JOIN (
  SELECT product_id, SUM(stock_base_units) as stock_base_units
  FROM public.inventory
  GROUP BY product_id
) i ON p.id = i.product_id;

-- Ensure updated_at trigger exists for products if not already there
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $body$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_products_updated_at') THEN
    CREATE TRIGGER set_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END $body$;
