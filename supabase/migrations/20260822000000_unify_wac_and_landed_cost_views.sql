-- Migration: Unify WAC, Landed Cost and Margin Views (One Source of Truth)
--
-- ============================================================================
-- CANONICAL FORMULA FOR AVERAGE LANDED COST (WAC):
--   WAC = SUM(quantity * landed_cost) / NULLIF(SUM(quantity), 0)
--
-- All inventory valuations, stock views, margin reports, and batch deducer fallbacks
-- MUST use this quantity-weighted formula. Plain unweighted AVG() is prohibited.
-- ============================================================================

BEGIN;

-- 0. Ensure required tables and table columns exist safely
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID,
    warehouse_id UUID,
    stock_base_units NUMERIC DEFAULT 0,
    avg_landed_cost NUMERIC DEFAULT 0,
    last_updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID,
    warehouse_id UUID,
    batch_number TEXT,
    remaining_qty NUMERIC DEFAULT 0,
    received_qty NUMERIC DEFAULT 0,
    cost_price NUMERIC DEFAULT 0,
    landed_cost NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_price_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID,
    shop_type TEXT DEFAULT 'basic',
    pack_type TEXT DEFAULT 'pcs',
    price NUMERIC DEFAULT 0,
    is_auto_calculated BOOLEAN DEFAULT false,
    source_landed_cost NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_date TIMESTAMPTZ DEFAULT now(),
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID,
    product_id UUID,
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    pack_type TEXT DEFAULT 'packet',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_batch_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id UUID,
    batch_id UUID,
    qty_base_units NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure all columns on public.products exist
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS mrp NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS selling_price NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS cgst_rate NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS sgst_rate NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS igst_rate NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS hsn TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT 'Bharat Masala';
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS division_category TEXT DEFAULT 'SPECIAL PRODUCTS';
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS sub_category TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS units_per_packet INTEGER DEFAULT 1;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS packets_per_case INTEGER DEFAULT 1;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS units_per_case INTEGER DEFAULT 1;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS item_pack_type TEXT DEFAULT 'packet';
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS pack_size_value NUMERIC;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS pack_size_unit TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS base_unit TEXT;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'pieces';
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS preferred_sell_unit TEXT DEFAULT 'packet';
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE IF EXISTS public.products ADD COLUMN IF NOT EXISTS weight_per_unit_grams NUMERIC(12,4);

-- Ensure all columns on public.inventory exist
ALTER TABLE IF EXISTS public.inventory ADD COLUMN IF NOT EXISTS stock_base_units NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.inventory ADD COLUMN IF NOT EXISTS avg_landed_cost NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.inventory ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure all columns on public.inventory_batches exist
ALTER TABLE IF EXISTS public.inventory_batches ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE IF EXISTS public.inventory_batches ADD COLUMN IF NOT EXISTS warehouse_id UUID;
ALTER TABLE IF EXISTS public.inventory_batches ADD COLUMN IF NOT EXISTS batch_number TEXT;
ALTER TABLE IF EXISTS public.inventory_batches ADD COLUMN IF NOT EXISTS landed_cost NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.inventory_batches ADD COLUMN IF NOT EXISTS remaining_qty NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.inventory_batches ADD COLUMN IF NOT EXISTS received_qty NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.inventory_batches ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;

-- Ensure all columns on public.product_price_tiers exist
ALTER TABLE IF EXISTS public.product_price_tiers ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE IF EXISTS public.product_price_tiers ADD COLUMN IF NOT EXISTS shop_type TEXT DEFAULT 'basic';
ALTER TABLE IF EXISTS public.product_price_tiers ADD COLUMN IF NOT EXISTS pack_type TEXT DEFAULT 'pcs';
ALTER TABLE IF EXISTS public.product_price_tiers ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.product_price_tiers ADD COLUMN IF NOT EXISTS is_auto_calculated BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public.product_price_tiers ADD COLUMN IF NOT EXISTS source_landed_cost NUMERIC DEFAULT 0;

-- Ensure all columns on public.orders exist
ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ DEFAULT now();
ALTER TABLE IF EXISTS public.orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Ensure all columns on public.order_items exist
ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS order_id UUID;
ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.order_items ADD COLUMN IF NOT EXISTS pack_type TEXT DEFAULT 'packet';

-- Ensure all columns on public.order_batch_deductions exist
ALTER TABLE IF EXISTS public.order_batch_deductions ADD COLUMN IF NOT EXISTS order_item_id UUID;
ALTER TABLE IF EXISTS public.order_batch_deductions ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE IF EXISTS public.order_batch_deductions ADD COLUMN IF NOT EXISTS qty_base_units NUMERIC DEFAULT 0;

