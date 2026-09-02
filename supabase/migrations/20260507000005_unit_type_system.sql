-- Migration: Unit Type System
-- This migration implements a structured unit system (pcs, packet, kg_g) and weight awareness.

-- 1a. Add unit_type column to products
DO $body$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='products' AND column_name='unit_type'
  ) THEN
    ALTER TABLE public.products 
    ADD COLUMN unit_type TEXT NOT NULL DEFAULT 'pcs'
    CHECK (unit_type IN ('pcs', 'packet', 'kg_g'));
  END IF;
END $body$;

-- 1b. Backfill unit_type from existing product data
-- Products sold/stocked purely by weight (pack_size_unit is g/kg/ml/ltr)
UPDATE public.products SET unit_type = 'kg_g'
WHERE LOWER(pack_size_unit) IN ('g', 'gms', 'kg', 'ml', 'ltr', 'l')
  AND pack_size_value IS NOT NULL AND pack_size_value > 0
  AND unit_type = 'pcs';

-- Products with packet layers (more than 1 pcs per packet)
UPDATE public.products SET unit_type = 'packet'
WHERE units_per_packet > 1
  AND unit_type = 'pcs'; -- Only if not already set to kg_g

-- 1c. Add weight_per_unit_grams column
DO $body$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='products' AND column_name='weight_per_unit_grams'
  ) THEN
    ALTER TABLE public.products ADD COLUMN weight_per_unit_grams NUMERIC(12,4);
  END IF;
END $body$;

-- Backfill weight_per_unit_grams from pack_size_value + pack_size_unit
UPDATE public.products SET weight_per_unit_grams = 
  CASE 
    WHEN LOWER(pack_size_unit) IN ('g', 'gms') THEN pack_size_value
    WHEN LOWER(pack_size_unit) = 'kg' THEN pack_size_value * 1000
    WHEN LOWER(pack_size_unit) IN ('ml') THEN pack_size_value  -- treat ml = g for now
    WHEN LOWER(pack_size_unit) IN ('ltr', 'l') THEN pack_size_value * 1000
    ELSE NULL
  END
WHERE pack_size_value IS NOT NULL AND pack_size_unit IS NOT NULL;

-- 1d. Add display_weight_unit column
DO $body$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='products' AND column_name='display_weight_unit'
  ) THEN
    ALTER TABLE public.products ADD COLUMN display_weight_unit TEXT DEFAULT 'g'
    CHECK (display_weight_unit IN ('g', 'kg', 'ml', 'ltr'));
  END IF;
END $body$;

-- Backfill from existing pack_size_unit
UPDATE public.products 
SET display_weight_unit = LOWER(pack_size_unit)
WHERE pack_size_unit IS NOT NULL AND unit_type = 'kg_g';

-- 1e. Replace convert_to_base_units() DB function
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID,
  p_qty NUMERIC,
  p_unit TEXT   -- 'pcs'|'unit'|'packet'|'pkt'|'case'|'kg'|'g'|'ml'|'ltr'
) RETURNS NUMERIC AS $body$
DECLARE
  v_unit_type         TEXT;
  v_units_per_packet  INTEGER;
  v_units_per_case    INTEGER;
  v_weight_per_unit_g NUMERIC;  -- grams per 1 base unit (pcs/pouch)
  v_unit              TEXT;
  v_result            NUMERIC;
BEGIN
  SELECT unit_type, units_per_packet, units_per_case, weight_per_unit_grams
  INTO v_unit_type, v_units_per_packet, v_units_per_case, v_weight_per_unit_g
  FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found: %', p_product_id; END IF;

  v_unit := LOWER(TRIM(p_unit));
  v_units_per_packet := COALESCE(v_units_per_packet, 1);
  v_units_per_case   := COALESCE(v_units_per_case, 1);

  -- ── PCS / UNIT PRODUCTS ─────────────────────────────────────────────────
  IF v_unit_type = 'pcs' THEN
    CASE v_unit
      WHEN 'pcs', 'unit', 'pc' THEN v_result := p_qty;
      WHEN 'packet', 'pkt'     THEN v_result := p_qty * v_units_per_packet;
      WHEN 'case'              THEN v_result := p_qty * v_units_per_case;
      ELSE v_result := p_qty; -- unknown unit → 1:1
    END CASE;

  -- ── PACKET PRODUCTS ──────────────────────────────────────────────────────
  ELSIF v_unit_type = 'packet' THEN
    CASE v_unit
      WHEN 'pcs', 'unit', 'pc' THEN v_result := p_qty;
      WHEN 'packet', 'pkt'     THEN v_result := p_qty * v_units_per_packet;
      WHEN 'case'              THEN v_result := p_qty * v_units_per_case;
      ELSE v_result := p_qty;
    END CASE;

  -- ── KG / GRAM PRODUCTS ───────────────────────────────────────────────────
  ELSIF v_unit_type = 'kg_g' THEN
    IF v_weight_per_unit_g IS NOT NULL AND v_weight_per_unit_g > 0 THEN
      CASE v_unit
        WHEN 'pcs', 'unit', 'pc', 'pouch', 'packet', 'pkt'
          THEN v_result := p_qty;                                     
        WHEN 'case'
          THEN v_result := p_qty * v_units_per_case;
        WHEN 'g', 'gms'
          THEN v_result := p_qty / v_weight_per_unit_g;              
        WHEN 'kg'
          THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;  
        WHEN 'ml'
          THEN v_result := p_qty / v_weight_per_unit_g;
        WHEN 'ltr', 'l'
          THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
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
    v_result := p_qty;
  END IF;

  RETURN ROUND(v_result, 4);
