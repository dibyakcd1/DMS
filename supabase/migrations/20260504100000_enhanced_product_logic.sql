
-- Migration: Enhanced Product Logic & Packaging Hierarchy
-- Updates stock calculations to respect units_per_case as the source of truth

-- 1. Ensure columns exist on products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS units_per_case INTEGER;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_chain_item BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_mrp_priced BOOLEAN DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS chain_mrp_label TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS case_type TEXT DEFAULT 'carton';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_weight_unit TEXT DEFAULT 'g';

-- 2. Update the stock view to use units_per_case
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
    WHEN p.units_per_case > 0 THEN floor(COALESCE(i.quantity, 0) / p.units_per_case)
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

-- 3. Update conversion function
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID,
  p_qty NUMERIC,
  p_unit TEXT
) RETURNS NUMERIC AS $body$
DECLARE
  v_upp INTEGER;
  v_upc INTEGER;
BEGIN
  SELECT units_per_packet, units_per_case INTO v_upp, v_upc FROM public.products WHERE id = p_product_id;
  
  IF p_unit = 'packet' OR p_unit = 'pkt' THEN
    RETURN p_qty * v_upp;
  ELSIF p_unit = 'case' THEN
    RETURN p_qty * v_upc;
  ELSE -- 'unit', 'pcs', or default
    RETURN p_qty;
  END IF;
END;
$body$ LANGUAGE plpgsql;

-- 4. Update import function to handle new fields
CREATE OR REPLACE FUNCTION public.confirm_product_import(
  p_rows JSONB,
  p_skip_errors BOOLEAN DEFAULT TRUE,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB AS $body$
DECLARE
  v_row JSONB;
  v_product_id UUID;
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
        name, sku, mrp, gst_rate, division_category, sub_category, division, hsn,
        item_pack_type, pack_size_value, pack_size_unit,
        brand, units_per_packet, packets_per_case, units_per_case, 
        preferred_sell_unit, is_chain_item, is_mrp_priced, chain_mrp_label,
        target_margin_basic, target_margin_premium, target_margin_gold, 
        target_margin_silver, target_margin_bronze,
        min_stock, batch_number, description, is_active, updated_at
      ) VALUES (
        v_row->>'name',
        v_row->>'sku',
        (v_row->>'mrp')::NUMERIC,
        (v_row->>'gst_rate')::NUMERIC,
        v_row->>'division_category',
        v_row->>'sub_category',
        v_row->>'division',
        v_row->>'hsn',
        (v_row->>'item_pack_type')::public.pack_type,
        (v_row->>'pack_size_value')::NUMERIC,
        v_row->>'pack_size_unit',
        COALESCE(v_row->>'brand', 'Bharat Masala'),
        (v_row->>'units_per_packet')::INT,
        (v_row->>'packets_per_case')::INT,
        (v_row->>'units_per_case')::INT,
        (v_row->>'preferred_sell_unit')::public.pack_type,
        COALESCE((v_row->>'is_chain_item')::BOOLEAN, FALSE),
        COALESCE((v_row->>'is_mrp_priced')::BOOLEAN, FALSE),
        v_row->>'chain_mrp_label',
        (v_row->>'target_margin_basic')::NUMERIC,
        (v_row->>'target_margin_premium')::NUMERIC,
        (v_row->>'target_margin_gold')::NUMERIC,
        (v_row->>'target_margin_silver')::NUMERIC,
        (v_row->>'target_margin_bronze')::NUMERIC,
        (v_row->>'min_stock')::NUMERIC,
        v_row->>'batch_number',
        v_row->>'description',
        COALESCE((v_row->>'is_active')::BOOLEAN, TRUE),
        now()
      )
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        mrp = EXCLUDED.mrp,
        gst_rate = EXCLUDED.gst_rate,
        division_category = EXCLUDED.division_category,
        sub_category = EXCLUDED.sub_category,
        division = EXCLUDED.division,
        hsn = EXCLUDED.hsn,
        item_pack_type = EXCLUDED.item_pack_type,
        pack_size_value = EXCLUDED.pack_size_value,
        pack_size_unit = EXCLUDED.pack_size_unit,
        brand = EXCLUDED.brand,
        units_per_packet = EXCLUDED.units_per_packet,
        packets_per_case = EXCLUDED.packets_per_case,
        units_per_case = EXCLUDED.units_per_case,
        preferred_sell_unit = EXCLUDED.preferred_sell_unit,
        is_chain_item = EXCLUDED.is_chain_item,
        is_mrp_priced = EXCLUDED.is_mrp_priced,
        chain_mrp_label = EXCLUDED.chain_mrp_label,
        target_margin_basic = EXCLUDED.target_margin_basic,
        target_margin_premium = EXCLUDED.target_margin_premium,
        target_margin_gold = EXCLUDED.target_margin_gold,
        target_margin_silver = EXCLUDED.target_margin_silver,
        target_margin_bronze = EXCLUDED.target_margin_bronze,
        min_stock = EXCLUDED.min_stock,
        batch_number = EXCLUDED.batch_number,
        description = EXCLUDED.description,
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING id INTO v_product_id;
      
      -- Handle Opening Stock (only if inventory doesn't exist)
      IF NOT EXISTS (SELECT 1 FROM public.inventory WHERE product_id = v_product_id) THEN
        v_opening_stock := COALESCE((v_row->>'opening_stock')::NUMERIC, (v_row->'inventory'->>'stock_base_units')::NUMERIC, 0);
        
        INSERT INTO public.inventory (product_id, quantity, updated_at)
        VALUES (v_product_id, v_opening_stock, now());
        
        INSERT INTO public.stock_ledger (product_id, reference_type, reference_id, base_units_delta, stock_after, created_by)
        VALUES (v_product_id, 'import', 'initial', v_opening_stock, v_opening_stock, p_user_id);
        
        v_imported_count := v_imported_count + 1;
      ELSE
        v_updated_count := v_updated_count + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      IF NOT p_skip_errors THEN RAISE; END IF;
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