-- Ensure unique constraint on inventory (product_id, warehouse_id) for recompute_inventory UPSERT
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.inventory'::regclass 
          AND contype = 'u' 
          AND array_to_string(conkey, ',') = (
              SELECT array_to_string(array_agg(attnum), ',') 
              FROM pg_attribute 
              WHERE attrelid = 'public.inventory'::regclass 
                AND attname IN ('product_id', 'warehouse_id')
          )
    ) THEN
        ALTER TABLE public.inventory ADD CONSTRAINT inventory_product_warehouse_unique UNIQUE (product_id, warehouse_id);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 1. Recreate v_product_stock with canonical quantity-weighted WAC
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock AS
WITH batch_summary AS (
  SELECT 
    product_id,
    COALESCE(SUM(remaining_qty), 0) as stock_base_units,
    COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0) as batch_wac
  FROM public.inventory_batches
  GROUP BY product_id
),
inventory_summary AS (
  SELECT 
    product_id, 
    COALESCE(SUM(stock_base_units), 0) as inv_stock_base_units, 
    COALESCE(SUM(stock_base_units * avg_landed_cost) / NULLIF(SUM(stock_base_units), 0), 0) as inv_wac
  FROM public.inventory
  GROUP BY product_id
)
SELECT 
    p.*,
    COALESCE(bs.stock_base_units, inv.inv_stock_base_units, 0) as stock_base_units,
    COALESCE(NULLIF(bs.batch_wac, 0), NULLIF(inv.inv_wac, 0), p.cost_price, 0.01) as avg_landed_cost,
    (COALESCE(bs.stock_base_units, inv.inv_stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock
FROM public.products p
LEFT JOIN batch_summary bs ON p.id = bs.product_id
LEFT JOIN inventory_summary inv ON p.id = inv.product_id;

-- 2. Recreate v_product_stock_warehouse with canonical quantity-weighted WAC
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
WITH batch_wh AS (
  SELECT 
    product_id,
    warehouse_id,
    COALESCE(SUM(remaining_qty), 0) as stock_base_units,
    COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0) as batch_wac
  FROM public.inventory_batches
  GROUP BY product_id, warehouse_id
)
SELECT 
    w.id as warehouse_id,
    w.name as warehouse_name,
    p.id as product_id,
    p.id as id,
    p.sku, 
    p.name,
    p.mrp,
    p.selling_price,
    COALESCE(p.gst_rate, 0) as gst_rate,
    COALESCE(p.cgst_rate, 0) as cgst_rate,
    COALESCE(p.sgst_rate, 0) as sgst_rate,
    COALESCE(p.igst_rate, 0) as igst_rate,
    p.hsn,
    p.is_active,
    p.brand,
    p.division,
    p.division_category,
    p.sub_category,
    p.units_per_packet, 
    p.packets_per_case, 
    p.units_per_case,
    p.item_pack_type,
    p.pack_size_value,
    p.pack_size_unit,
    p.base_unit,
    p.unit_type,
    p.min_stock,
    (COALESCE(b.stock_base_units, i.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock,
    COALESCE(b.stock_base_units, i.stock_base_units, 0) as stock_base_units,
    COALESCE(NULLIF(b.batch_wac, 0), NULLIF(i.avg_landed_cost, 0), p.cost_price, 0.01) as avg_landed_cost
FROM 
    public.warehouses w
CROSS JOIN 
    public.products p
LEFT JOIN 
    batch_wh b ON p.id = b.product_id AND w.id = b.warehouse_id
LEFT JOIN 
    public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id;

-- 3. Recreate margin_report_view with quantity-weighted WAC
DROP VIEW IF EXISTS public.margin_report_view CASCADE;
CREATE OR REPLACE VIEW public.margin_report_view AS
WITH batch_wac AS (
  SELECT 
    product_id, 
    COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0) as avg_landed_cost
  FROM public.inventory_batches 
  WHERE remaining_qty > 0
  GROUP BY product_id
),
basic_unit_price AS (
  SELECT product_id, MIN(price) as standard_selling_price
  FROM public.product_price_tiers
  WHERE shop_type::text = 'basic' AND pack_type::text IN ('pcs', 'unit')
  GROUP BY product_id
)
SELECT
  p.id as product_id, 
  p.name as product_name, 
  p.sku,
  COALESCE(bup.standard_selling_price, p.mrp, 0.01) as standard_selling_price,
  COALESCE(NULLIF(bw.avg_landed_cost, 0), p.cost_price, 0) as avg_landed_cost,
  CASE WHEN COALESCE(bup.standard_selling_price, p.mrp, 0) > 0 THEN
    ((COALESCE(bup.standard_selling_price, p.mrp) - COALESCE(NULLIF(bw.avg_landed_cost, 0), p.cost_price, 0))
      / COALESCE(bup.standard_selling_price, p.mrp)) * 100
  ELSE 0 END as margin_percent
FROM public.products p
LEFT JOIN batch_wac bw ON p.id = bw.product_id
LEFT JOIN basic_unit_price bup ON p.id = bup.product_id
WHERE p.is_active = true;

-- 4. Recreate realized_margin_view with canonical quantity-weighted WAC
DROP VIEW IF EXISTS public.realized_margin_view CASCADE;
CREATE OR REPLACE VIEW public.realized_margin_view AS
SELECT 
    oi.id as order_item_id,
    o.id as order_id,
    o.order_date as order_date,
    o.status as order_status,
    p.id as product_id,
    p.name as product_name,
    p.sku as product_sku,
    oi.quantity,
    oi.unit_price as unit_price_exclusive,
    (oi.unit_price * oi.quantity) as revenue_exclusive,
    COALESCE(
      (SELECT SUM(obd.qty_base_units * ib.landed_cost) 
       FROM public.order_batch_deductions obd
       JOIN public.inventory_batches ib ON obd.batch_id = ib.id
       WHERE obd.order_item_id = oi.id),
      (COALESCE(ps.avg_landed_cost, p.cost_price, 0.01) * (
         CASE 
           WHEN oi.pack_type::text = 'packet' THEN COALESCE(p.units_per_packet, 1)
           WHEN oi.pack_type::text = 'case' THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
           WHEN oi.pack_type::text = 'doz' THEN 12
           ELSE 1
         END
       ) * oi.quantity)
    ) as cost_exclusive,
    ((oi.unit_price * oi.quantity) - COALESCE(
      (SELECT SUM(obd.qty_base_units * ib.landed_cost) 
       FROM public.order_batch_deductions obd
       JOIN public.inventory_batches ib ON obd.batch_id = ib.id
       WHERE obd.order_item_id = oi.id),
      (COALESCE(ps.avg_landed_cost, p.cost_price, 0.01) * (
         CASE 
           WHEN oi.pack_type::text = 'packet' THEN COALESCE(p.units_per_packet, 1)
           WHEN oi.pack_type::text = 'case' THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
           WHEN oi.pack_type::text = 'doz' THEN 12
           ELSE 1
         END
       ) * oi.quantity)
    )) as realized_profit_total
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
JOIN public.products p ON oi.product_id = p.id
LEFT JOIN public.v_product_stock ps ON p.id = ps.id;

-- 5. Read-only Audit View: Identify historical products where cost_price diverged from batch WAC
CREATE OR REPLACE VIEW public.v_wac_discrepancy_audit AS
WITH batch_stats AS (
  SELECT 
    product_id,
    COUNT(id) as total_batches,
    COALESCE(SUM(remaining_qty), 0) as current_stock,
    COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0) as true_batch_wac,
    MAX(created_at) as latest_batch_date
  FROM public.inventory_batches
  WHERE remaining_qty > 0
  GROUP BY product_id
)
SELECT 
  p.id as product_id,
  p.name,
  p.sku,
  p.cost_price as master_cost_price,
  bs.true_batch_wac,
  bs.current_stock,
  bs.total_batches,
  ABS(COALESCE(p.cost_price, 0) - COALESCE(bs.true_batch_wac, 0)) as cost_variance_abs,
  CASE 
    WHEN COALESCE(bs.true_batch_wac, 0) > 0 THEN
      ROUND(((COALESCE(p.cost_price, 0) - bs.true_batch_wac) / bs.true_batch_wac * 100), 2)
    ELSE 0
  END as cost_variance_pct
FROM public.products p
JOIN batch_stats bs ON p.id = bs.product_id
WHERE ABS(COALESCE(p.cost_price, 0) - COALESCE(bs.true_batch_wac, 0)) > 0.05;

-- 6. Canonical recompute_inventory RPC
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id UUID, _warehouse_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
    IF _warehouse_id IS NOT NULL THEN
        INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, avg_landed_cost, last_updated_at)
        SELECT 
            product_id, 
            warehouse_id, 
            COALESCE(SUM(remaining_qty), 0), 
            COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0),
            now()
        FROM public.inventory_batches
        WHERE product_id = _product_id AND warehouse_id = _warehouse_id
        GROUP BY product_id, warehouse_id
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            stock_base_units = EXCLUDED.stock_base_units,
            avg_landed_cost = EXCLUDED.avg_landed_cost,
            last_updated_at = now();
    ELSE
        INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, avg_landed_cost, last_updated_at)
        SELECT 
            product_id, 
            warehouse_id, 
            COALESCE(SUM(remaining_qty), 0), 
            COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0),
            now()
        FROM public.inventory_batches
        WHERE product_id = _product_id
        GROUP BY product_id, warehouse_id
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            stock_base_units = EXCLUDED.stock_base_units,
            avg_landed_cost = EXCLUDED.avg_landed_cost,
            last_updated_at = now();
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recompute_inventory(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_inventory(UUID, UUID) TO service_role;

COMMIT;
