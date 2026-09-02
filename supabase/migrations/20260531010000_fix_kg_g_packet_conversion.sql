-- MIGRATION: Fix packet conversion for kg/g products
-- Corrects convert_to_base_units so that packet/pkt units on weight-based items scale properly by units_per_packet.

CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID,
  p_qty NUMERIC,
  p_unit TEXT
) RETURNS NUMERIC AS $$
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
        WHEN 'pcs', 'unit', 'pc', 'pouch', 'sachet', 'jar', 'bottle', 'tin', 'can', 'acb' THEN v_result := p_qty;
        WHEN 'packet', 'pkt' THEN v_result := p_qty * v_units_per_packet;
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
        WHEN 'packet', 'pkt' THEN v_result := p_qty * v_units_per_packet;
        WHEN 'case', 'ctn' THEN v_result := p_qty * v_multiplier;
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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
