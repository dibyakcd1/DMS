
-- MIGRATION: ADVANCED PACKING HEALER & VIEW OPTIMIZATION
-- This migration improves the v_product_stock view for performance and accuracy,
-- and patches common Bharat Masala packing inconsistencies.

BEGIN;

-- 1. Optimize v_product_stock
-- We use a more robust calculation for units_per_case and packets_per_case
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

CREATE OR REPLACE VIEW public.v_product_stock AS
WITH product_totals AS (
  SELECT 
    p.id as product_id,
    COALESCE(SUM(i.stock_base_units), 0) as stock_base_units,
    -- Deterministic Case Multiplier Logic
    COALESCE(
      NULLIF(p.units_per_case, 0), 
      NULLIF(p.units_per_packet, 0) * NULLIF(p.packets_per_case, 0),
      CASE 
        WHEN lower(p.case_qty_unit) = 'kg' AND lower(p.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') AND p.case_qty_value > 0 AND p.pack_size_value > 0 THEN 
          (p.case_qty_value * 1000.0) / p.pack_size_value
        WHEN lower(p.case_qty_unit) = lower(p.pack_size_unit) AND p.case_qty_value > 0 AND p.pack_size_value > 0 THEN
          p.case_qty_value / p.pack_size_value
        ELSE 1
      END
    ) as calc_units_per_case
  FROM 
    public.products p
  LEFT JOIN public.inventory i ON p.id = i.product_id
  GROUP BY p.id, p.units_per_case, p.units_per_packet, p.packets_per_case, p.case_qty_value, p.case_qty_unit, p.pack_size_value, p.pack_size_unit
)
SELECT 
  p.*,
  t.stock_base_units,
  t.stock_base_units as stock_pcs,
  CASE 
    WHEN COALESCE(p.units_per_packet, 1) > 1 THEN FLOOR(t.stock_base_units::numeric / p.units_per_packet)
    ELSE t.stock_base_units
  END as stock_packets,
  CASE 
    WHEN t.calc_units_per_case > 0 THEN FLOOR(t.stock_base_units::numeric / t.calc_units_per_case)
    ELSE 0 
  END as stock_cases,
  CASE 
    WHEN lower(p.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') AND p.pack_size_value > 0 THEN ROUND((t.stock_base_units * p.pack_size_value / 1000.0)::numeric, 3)
    WHEN lower(p.pack_size_unit) IN ('kg', 'kgs', 'kilograms') AND p.pack_size_value > 0 THEN ROUND((t.stock_base_units * p.pack_size_value)::numeric, 3)
    ELSE 0
  END as stock_kg,
  (t.stock_base_units <= p.min_stock) as is_low_stock
FROM 
  public.products p
JOIN 
  product_totals t ON p.id = t.product_id;

-- 2. Advanced Healer for common BP product patterns
-- If name contains "(Haldi) 100 g Jar" or similar
-- We can use regex to extract packing if it's missing
UPDATE public.products
SET 
  pack_size_value = 100,
  pack_size_unit = 'g',
  item_pack_type = 'jar'
WHERE name ~* '100\s*g\s*jar' AND (pack_size_value IS NULL OR pack_size_value = 0);

UPDATE public.products
SET 
  packets_per_case = 18
WHERE (name ~* '100\s*g' OR name ~* 'Haldi') 
  AND (packets_per_case IS NULL OR packets_per_case <= 1)
  AND (units_per_packet IS NULL OR units_per_packet <= 1);

-- Force recompute
SELECT public.recompute_all_inventory();

COMMIT;
