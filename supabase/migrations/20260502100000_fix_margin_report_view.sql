-- Fix missing/broken margin_report_view after column drops
DROP VIEW IF EXISTS public.margin_report_view;

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
