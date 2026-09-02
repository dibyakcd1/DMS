
-- Migration: Stock Engine Components
-- View for enriched product stock data
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock AS
SELECT 
  p.*,
  COALESCE(i.quantity, 0) as stock_base_units,
  CASE 
    WHEN p.units_per_packet > 0 THEN floor(COALESCE(i.quantity, 0) / p.units_per_packet)
    ELSE 0 
  END as stock_packets,
  CASE 
    WHEN (p.units_per_packet * p.packets_per_case) > 0 THEN floor(COALESCE(i.quantity, 0) / (p.units_per_packet * p.packets_per_case))
    ELSE 0 
  END as stock_cases,
  COALESCE(i.quantity, 0) < p.min_stock as is_low_stock,
  CASE 
    WHEN p.pack_size_unit = 'g' THEN (COALESCE(i.quantity, 0) * p.pack_size_value) / 1000.0
    WHEN p.pack_size_unit = 'kg' THEN (COALESCE(i.quantity, 0) * p.pack_size_value)
    ELSE 0 
  END as stock_kg,
  i.updated_at as last_stock_update
FROM public.products p
LEFT JOIN public.inventory i ON p.id = i.product_id;

-- Stock Ledger Table
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reference_type   TEXT NOT NULL, -- 'import', 'order', 'grn', 'adjustment', 'transfer'
  reference_id     TEXT,
  base_units_delta NUMERIC(15,2) NOT NULL,
  stock_after      NUMERIC(15,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id)
);

ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_ledger" ON public.stock_ledger FOR SELECT TO authenticated USING (true);

-- Function to convert units to base units
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID,
  p_qty NUMERIC,
  p_unit TEXT
) RETURNS NUMERIC AS $body$
DECLARE
  v_upp INTEGER;
  v_ppc INTEGER;
BEGIN
  SELECT units_per_packet, packets_per_case INTO v_upp, v_ppc FROM public.products WHERE id = p_product_id;
  
  IF p_unit = 'packet' THEN
    RETURN p_qty * v_upp;
  ELSIF p_unit = 'case' THEN
    RETURN p_qty * v_upp * v_ppc;
  ELSE -- 'unit' or default
    RETURN p_qty;
  END IF;
END;
$body$ LANGUAGE plpgsql;

