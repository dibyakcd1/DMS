
-- Migration: Stock Ledger & Multi-Unit Healing
-- 2026-05-08

DO $body$ 
BEGIN
  -- 1. Ensure stock_ledger has all required columns with correct types
  -- We prioritize the modern schema (with qty_transacted, entry_type, reference_type)
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'entry_type') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN entry_type TEXT DEFAULT 'adjustment' NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'reference_type') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN reference_type TEXT DEFAULT 'order' NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'qty_transacted') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN qty_transacted NUMERIC(15,2) DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'batch_id') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'stock_before') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN stock_before NUMERIC(15,2) DEFAULT 0;
  END IF;

  -- Ensure reference_id can hold UUID (if it's TEXT, we might need to cast eventually, but for now we leave it)
  -- But ensure it exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'reference_id') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN reference_id UUID;
  END IF;

END $body$;

-- 2. Update convert_to_base_units to handle more synomyms like 'pouch', 'sachet'
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID,
  p_qty NUMERIC,
  p_unit TEXT
) RETURNS NUMERIC AS $body$
DECLARE
  v_unit_type         TEXT;
  v_units_per_packet  INTEGER;
  v_units_per_case    INTEGER;
  v_weight_per_unit_g NUMERIC;
  v_unit              TEXT;
  v_result            NUMERIC;
BEGIN
  SELECT unit_type, units_per_packet, units_per_case, weight_per_unit_grams
  INTO v_unit_type, v_units_per_packet, v_units_per_case, v_weight_per_unit_g
  FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN RETURN p_qty; END IF;

  v_unit := LOWER(TRIM(p_unit));
  v_units_per_packet := COALESCE(v_units_per_packet, 1);
  v_units_per_case   := COALESCE(v_units_per_case, 1);

  -- ── PCS / UNIT / PACKET PRODUCTS ─────────────────────────────────────────
  IF v_unit_type IN ('pcs', 'packet', 'unit') THEN
    CASE 
      WHEN v_unit IN ('pcs', 'unit', 'pc', 'pouch', 'sachet', 'jar', 'bottle', 'tin', 'can', 'acb') 
        THEN v_result := p_qty;
      WHEN v_unit IN ('packet', 'pkt') 
        THEN v_result := p_qty * v_units_per_packet;
      WHEN v_unit = 'case' 
        THEN v_result := p_qty * v_units_per_case;
      ELSE v_result := p_qty; -- unknown unit → 1:1
    END CASE;

  -- ── KG / GRAM PRODUCTS ───────────────────────────────────────────────────
  ELSIF v_unit_type = 'kg_g' THEN
    IF v_weight_per_unit_g IS NOT NULL AND v_weight_per_unit_g > 0 THEN
      CASE 
        WHEN v_unit IN ('pcs', 'unit', 'pc', 'pouch', 'sachet', 'packet', 'pkt', 'jar', 'bottle', 'tin', 'can', 'acb')
          THEN v_result := p_qty;                                     
        WHEN v_unit = 'case'
          THEN v_result := p_qty * v_units_per_case;
        WHEN v_unit IN ('g', 'gms', 'gram')
          THEN v_result := p_qty / v_weight_per_unit_g;              
        WHEN v_unit IN ('kg', 'kgs', 'kilogram')
          THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;  
        WHEN v_unit IN ('ml', 'milliliter')
          THEN v_result := p_qty / v_weight_per_unit_g;
        WHEN v_unit IN ('ltr', 'l', 'liter')
          THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
        ELSE v_result := p_qty;
      END CASE;
    ELSE
      -- Fallback if no weight per unit, but unit is mass
      CASE 
        WHEN v_unit IN ('g', 'gms', 'ml') THEN v_result := p_qty;
        WHEN v_unit IN ('kg', 'ltr', 'l') THEN v_result := p_qty * 1000.0;
        ELSE v_result := p_qty;
      END CASE;
    END IF;
  ELSE
    v_result := p_qty;
  END IF;

  RETURN ROUND(v_result, 4);
END;
$body$ LANGUAGE plpgsql STABLE;
