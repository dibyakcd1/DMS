-- Migration: 20260527000002_fix_warehouse_view_and_defaults.sql
-- Goal: Ensure all products show up in warehouse-specific views even if they have no stock.

BEGIN;

DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;

CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
SELECT 
    (p.id || '-' || w.id)::text as inventory_id,
    w.id as warehouse_id,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    COALESCE(NULLIF(i.avg_landed_cost, 0), 0.01) as avg_landed_cost,
    (COALESCE(i.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock,
    p.*
FROM public.products p
CROSS JOIN public.warehouses w
LEFT JOIN public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id;

GRANT SELECT ON public.v_product_stock_warehouse TO authenticated, anon;

COMMIT;
