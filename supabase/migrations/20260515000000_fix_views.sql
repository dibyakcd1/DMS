-- Migration: Heal Data Views
-- Purpose: Restore missing columns and fix naming issues in v_product_stock and v_product_stock_warehouse

BEGIN;

-- 1. Restore v_product_stock
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

-- 2. Restore v_product_stock_warehouse
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;

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

-- 3. Restore realized_margin_view
DROP VIEW IF EXISTS public.realized_margin_view CASCADE;

CREATE OR REPLACE VIEW public.realized_margin_view AS
SELECT 
    oi.id as order_item_id,
    o.id as order_id,
    o.created_at as order_date,
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
           WHEN oi.pack_type = 'case' THEN COALESCE(p.units_per_case, 1)
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
           WHEN oi.pack_type = 'case' THEN COALESCE(p.units_per_case, 1)
           ELSE 1
         END
       ) * oi.quantity)
    )) as realized_profit_total
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
JOIN public.products p ON oi.product_id = p.id
LEFT JOIN public.v_product_stock ps ON p.id = ps.id
WHERE o.status = 'delivered' AND o.is_void = false;

GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;
GRANT SELECT ON public.realized_margin_view TO authenticated;

COMMIT;
