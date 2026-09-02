-- Migration: Standardize Sell Units and Remove Confusion
-- This migration ensures that the system uses PCS, Packet, Case, and KG.

DO $body$
BEGIN
    -- 1. Ensure 'pcs' exists in enums
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'pcs'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'pcs'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    
    -- 2. Ensure 'packet' exists (standardize from 'pkt')
    BEGIN ALTER TYPE public.sell_unit ADD VALUE 'packet'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE public.pack_type ADD VALUE 'packet'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $body$;

-- 3. Update Existing Product Data
UPDATE public.products 
SET preferred_sell_unit = 'packet'
WHERE preferred_sell_unit::text IN ('pkt', 'pouch', 'sachet', 'pack');

UPDATE public.products 
SET preferred_sell_unit = 'pcs'
WHERE preferred_sell_unit::text IN ('unit', 'pcs', 'unit');

UPDATE public.products 
SET item_pack_type = 'packet'
WHERE item_pack_type::text IN ('pkt', 'pouch', 'sachet', 'pack');

UPDATE public.products 
SET item_pack_type = 'unit' -- mapping to 'unit' in DB for now if it's the base
WHERE item_pack_type::text IN ('unit', 'pcs');

-- 4. Map 'unit' text to 'pcs' for future logic
-- We will keep 'unit' as the base in DB enum for backward compatibility but UI will show 'PCS'.

-- 5. Update conversion function to be even more robust with naming
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID, 
  p_qty NUMERIC, 
  p_unit TEXT
)
RETURNS NUMERIC AS $body$
DECLARE
  v_upp INTEGER;
  v_upc INTEGER;
  v_ppc INTEGER;
  v_psv NUMERIC;
  v_psu TEXT;
  v_cqv NUMERIC;
  v_cqu TEXT;
  v_normalized_unit TEXT;
BEGIN
  SELECT 
    units_per_packet, units_per_case, packets_per_case,
    pack_size_value, pack_size_unit,
    case_qty_value, case_qty_unit
  INTO v_upp, v_upc, v_ppc, v_psv, v_psu, v_cqv, v_cqu
  FROM public.products 
  WHERE id = p_product_id;
  
  v_psu := lower(COALESCE(v_psu, 'g'));
  v_cqu := lower(COALESCE(v_cqu, 'kg'));
  v_normalized_unit := lower(trim(p_unit));
  
  -- Handle 'kg'
  IF v_normalized_unit = 'kg' THEN
    IF v_psu IN ('g', 'gms', 'gm', 'grams') AND COALESCE(v_psv, 0) > 0 THEN
      RETURN (p_qty * 1000.0) / v_psv;
    ELSIF v_psu IN ('kg', 'kgs', 'kilograms') AND COALESCE(v_psv, 0) > 0 THEN
      RETURN p_qty / v_psv;
    ELSE
      RETURN p_qty; 
    END IF;
  
  -- Handle 'packet' / 'pkt'
  ELSIF v_normalized_unit IN ('packet', 'pkt', 'packets', 'pack') THEN
    RETURN p_qty * COALESCE(v_upp, 1);
  
  -- Handle 'case' / 'carton'
  ELSIF v_normalized_unit IN ('case', 'carton', 'ctn', 'box', 'bag') THEN
    IF (COALESCE(v_upp, 1) * COALESCE(v_ppc, 1)) > 1 THEN
      RETURN p_qty * (COALESCE(v_upp, 1) * COALESCE(v_ppc, 1));
    ELSIF COALESCE(v_upc, 1) > 1 THEN
      RETURN p_qty * v_upc;
    ELSIF COALESCE(v_cqv, 0) > 0 AND COALESCE(v_psv, 0) > 0 THEN
      IF v_cqu = 'kg' AND v_psu IN ('g', 'gms', 'gm', 'grams') THEN
        RETURN p_qty * ((v_cqv * 1000.0) / v_psv);
      ELSIF v_cqu = v_psu THEN
        RETURN p_qty * (v_cqv / v_psv);
      END IF;
    END IF;
    RETURN p_qty * COALESCE(v_upc, 1);
    
  -- Handle 'pcs' / 'unit' / 'pouch' / 'sachet' as base units
  ELSE 
    RETURN p_qty;
  END IF;
END;
$body$ LANGUAGE plpgsql;
