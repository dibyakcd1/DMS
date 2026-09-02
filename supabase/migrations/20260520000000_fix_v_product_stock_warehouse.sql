-- Migration: Fix v_product_stock_warehouse to show all products
-- Purpose: Ensure products missing from inventory table still show up in warehouse-specific views (with 0 stock)

BEGIN;

DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;

CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
SELECT 
    (p.id || '-' || w.id)::text as inventory_id,
    w.id as warehouse_id,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    COALESCE(NULLIF(i.avg_landed_cost, 0), 0.01) as avg_landed_cost,
    (COALESCE(i.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock,
    p.id,
    p.name,
    p.sku,
    p.mrp,
    p.gst_rate,
    p.hsn,
    p.min_stock,
    p.is_active,
    p.brand,
    p.division,
    p.division_category,
    p.item_pack_type,
    p.pack_size_value,
    p.pack_size_unit,
    p.base_unit,
    p.unit,
    p.units_per_packet,
    p.packets_per_case,
    p.units_per_case,
    p.unit_type,
    p.weight_per_unit_grams,
    p.display_weight_unit,
    p.preferred_sell_unit,
    p.is_mrp_priced,
    p.is_chain_item,
    p.chain_mrp_label,
    p.batch_number,
    p.created_at,
    p.updated_at
FROM public.products p
CROSS JOIN public.warehouses w
LEFT JOIN public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id;

GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;

COMMIT;
