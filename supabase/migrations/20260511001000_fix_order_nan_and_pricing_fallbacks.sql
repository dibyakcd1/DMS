-- Fix NaN errors in NewOrder by adding missing columns to v_product_stock_warehouse
-- Also improve landed cost fallback for granular warehouse view

-- 1. Update v_product_stock_warehouse to include all metadata needed for NewOrder
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
CREATE VIEW public.v_product_stock_warehouse AS
SELECT 
    w.id as warehouse_id,
    w.name as warehouse_name,
    p.id as product_id,
    p.sku, 
    p.name,
    p.gst_rate,
    p.mrp,
    p.units_per_packet, 
    p.packets_per_case, 
    p.units_per_case,
    p.min_stock, 
    p.is_active,
    p.division_category,
    p.item_pack_type,
    p.pack_size_value,
    p.pack_size_unit,
    p.preferred_sell_unit,
    p.unit_type,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    CASE 
        WHEN COALESCE(i.stock_base_units, 0) > 0 THEN i.avg_landed_cost
        ELSE (
            -- Global fallback to last known landed cost if warehouse stock is zero
            SELECT COALESCE(landed_cost, 0) 
            FROM public.inventory_batches 
            WHERE product_id = p.id 
            ORDER BY received_at DESC, created_at DESC 
            LIMIT 1
        )
    END as avg_landed_cost,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
      ELSE 1 
    END as calc_units_per_case,
    (COALESCE(i.stock_base_units, 0) <= p.min_stock) as is_low_stock
FROM 
    public.warehouses w
CROSS JOIN 
    public.products p
LEFT JOIN 
    public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id
WHERE 
    p.is_active = true OR COALESCE(i.stock_base_units, 0) > 0;

GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO service_role;
