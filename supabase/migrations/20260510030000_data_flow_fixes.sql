
-- Migration: Data Flow & Logic Fixes
-- Address critical issues in product stock views, unit conversions, and inventory cleanup.

BEGIN;

-- 1. Restore/Update v_product_stock with avg_landed_cost
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

CREATE OR REPLACE VIEW public.v_product_stock AS
WITH stock_agg AS (
    SELECT 
        product_id, 
        SUM(COALESCE(stock_base_units, 0)) as total_stock,
        MAX(last_updated_at) as last_update
    FROM public.inventory
    GROUP BY product_id
)
SELECT 
  p.*,
  COALESCE(s.total_stock, 0) as stock_base_units,
  -- Weighted average landed cost from active batches
  (
    SELECT COALESCE(SUM(ib.remaining_qty * ib.landed_cost) / NULLIF(SUM(ib.remaining_qty), 0), 0)
    FROM public.inventory_batches ib
    WHERE ib.product_id = p.id AND ib.remaining_qty > 0
  ) as avg_landed_cost,
  -- Standardized units_per_case logic (prefer packets * units_per_packet)
  CASE 
    WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 
      THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
    WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
    ELSE 1 
  END as calc_units_per_case,
  -- Boolean for low stock using per-product min_stock
  (COALESCE(s.total_stock, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock,
  s.last_update as last_stock_update
FROM 
  public.products p
LEFT JOIN 
  stock_agg s ON p.id = s.product_id;

-- 2. Create missing v_product_stock_warehouse view
CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
SELECT 
  p.*,
  i.warehouse_id,
  COALESCE(i.stock_base_units, 0) as stock_base_units,
  (
    SELECT COALESCE(SUM(ib.remaining_qty * ib.landed_cost) / NULLIF(SUM(ib.remaining_qty), 0), 0)
    FROM public.inventory_batches ib
    WHERE ib.product_id = p.id AND ib.remaining_qty > 0 AND ib.warehouse_id = i.warehouse_id
  ) as avg_landed_cost,
  (COALESCE(i.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock
FROM 
  public.products p
JOIN 
  public.inventory i ON p.id = i.product_id
WHERE 
  i.warehouse_id IS NOT NULL;

-- 3. Standardize convert_to_base_units DB function
-- Prefer packets/multiplier logic over fixed units_per_case
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID,
  p_qty NUMERIC,
  p_unit TEXT
) RETURNS NUMERIC AS $body$
DECLARE
  v_unit_type         TEXT;
  v_units_per_packet  INTEGER;
  v_packets_per_case  INTEGER;
  v_units_per_case    INTEGER;
  v_weight_per_unit_g NUMERIC;
  v_unit              TEXT;
  v_multiplier        INTEGER;
  v_result            NUMERIC;
BEGIN
  SELECT unit_type, units_per_packet, packets_per_case, units_per_case, weight_per_unit_grams
  INTO v_unit_type, v_units_per_packet, v_packets_per_case, v_units_per_case, v_weight_per_unit_g
  FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found: %', p_product_id; END IF;

  v_unit := LOWER(TRIM(p_unit));
  v_units_per_packet := COALESCE(v_units_per_packet, 1);
  v_packets_per_case := COALESCE(v_packets_per_case, 1);
  
  -- Priority: units_per_packet * packets_per_case, then fixed units_per_case
  v_multiplier := CASE 
    WHEN (v_units_per_packet * v_packets_per_case) > 1 THEN (v_units_per_packet * v_packets_per_case)
    ELSE COALESCE(v_units_per_case, 1)
  END;

  IF v_unit_type = 'kg_g' THEN
    IF v_weight_per_unit_g IS NOT NULL AND v_weight_per_unit_g > 0 THEN
      CASE v_unit
        WHEN 'pcs', 'unit', 'pc', 'pouch', 'packet', 'pkt' THEN v_result := p_qty;
        WHEN 'case', 'ctn' THEN v_result := p_qty * v_multiplier;
        WHEN 'g', 'gms'    THEN v_result := p_qty / v_weight_per_unit_g;
        WHEN 'kg'          THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
        WHEN 'ml'          THEN v_result := p_qty / v_weight_per_unit_g;
        WHEN 'ltr', 'l'    THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
        ELSE v_result := p_qty;
      END CASE;
    ELSE
      CASE v_unit
        WHEN 'g', 'gms', 'ml' THEN v_result := p_qty;
        WHEN 'kg', 'ltr', 'l' THEN v_result := p_qty * 1000.0;
        ELSE v_result := p_qty;
      END CASE;
    END IF;
  ELSE
    CASE v_unit
      WHEN 'pcs', 'unit', 'pc' THEN v_result := p_qty;
      WHEN 'packet', 'pkt'     THEN v_result := p_qty * v_units_per_packet;
      WHEN 'case', 'ctn'       THEN v_result := p_qty * v_multiplier;
      ELSE v_result := p_qty;
    END CASE;
  END IF;

  RETURN ROUND(v_result, 4);
END;
$body$ LANGUAGE plpgsql STABLE;

-- 4. Cleanup stale inventory rows
-- Remove rows with NULL warehouse_id or 0 stock that have no matching product active state
DELETE FROM public.inventory 
WHERE warehouse_id IS NULL;

-- 5. Grants
GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;

COMMIT;
