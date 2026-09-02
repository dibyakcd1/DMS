
-- Migration: Fix Standardized Product Stock View
-- Resolves "Home load error" by aligning view with the latest inventory table schema (stock_base_units).

DROP VIEW IF EXISTS public.v_product_stock CASCADE;

CREATE VIEW public.v_product_stock AS
SELECT 
  p.*,
  COALESCE(i.stock_base_units, 0) as stock_base_units,
  CASE 
    WHEN p.units_per_packet > 0 THEN floor(COALESCE(i.stock_base_units, 0) / p.units_per_packet)
    ELSE 0 
  END as stock_packets,
  CASE 
    WHEN p.units_per_case > 0 THEN floor(COALESCE(i.stock_base_units, 0) / p.units_per_case)
    ELSE 0 
  END as stock_cases,
  COALESCE(i.stock_base_units, 0) < p.min_stock as is_low_stock,
  CASE 
    WHEN p.pack_size_unit = 'g' THEN (COALESCE(i.stock_base_units, 0) * p.pack_size_value) / 1000.0
    WHEN p.pack_size_unit = 'Kg' THEN (COALESCE(i.stock_base_units, 0) * p.pack_size_value)
    ELSE 0 
  END as stock_kg,
  i.last_updated_at as last_stock_update
FROM public.products p
LEFT JOIN public.inventory i ON p.id = i.product_id;
