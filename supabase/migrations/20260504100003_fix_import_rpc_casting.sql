
-- Migration: Fix RPC Casting and Expand Pack Type Enum
-- Addresses the 'expression is of type text' error during bulk import

-- 0. Ensure sub_category column exists
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sub_category TEXT;

-- 1. Expand the pack_type enum to include common material formats
-- This prevents 'invalid input value for enum' errors
ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'pouch';
ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'sachet';
ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'jar';
ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'bottle';
ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'bag';
ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'acb';
ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'box';
ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'tin';
ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'can';

-- 2. Re-create the confirm_product_import with explicit casting
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
    DECLARE
      v_item_pack_type TEXT;
      v_preferred_unit TEXT;
    BEGIN
      -- Sanitize pack types internally
      v_item_pack_type := lower(v_row->>'item_pack_type');
      IF v_item_pack_type IN ('pkt', 'pouch') THEN v_item_pack_type := 'packet'; END IF;
      IF v_item_pack_type IN ('pcs', 'pc') THEN v_item_pack_type := 'unit'; END IF;
      IF v_item_pack_type IN ('carton', 'box') THEN v_item_pack_type := 'case'; END IF;

      v_preferred_unit := lower(v_row->>'preferred_sell_unit');
      IF v_preferred_unit IN ('pkt', 'pouch') THEN v_preferred_unit := 'packet'; END IF;
      IF v_preferred_unit IN ('pcs', 'pc') THEN v_preferred_unit := 'unit'; END IF;
      IF v_preferred_unit IN ('carton', 'box') THEN v_preferred_unit := 'case'; END IF;

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
        COALESCE(v_item_pack_type, 'packet')::public.pack_type,
        (v_row->>'pack_size_value')::NUMERIC,
        v_row->>'pack_size_unit',
        COALESCE(v_row->>'brand', 'Bharat Masala'),
        (v_row->>'units_per_packet')::INT,
        (v_row->>'packets_per_case')::INT,
        (v_row->>'units_per_case')::INT,
        COALESCE(v_preferred_unit, 'packet')::public.pack_type,
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
