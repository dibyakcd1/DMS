-- Migration: Global Schema Healing for Products and Views
-- Purpose: Ensure all columns requested by the UI exist in the products table and views are correctly synchronized.

BEGIN;

-- 1. HEAL PRODUCTS TABLE COLUMNS
DO $$ 
BEGIN
    -- Core Business Logic Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'units_per_packet') THEN
        ALTER TABLE public.products ADD COLUMN units_per_packet INTEGER DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'packets_per_case') THEN
        ALTER TABLE public.products ADD COLUMN packets_per_case INTEGER DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'units_per_case') THEN
        -- Safely try to add as regular column first, if it fails as generated it might already be there
        BEGIN
            ALTER TABLE public.products ADD COLUMN units_per_case INTEGER DEFAULT 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'units_per_case already exists or is generated';
        END;
    END IF;

    -- Unit System Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'unit_type') THEN
        ALTER TABLE public.products ADD COLUMN unit_type TEXT DEFAULT 'pcs';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'preferred_sell_unit') THEN
        ALTER TABLE public.products ADD COLUMN preferred_sell_unit TEXT DEFAULT 'packet';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'base_weight_unit') THEN
        ALTER TABLE public.products ADD COLUMN base_weight_unit TEXT DEFAULT 'g';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'weight_per_unit_grams') THEN
        ALTER TABLE public.products ADD COLUMN weight_per_unit_grams NUMERIC(12,4);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'display_weight_unit') THEN
        ALTER TABLE public.products ADD COLUMN display_weight_unit TEXT DEFAULT 'g';
    END IF;

    -- Naming and Categorization
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'brand') THEN
        ALTER TABLE public.products ADD COLUMN brand TEXT DEFAULT 'Bharat Masala';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'division') THEN
        ALTER TABLE public.products ADD COLUMN division TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sub_category') THEN
        ALTER TABLE public.products ADD COLUMN sub_category TEXT;
    END IF;

    -- Packaging Details
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'item_pack_type') THEN
        ALTER TABLE public.products ADD COLUMN item_pack_type TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'case_type') THEN
        ALTER TABLE public.products ADD COLUMN case_type TEXT DEFAULT 'carton';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'case_qty_value') THEN
        ALTER TABLE public.products ADD COLUMN case_qty_value NUMERIC;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'case_qty_unit') THEN
        ALTER TABLE public.products ADD COLUMN case_qty_unit TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'base_unit') THEN
        ALTER TABLE public.products ADD COLUMN base_unit TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'unit') THEN
        ALTER TABLE public.products ADD COLUMN unit TEXT;
    END IF;

    -- Pricing Logic Flags
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_chain_item') THEN
        ALTER TABLE public.products ADD COLUMN is_chain_item BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_mrp_priced') THEN
        ALTER TABLE public.products ADD COLUMN is_mrp_priced BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'chain_mrp_label') THEN
        ALTER TABLE public.products ADD COLUMN chain_mrp_label TEXT;
    END IF;

    -- Target Margins
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_basic') THEN
        ALTER TABLE public.products ADD COLUMN target_margin_basic NUMERIC DEFAULT 15;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_bronze') THEN
        ALTER TABLE public.products ADD COLUMN target_margin_bronze NUMERIC DEFAULT 10;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_silver') THEN
        ALTER TABLE public.products ADD COLUMN target_margin_silver NUMERIC DEFAULT 7;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_gold') THEN
        ALTER TABLE public.products ADD COLUMN target_margin_gold NUMERIC DEFAULT 5;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_premium') THEN
        ALTER TABLE public.products ADD COLUMN target_margin_premium NUMERIC DEFAULT 3;
    END IF;

    -- Others
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'batch_number') THEN
        ALTER TABLE public.products ADD COLUMN batch_number TEXT;
    END IF;

END $$;

-- 2. RECREATE VIEWS TO ENSURE THEY PICK UP ALL COLUMNS
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
DROP VIEW IF EXISTS public.realized_margin_view CASCADE;

-- Base Product Stock View (Total across warehouses)
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

-- Warehouse Specific Product Stock View
CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
SELECT 
    (i.product_id || '-' || i.warehouse_id)::text as inventory_id,
    i.warehouse_id,
    i.stock_base_units,
    COALESCE(NULLIF(i.avg_landed_cost, 0), 0.01) as avg_landed_cost,
    (COALESCE(i.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock,
    p.*
FROM public.inventory i
JOIN public.products p ON i.product_id = p.id;

-- Realized Margin View (Revenue/Cost analysis)
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
      (COALESCE(ps.avg_landed_cost, 0.01) * (
         CASE 
           WHEN oi.pack_type = 'packet' THEN COALESCE(p.units_per_packet, 1)
           WHEN oi.pack_type = 'case' THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
           ELSE 1
         END
       ) * oi.quantity)
    ) as cost_exclusive,
    ((oi.unit_price * oi.quantity) - COALESCE(
      (SELECT SUM(obd.qty_base_units * ib.landed_cost) 
       FROM public.order_batch_deductions obd
       JOIN public.inventory_batches ib ON obd.batch_id = ib.id
       WHERE obd.order_item_id = oi.id),
      (COALESCE(ps.avg_landed_cost, 0.01) * (
         CASE 
           WHEN oi.pack_type = 'packet' THEN COALESCE(p.units_per_packet, 1)
           WHEN oi.pack_type = 'case' THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
           ELSE 1
         END
       ) * oi.quantity)
    )) as realized_profit_total
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
JOIN public.products p ON oi.product_id = p.id
LEFT JOIN public.v_product_stock ps ON p.id = ps.id
WHERE o.status = 'delivered' AND o.is_void = false;

-- Grant permissions again
GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;
GRANT SELECT ON public.realized_margin_view TO authenticated;

COMMIT;