-- Add stock function
CREATE OR REPLACE FUNCTION public.add_stock(
  p_product_id UUID,
  p_qty NUMERIC,
  p_sell_unit TEXT,
  p_reference_type TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $body$
DECLARE
  v_delta NUMERIC;
  v_new_stock NUMERIC;
BEGIN
  v_delta := public.convert_to_base_units(p_product_id, p_qty, p_sell_unit);
  
  -- Update inventory (if it doesn't exist, create it)
  INSERT INTO public.inventory (product_id, quantity, updated_at)
  VALUES (p_product_id, v_delta, now())
  ON CONFLICT (product_id) DO UPDATE 
  SET quantity = inventory.quantity + v_delta, updated_at = now()
  RETURNING quantity INTO v_new_stock;
  
  -- Log in ledger
  INSERT INTO public.stock_ledger (product_id, reference_type, reference_id, base_units_delta, stock_after, created_by)
  VALUES (p_product_id, p_reference_type, p_reference_id, v_delta, v_new_stock, p_user_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'stock_after', v_new_stock,
    'base_units_added', v_delta
  );
END;
$body$ LANGUAGE plpgsql;

-- Deduct stock function
CREATE OR REPLACE FUNCTION public.deduct_stock(
  p_product_id UUID,
  p_qty NUMERIC,
  p_sell_unit TEXT,
  p_reference_type TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $body$
DECLARE
  v_delta NUMERIC;
  v_new_stock NUMERIC;
  v_current_stock NUMERIC;
BEGIN
  v_delta := public.convert_to_base_units(p_product_id, p_qty, p_sell_unit);
  
  SELECT quantity INTO v_current_stock FROM public.inventory WHERE product_id = p_product_id;
  
  IF v_current_stock IS NULL OR v_current_stock < v_delta THEN
    -- Allow negative stock if mission critical, but let's check
    -- For now we allow it but we could throw error
  END IF;

  UPDATE public.inventory 
  SET quantity = quantity - v_delta, updated_at = now()
  WHERE product_id = p_product_id
  RETURNING quantity INTO v_new_stock;
  
  -- Log in ledger
  INSERT INTO public.stock_ledger (product_id, reference_type, reference_id, base_units_delta, stock_after, created_by)
  VALUES (p_product_id, p_reference_type, p_reference_id, -v_delta, v_new_stock, p_user_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'stock_after', v_new_stock,
    'base_units_deducted', v_delta
  );
END;
$body$ LANGUAGE plpgsql;

-- Transactional function for product import confirmation
CREATE OR REPLACE FUNCTION public.confirm_product_import(
  p_rows JSONB, -- Array of mapped_data objects
  p_skip_errors BOOLEAN DEFAULT TRUE,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $body$
DECLARE
  v_row JSONB;
  v_product_id UUID;
  v_is_new BOOLEAN;
  v_imported_count INT := 0;
  v_updated_count INT := 0;
  v_skipped_count INT := 0;
  v_failed_rows JSONB := '[]'::jsonb;
  v_opening_stock NUMERIC;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      -- UPSERT Product
      INSERT INTO public.products (
        name, sku, mrp, gst_rate, division_category, hsn,
        item_pack_type, pack_size_value, pack_size_unit,
        brand, units_per_packet, packets_per_case, preferred_sell_unit,
        min_stock, created_at, updated_at
      ) VALUES (
        v_row->>'name',
        v_row->>'sku',
        (v_row->>'mrp')::NUMERIC,
        (v_row->>'gst_rate')::NUMERIC,
        v_row->>'division_category',
        v_row->>'hsn',
        v_row->>'item_pack_type',
        (v_row->>'pack_size_value')::NUMERIC,
        v_row->>'pack_size_unit',
        COALESCE(v_row->>'brand', 'BharatMasala'),
        (v_row->>'units_per_packet')::INT,
        (v_row->>'packets_per_case')::INT,
        v_row->>'preferred_sell_unit',
        (v_row->>'min_stock')::NUMERIC,
        now(), now()
      )
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        mrp = EXCLUDED.mrp,
        gst_rate = EXCLUDED.gst_rate,
        division_category = EXCLUDED.division_category,
        hsn = EXCLUDED.hsn,
        item_pack_type = EXCLUDED.item_pack_type,
        pack_size_value = EXCLUDED.pack_size_value,
        pack_size_unit = EXCLUDED.pack_size_unit,
        brand = EXCLUDED.brand,
        units_per_packet = EXCLUDED.units_per_packet,
        packets_per_case = EXCLUDED.packets_per_case,
        preferred_sell_unit = EXCLUDED.preferred_sell_unit,
        min_stock = EXCLUDED.min_stock,
        updated_at = now()
      RETURNING id, (xmin = 0) INTO v_product_id, v_is_new;
      -- Note: xmin = 0 is a trick to detect insert, but might not work perfectly with ON CONFLICT.
      -- Better way: check if was existing.
      
      -- For Supabase/Postgres, we can check if it was truly an insert by comparing created_at or similar.
      -- Or just perform a separate check.
      
      -- Let's check inventory existence
      IF NOT EXISTS (SELECT 1 FROM public.inventory WHERE product_id = v_product_id) THEN
        -- New product or missing inventory row
        v_opening_stock := (v_row->'inventory'->>'stock_base_units')::NUMERIC;
        
        INSERT INTO public.inventory (product_id, quantity, updated_at)
        VALUES (v_product_id, v_opening_stock, now());
        
        -- Log in ledger
        INSERT INTO public.stock_ledger (product_id, reference_type, reference_id, base_units_delta, stock_after, created_by)
        VALUES (v_product_id, 'import', 'initial', v_opening_stock, v_opening_stock, p_user_id);
        
        v_imported_count := v_imported_count + 1;
      ELSE
        -- Existing product
        v_updated_count := v_updated_count + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      IF NOT p_skip_errors THEN
        RAISE;
      END IF;
      v_failed_rows := v_failed_rows || jsonb_build_object('sku', v_row->>'sku', 'error', SQLERRM);
      v_skipped_count := v_skipped_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'imported_count', v_imported_count,
    'updated_count', v_updated_count,
    'skipped_count', v_skipped_count,
    'failed_rows', v_failed_rows
  );
END;
$body$ LANGUAGE plpgsql;
