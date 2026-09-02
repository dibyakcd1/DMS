
    -- Migration: Advanced Stock Conversion Logic
    -- Implements weight-based and volume-based selling unit conversions to base units

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
      v_unit TEXT;
    BEGIN
      -- Load product conversion factors
      SELECT 
        units_per_packet, 
        units_per_case, 
        pack_size_value, 
        pack_size_unit 
      INTO 
        v_upp, v_upc, v_psv, v_psu 
      FROM public.products 
      WHERE id = p_product_id;
      
      v_unit := lower(p_unit);
      
      -- 1. Standard Discrete Units
      IF v_unit = 'packet' OR v_unit = 'pkt' THEN
        RETURN p_qty * v_upp;
      ELSIF v_unit = 'case' THEN
        RETURN p_qty * v_upc;
      
      -- 2. Weight/Volume Conversions (Sell kg -> / pack size value)
      -- This assumes p_qty is in kg/l and we need to find how many pouches/units that represents
      ELSIF v_unit = 'kg' OR v_unit = 'l' THEN
        IF v_psv IS NULL OR v_psv = 0 THEN
          RETURN p_qty; -- Fallback to 1:1 if no pack size defined
        END IF;
        
        -- Convert input kg/l to grams/ml (1000x) then divide by pack size
        RETURN (p_qty * 1000.0) / v_psv;
        
      ELSIF v_unit = 'g' OR v_unit = 'ml' THEN
        IF v_psv IS NULL OR v_psv = 0 THEN
          RETURN p_qty; -- Fallback
        END IF;
        
        -- Input is already in g/ml, just divide by pack size
        RETURN p_qty / v_psv;
        
      ELSE -- 'unit', 'pcs', or default
        RETURN p_qty;
      END IF;
    END;
$body$ LANGUAGE plpgsql;
