-- Fix missing Kg sell option by adding necessary columns to v_product_stock_warehouse view

DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
CREATE VIEW public.v_product_stock_warehouse AS
WITH latest_landed_costs AS (
    SELECT DISTINCT ON (product_id) 
        product_id, 
        landed_cost
    FROM public.inventory_batches 
    ORDER BY product_id, received_at DESC, created_at DESC
)
SELECT 
    w.id as warehouse_id,
    w.name as warehouse_name,
    p.id as id,
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
    p.case_qty_value,
    p.case_qty_unit,
    p.preferred_sell_unit,
    p.unit_type,
    p.weight_per_unit_grams,
    p.display_weight_unit,
    p.base_unit,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    CASE 
        WHEN COALESCE(i.stock_base_units, 0) > 0 THEN i.avg_landed_cost
        ELSE (
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
LEFT JOIN
    latest_landed_costs llc ON p.id = llc.product_id
WHERE 
    p.is_active = true OR COALESCE(i.stock_base_units, 0) > 0;

GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO service_role;

-- Update v_product_stock view to show totals across all warehouses
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock AS
WITH latest_landed_costs AS (
    SELECT DISTINCT ON (product_id) 
        product_id, 
        landed_cost
    FROM public.inventory_batches 
    ORDER BY product_id, received_at DESC, created_at DESC
),
inventory_totals AS (
  SELECT 
    product_id,
    COALESCE(SUM(stock_base_units), 0) as stock_base_units,
    MAX(last_updated_at) as last_stock_update
  FROM public.inventory i
  GROUP BY product_id
)
SELECT
  p.*,
  COALESCE(it.stock_base_units, 0)                                          AS stock_base_units,
  -- PCS display
  CASE WHEN p.unit_type IN ('pcs','packet') 
       THEN COALESCE(it.stock_base_units, 0) ELSE NULL END                  AS stock_pcs,
  -- Packet display
  CASE WHEN p.units_per_packet > 1 AND COALESCE(it.stock_base_units,0) > 0
       THEN FLOOR(COALESCE(it.stock_base_units,0) / NULLIF(p.units_per_packet,0)) ELSE NULL END AS stock_packets,
  -- Remainder pcs after packets
  CASE WHEN p.units_per_packet > 1 AND COALESCE(it.stock_base_units,0) > 0
       THEN MOD(COALESCE(it.stock_base_units,0)::INT, NULLIF(p.units_per_packet,0)) ELSE NULL END AS stock_remainder_pcs,
  -- Case display
  CASE WHEN p.units_per_case > 1
       THEN FLOOR(COALESCE(it.stock_base_units,0) / NULLIF(p.units_per_case,0)) ELSE NULL END   AS stock_cases,
  -- KG display
  CASE 
    WHEN p.unit_type = 'kg_g' AND p.weight_per_unit_grams IS NOT NULL
      THEN ROUND((COALESCE(it.stock_base_units,0) * p.weight_per_unit_grams) / 1000.0, 3)
    WHEN p.unit_type = 'kg_g' AND p.weight_per_unit_grams IS NULL
      THEN ROUND(COALESCE(it.stock_base_units,0) / 1000.0, 3)  
    ELSE NULL
  END                                                              AS stock_kg,
  -- Gram display
  CASE 
    WHEN p.unit_type = 'kg_g' AND p.weight_per_unit_grams IS NOT NULL
      THEN ROUND(COALESCE(it.stock_base_units,0) * p.weight_per_unit_grams, 1)
    WHEN p.unit_type = 'kg_g' AND p.weight_per_unit_grams IS NULL
      THEN COALESCE(it.stock_base_units, 0)  
    ELSE NULL
  END                                                              AS stock_grams,
  COALESCE(it.stock_base_units, 0) <= p.min_stock                          AS is_low_stock,
  it.last_stock_update,
  COALESCE(llc.landed_cost, 0) as avg_landed_cost
FROM public.products p
LEFT JOIN inventory_totals it ON p.id = it.product_id
LEFT JOIN latest_landed_costs llc ON p.id = llc.product_id;

GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock TO service_role;
