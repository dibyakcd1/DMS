-- Migration: Heal Data Views
-- Purpose: Restore missing columns to v_product_stock and ensure consistency across views.

BEGIN;

-- 1. Restore v_product_stock with all product columns
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock AS
WITH stock_summary AS (
  SELECT 
    product_id, 
    SUM(stock_base_units) as stock_base_units, 
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

-- 2. Ensure v_product_stock_warehouse also has common columns
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
SELECT 
    w.id as warehouse_id,
    w.name as warehouse_name,
    p.id as product_id,
    p.id as id,
    p.sku, 
    p.name,
    p.mrp,
    p.hsn,
    p.gst_rate,
    p.is_active,
    p.units_per_packet, 
    p.packets_per_case, 
    p.units_per_case,
    p.item_pack_type,
    p.division_category,
    p.pack_size_value,
    p.pack_size_unit,
    p.base_unit,
    p.unit_type,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    COALESCE(NULLIF(i.avg_landed_cost, 0), 0.01) as avg_landed_cost
FROM 
    public.warehouses w
CROSS JOIN 
    public.products p
LEFT JOIN 
    public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id;

-- 3. Verify hsn exists in v_inventory_batch_details (used in reports)
DROP VIEW IF EXISTS public.v_inventory_batch_details CASCADE;
CREATE OR REPLACE VIEW public.v_inventory_batch_details AS
SELECT 
    ib.*,
    -- Product Info
    p.name as product_name,
    p.sku as product_sku,
    p.mrp as product_mrp,
    p.hsn as product_hsn,
    p.min_stock as product_min_stock,
    p.units_per_packet as product_units_per_packet,
    p.packets_per_case as product_packets_per_case,
    p.item_pack_type as product_item_pack_type,
    p.division_category as product_division_category,
    p.pack_size_value as product_pack_size_value,
    p.pack_size_unit as product_pack_size_unit,
    -- Warehouse Info
    w.name as warehouse_name,
    w.code as warehouse_code
FROM 
    public.inventory_batches ib
LEFT JOIN 
    public.products p ON ib.product_id = p.id
LEFT JOIN 
    public.warehouses w ON ib.warehouse_id = w.id;

GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;
GRANT SELECT ON public.v_inventory_batch_details TO authenticated;

COMMIT;
