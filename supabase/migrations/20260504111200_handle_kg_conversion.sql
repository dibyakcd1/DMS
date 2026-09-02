
-- Migration: Handle 'kg' in stock conversion logic
-- 2026-05-04

CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID,
  p_qty NUMERIC,
  p_unit TEXT
) RETURNS NUMERIC AS $body$
DECLARE
  v_upp INTEGER;
  v_upc INTEGER;
  v_psv NUMERIC;
  v_psu TEXT;
BEGIN
  SELECT 
    units_per_packet, 
    units_per_case, 
    pack_size_value, 
    pack_size_unit 
  INTO v_upp, v_upc, v_psv, v_psu 
  FROM public.products 
  WHERE id = p_product_id;
  
  IF p_unit = 'packet' OR p_unit = 'pkt' THEN
    RETURN p_qty * COALESCE(v_upp, 1);
  ELSIF p_unit = 'case' THEN
    RETURN p_qty * COALESCE(v_upc, 1);
  ELSIF p_unit = 'kg' THEN
    IF v_psu = 'g' AND v_psv > 0 THEN
      -- base_units = (kg * 1000) / g_per_unit
      RETURN (p_qty * 1000.0) / v_psv;
    ELSIF v_psu = 'kg' AND v_psv > 0 THEN
      -- base_units = kg_qty / kg_per_unit
      RETURN p_qty / v_psv;
    ELSE
      -- Fallback: if no weight logic, treat kg as unit if item_pack_type was kg
      RETURN p_qty;
    END IF;
  ELSE -- 'unit', 'pcs', or default
    RETURN p_qty;
  END IF;
END;
$body$ LANGUAGE plpgsql;