END;
$body$ LANGUAGE plpgsql STABLE;

-- 1f. Replace deduct_stock()
CREATE OR REPLACE FUNCTION public.deduct_stock(
  p_product_id    UUID,
  p_qty_sold      NUMERIC,
  p_sell_unit     TEXT,
  p_reference_type TEXT,
  p_reference_id  UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $body$
DECLARE
  v_base_qty    NUMERIC;
  v_stock_before NUMERIC;
  v_stock_after  NUMERIC;
  v_inv_exists   BOOLEAN;
BEGIN
  -- Convert to base units using unified function
  v_base_qty := public.convert_to_base_units(p_product_id, p_qty_sold, p_sell_unit);

  -- Ensure inventory row exists and lock it
  SELECT EXISTS(SELECT 1 FROM public.inventory WHERE product_id = p_product_id) INTO v_inv_exists;
  
  IF NOT v_inv_exists THEN
    INSERT INTO public.inventory(product_id, stock_base_units, updated_at)
    VALUES(p_product_id, 0, now())
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;
  END IF;

  SELECT COALESCE(stock_base_units, 0) INTO v_stock_before
  FROM public.inventory WHERE product_id = p_product_id FOR UPDATE;

  IF v_stock_before < v_base_qty THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_stock_before, v_base_qty;
  END IF;

  v_stock_after := v_stock_before - v_base_qty;

  UPDATE public.inventory
  SET stock_base_units = v_stock_after, updated_at = now()
  WHERE product_id = p_product_id;

  -- Also deduct from batches FIFO (if batches exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_batches') THEN
    WITH fifo AS (
      SELECT id, remaining_qty,
             SUM(remaining_qty) OVER (ORDER BY received_at ASC ROWS UNBOUNDED PRECEDING) AS running_total
      FROM public.inventory_batches
      WHERE product_id = p_product_id AND remaining_qty > 0
      ORDER BY received_at ASC
    )
    UPDATE public.inventory_batches ib
    SET remaining_qty = GREATEST(0,
      fifo.remaining_qty - GREATEST(0, v_base_qty - (fifo.running_total - fifo.remaining_qty))
    )
    FROM fifo WHERE ib.id = fifo.id AND fifo.running_total - fifo.remaining_qty < v_base_qty;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'base_units_deducted', v_base_qty,
    'stock_before', v_stock_before,
    'stock_after', v_stock_after,
    'sell_unit', p_sell_unit
  );
END;
$body$;

-- 1g. Rebuild v_product_stock view
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock AS
SELECT
  p.*,
  COALESCE(i.stock_base_units, 0)                                          AS stock_base_units,
  -- PCS display
  CASE WHEN p.unit_type IN ('pcs','packet') 
       THEN COALESCE(i.stock_base_units, 0) ELSE NULL END                  AS stock_pcs,
  -- Packet display
  CASE WHEN p.units_per_packet > 1 AND COALESCE(i.stock_base_units,0) > 0
       THEN FLOOR(COALESCE(i.stock_base_units,0) / NULLIF(p.units_per_packet,0)) ELSE NULL END AS stock_packets,
  -- Remainder pcs after packets
  CASE WHEN p.units_per_packet > 1 AND COALESCE(i.stock_base_units,0) > 0
       THEN MOD(COALESCE(i.stock_base_units,0)::INT, NULLIF(p.units_per_packet,0)) ELSE NULL END AS stock_remainder_pcs,
  -- Case display
  CASE WHEN p.units_per_case > 1
       THEN FLOOR(COALESCE(i.stock_base_units,0) / NULLIF(p.units_per_case,0)) ELSE NULL END   AS stock_cases,
  -- KG display
  CASE 
    WHEN p.unit_type = 'kg_g' AND p.weight_per_unit_grams IS NOT NULL
      THEN ROUND((COALESCE(i.stock_base_units,0) * p.weight_per_unit_grams) / 1000.0, 3)
    WHEN p.unit_type = 'kg_g' AND p.weight_per_unit_grams IS NULL
      THEN ROUND(COALESCE(i.stock_base_units,0) / 1000.0, 3)  
    ELSE NULL
  END                                                              AS stock_kg,
  -- Gram display
  CASE 
    WHEN p.unit_type = 'kg_g' AND p.weight_per_unit_grams IS NOT NULL
      THEN ROUND(COALESCE(i.stock_base_units,0) * p.weight_per_unit_grams, 1)
    WHEN p.unit_type = 'kg_g' AND p.weight_per_unit_grams IS NULL
      THEN COALESCE(i.stock_base_units, 0)  
    ELSE NULL
  END                                                              AS stock_grams,
  COALESCE(i.stock_base_units, 0) <= p.min_stock                          AS is_low_stock,
  i.updated_at                                                     AS last_stock_update
FROM public.products p
LEFT JOIN public.inventory i ON p.id = i.product_id;
