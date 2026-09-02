-- Migration: Add IGST, CGST, and SGST tax rate columns to products
-- Purpose: Allow granular capture and auto-calculation of IGST, CGST, and SGST alongside standard gst_rate (defaulting to 0 when not available in PO).

BEGIN;

-- 1. Ensure public.products table exists
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    mrp NUMERIC DEFAULT 0,
    selling_price NUMERIC DEFAULT 0,
    gst_rate NUMERIC DEFAULT 0,
    cgst_rate NUMERIC DEFAULT 0,
    sgst_rate NUMERIC DEFAULT 0,
    igst_rate NUMERIC DEFAULT 0,
    min_stock INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    brand TEXT DEFAULT 'Bharat Masala',
    division TEXT,
    division_category TEXT DEFAULT 'SPECIAL PRODUCTS',
    sub_category TEXT,
    item_pack_type TEXT DEFAULT 'packet',
    pack_size_value NUMERIC,
    pack_size_unit TEXT,
    base_unit TEXT,
    unit TEXT DEFAULT 'packet',
    units_per_packet INTEGER DEFAULT 1,
    packets_per_case INTEGER DEFAULT 1,
    units_per_case INTEGER DEFAULT 1,
    case_qty_value NUMERIC,
    case_qty_unit TEXT,
    unit_type TEXT DEFAULT 'pieces',
    preferred_sell_unit TEXT DEFAULT 'packet',
    weight_per_unit_grams NUMERIC(12,4),
    hsn TEXT,
    company_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Safely add missing columns using native PostgreSQL IF NOT EXISTS
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS igst_rate NUMERIC DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS division_category TEXT DEFAULT 'SPECIAL PRODUCTS';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id UUID;

-- 3. Ensure gst_rate and tax rates are default 0 for existing rows
UPDATE public.products
SET 
  gst_rate = COALESCE(gst_rate, 0),
  igst_rate = COALESCE(igst_rate, gst_rate, 0),
  cgst_rate = COALESCE(cgst_rate, gst_rate / 2.0, 0),
  sgst_rate = COALESCE(sgst_rate, gst_rate / 2.0, 0)
WHERE gst_rate IS NULL OR cgst_rate IS NULL OR sgst_rate IS NULL OR igst_rate IS NULL;

-- 4. Ensure inventory and warehouses tables exist so views do not fail
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE,
    stock_base_units NUMERIC DEFAULT 0,
    avg_landed_cost NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Recreate views to expose all new columns
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

CREATE OR REPLACE VIEW public.v_product_stock AS
WITH stock_summary AS (
  SELECT 
    product_id, 
    COALESCE(SUM(stock_base_units), 0) as stock_base_units, 
    AVG(NULLIF(avg_landed_cost, 0)) as avg_landed_cost
  FROM public.inventory
  GROUP BY product_id
)
SELECT 
    p.*,
    COALESCE(s.stock_base_units, 0) as stock_base_units,
    COALESCE(NULLIF(s.avg_landed_cost, 0), 0.01) as avg_landed_cost,
    (COALESCE(s.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock
FROM public.products p
LEFT JOIN stock_summary s ON p.id = s.product_id;

CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
SELECT 
    i.id as inventory_id,
    i.product_id,
    i.warehouse_id,
    i.stock_base_units,
    i.avg_landed_cost,
    p.name,
    p.sku,
    p.mrp,
    p.selling_price,
    COALESCE(p.gst_rate, 0) as gst_rate,
    COALESCE(p.cgst_rate, 0) as cgst_rate,
    COALESCE(p.sgst_rate, 0) as sgst_rate,
    COALESCE(p.igst_rate, 0) as igst_rate,
    p.min_stock,
    p.is_active,
    p.brand,
    p.division,
    p.division_category,
    p.sub_category,
    p.item_pack_type,
    p.pack_size_value,
    p.pack_size_unit,
    p.base_unit,
    p.unit,
    p.units_per_packet,
    p.packets_per_case,
    p.units_per_case,
    p.case_qty_value,
    p.case_qty_unit,
    p.unit_type,
    p.preferred_sell_unit,
    p.hsn,
    p.company_id,
    w.name as warehouse_name,
    w.code as warehouse_code
FROM public.inventory i
JOIN public.products p ON i.product_id = p.id
LEFT JOIN public.warehouses w ON i.warehouse_id = w.id;

-- 6. Enable RLS and Grant Permissions
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_read_products" ON public.products;
CREATE POLICY "allow_read_products" ON public.products FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_read_inventory" ON public.inventory;
CREATE POLICY "allow_read_inventory" ON public.inventory FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_read_warehouses" ON public.warehouses;
CREATE POLICY "allow_read_warehouses" ON public.warehouses FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;

COMMIT;
