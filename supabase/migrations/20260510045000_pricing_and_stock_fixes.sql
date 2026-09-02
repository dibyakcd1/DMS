-- Re-add target margin columns to products (BUG-3)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS target_margin_premium NUMERIC DEFAULT 3;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS target_margin_gold NUMERIC DEFAULT 5;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS target_margin_silver NUMERIC DEFAULT 7;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS target_margin_bronze NUMERIC DEFAULT 10;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS target_margin_basic NUMERIC DEFAULT 15;

-- Fix v_product_stock (Remove OR true debug artifact) (BUG-5)
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE VIEW public.v_product_stock AS
WITH batch_aggregates AS (
    SELECT 
        product_id,
        SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0) as current_avg,
        (ARRAY_AGG(landed_cost ORDER BY received_at DESC, created_at DESC))[1] as last_landed
    FROM public.inventory_batches
    WHERE remaining_qty > 0 
    GROUP BY product_id
)
SELECT 
    p.*,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
      ELSE 1 
    END as calc_units_per_case,
    (COALESCE(i.stock_base_units, 0) <= p.min_stock) as is_low_stock,
    COALESCE(ba.current_avg, ba.last_landed, 0) as avg_landed_cost
FROM 
    public.products p
LEFT JOIN 
    public.inventory i ON p.id = i.product_id
LEFT JOIN
    batch_aggregates ba ON p.id = ba.product_id;

-- Recreate dependant Warehouse-Specific Stock View
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
CREATE VIEW public.v_product_stock_warehouse AS
WITH batch_aggregates_wh AS (
    SELECT 
        product_id,
        warehouse_id,
        SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0) as current_avg,
        (ARRAY_AGG(landed_cost ORDER BY received_at DESC, created_at DESC))[1] as last_landed
    FROM public.inventory_batches
    WHERE remaining_qty > 0
    GROUP BY product_id, warehouse_id
)
SELECT 
    p.*,
    w.id as warehouse_id,
    w.name as warehouse_name,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
      ELSE 1 
    END as calc_units_per_case,
    (COALESCE(i.stock_base_units, 0) <= p.min_stock) as is_low_stock,
    COALESCE(ba.current_avg, ba.last_landed, (SELECT avg_landed_cost FROM public.v_product_stock WHERE id = p.id)) as avg_landed_cost
FROM 
    public.products p
CROSS JOIN 
    public.warehouses w
LEFT JOIN 
    public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id
LEFT JOIN
    batch_aggregates_wh ba ON p.id = ba.product_id AND w.id = ba.warehouse_id;

-- Fix margin_report_view (pack_type = 'pcs' instead of 'unit') (BUG-4)
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
    MIN(price) as standard_selling_price 
  FROM public.product_price_tiers
  WHERE shop_type = 'basic' AND pack_type = 'pcs'
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

GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;
GRANT SELECT ON public.margin_report_view TO authenticated;
