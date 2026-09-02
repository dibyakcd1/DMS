
-- Migration: Enhanced Product Logic for Pack Types and Case Types
-- 2026-05-04

-- 1. Ensure columns for case_type and base_weight_unit exist
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS case_type TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_weight_unit TEXT;

-- 2. Update the Import Engine with requested logic
CREATE OR REPLACE FUNCTION public.confirm_product_import(
  p_rows JSONB,
  p_skip_errors BOOLEAN DEFAULT TRUE,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $body$
DECLARE
  v_row JSONB;
  v_product_id UUID;
  v_imported_count INT := 0;
  v_updated_count INT := 0;
  v_skipped_count INT := 0;
  v_failed_rows JSONB := '[]'::jsonb;
  v_opening_stock NUMERIC;
  v_final_user_id UUID;
  v_sku TEXT;
BEGIN
  v_final_user_id := COALESCE(p_user_id, auth.uid());

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    DECLARE
      v_item_pack_type TEXT;
      v_preferred_unit TEXT;
      v_case_type TEXT;
      v_bw_unit TEXT;
    BEGIN
      v_sku := v_row->>'sku';
      IF v_sku IS NULL OR v_sku = '' THEN CONTINUE; END IF;
      
      -- 1. Normalize Item Pack Type
      v_item_pack_type := lower(COALESCE(v_row->>'item_pack_type', 'packet'));
      
      -- 2. Logic: Case Type
      -- If Pouch or Bag then 'bag', else 'carton'
      IF v_item_pack_type IN ('pouch', 'bag', 'sachet', 'pkt', 'packet') THEN
        v_case_type := 'bag';
      ELSE
        v_case_type := 'carton';
      END IF;

      -- 3. Logic: Base Weight Unit
      -- Only applicable to Pouch (use g/gms), others are often pcs/unit
      IF v_item_pack_type = 'pouch' THEN
        v_bw_unit := 'g';
      ELSE
        v_bw_unit := 'pcs';
      END IF;

      -- Normalize enum values for columns that use public.pack_type
      -- (Keeping the enum for preferred_sell_unit for backward compatibility)
      v_preferred_unit := lower(COALESCE(v_row->>'preferred_sell_unit', 'packet'));
      IF v_preferred_unit IN ('pkt', 'pouch', 'packet', 'sachet') THEN v_preferred_unit := 'packet'; END IF;
      IF v_preferred_unit IN ('pcs', 'pc', 'unit', 'jar', 'bottle', 'tin', 'can') THEN v_preferred_unit := 'unit'; END IF;
      IF v_preferred_unit IN ('carton', 'box', 'case') THEN v_preferred_unit := 'case'; END IF;
      IF v_preferred_unit NOT IN ('unit', 'packet', 'case') THEN v_preferred_unit := 'packet'; END IF;

      -- UPSERT Product
      INSERT INTO public.products (
        name, sku, mrp, gst_rate, 
        division_category, sub_category, division, 
        hsn, brand, unit, base_unit,
        item_pack_type_legacy, -- Using a legacy/text slot if item_pack_type is still stuck as enum
        item_pack_type, -- This might fail if it's still a strict enum 'packet'|'unit'|'case'
        pack_size_value, pack_size_unit,
        units_per_packet, packets_per_case, units_per_case, 
        case_qty_value, case_qty_unit,
        case_type, base_weight_unit,
        preferred_sell_unit, is_chain_item, is_mrp_priced, chain_mrp_label,
        target_margin_basic, target_margin_premium, target_margin_gold, 
        target_margin_silver, target_margin_bronze,
        min_stock, batch_number, description, is_active, updated_at
      ) VALUES (
        COALESCE(v_row->>'name', 'Unknown Product'),
        v_sku,
        COALESCE((v_row->>'mrp')::NUMERIC, 0),
        COALESCE((v_row->>'gst_rate')::NUMERIC, 0),
        v_row->>'division_category',
        v_row->>'sub_category',
        v_row->>'division',
        v_row->>'hsn',
        COALESCE(v_row->>'brand', 'Bharat Masala'),
        v_row->>'unit',
        v_row->>'base_unit',
        v_item_pack_type, -- Store the raw type
        CASE 
          WHEN v_item_pack_type IN ('unit', 'packet', 'case') THEN v_item_pack_type::public.pack_type 
          ELSE 'packet'::public.pack_type 
        END,
        COALESCE((v_row->>'pack_size_value')::NUMERIC, 0),
        v_row->>'pack_size_unit',
        COALESCE((v_row->>'units_per_packet')::INT, 1),
        COALESCE((v_row->>'packets_per_case')::INT, 1),
        COALESCE((v_row->>'units_per_case')::INT, 1),
        (v_row->>'case_qty_value')::NUMERIC,
        v_row->>'case_qty_unit',
        v_case_type,
        v_bw_unit,
        v_preferred_unit::public.pack_type,
        COALESCE((v_row->>'is_chain_item')::BOOLEAN, FALSE),
        COALESCE((v_row->>'is_mrp_priced')::BOOLEAN, FALSE),
        v_row->>'chain_mrp_label',
        COALESCE((v_row->>'target_margin_basic')::NUMERIC, 15),
        COALESCE((v_row->>'target_margin_premium')::NUMERIC, 3),
        COALESCE((v_row->>'target_margin_gold')::NUMERIC, 5),
        COALESCE((v_row->>'target_margin_silver')::NUMERIC, 7),
        COALESCE((v_row->>'target_margin_bronze')::NUMERIC, 10),
        COALESCE((v_row->>'min_stock')::NUMERIC, 0),
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
        brand = EXCLUDED.brand,
        unit = EXCLUDED.unit,
        base_unit = EXCLUDED.base_unit,
        item_pack_type = EXCLUDED.item_pack_type,
        pack_size_value = EXCLUDED.pack_size_value,
        pack_size_unit = EXCLUDED.pack_size_unit,
        units_per_packet = EXCLUDED.units_per_packet,
        packets_per_case = EXCLUDED.packets_per_case,
        units_per_case = EXCLUDED.units_per_case,
        case_qty_value = EXCLUDED.case_qty_value,
        case_qty_unit = EXCLUDED.case_qty_unit,
        case_type = EXCLUDED.case_type,
        base_weight_unit = EXCLUDED.base_weight_unit,
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
      
      -- Inventory handling...
      IF NOT EXISTS (SELECT 1 FROM public.inventory WHERE product_id = v_product_id) THEN
        v_opening_stock := COALESCE((v_row->>'opening_stock')::NUMERIC, 0);
        INSERT INTO public.inventory (product_id, quantity, updated_at) VALUES (v_product_id, v_opening_stock, now());
        INSERT INTO public.stock_ledger (product_id, reference_type, reference_id, base_units_delta, qty_transacted, stock_before, stock_after, created_by)
        VALUES (v_product_id, 'import', 'initial', v_opening_stock, v_opening_stock, 0, v_opening_stock, v_final_user_id);
        v_imported_count := v_imported_count + 1;
      ELSE
        v_updated_count := v_updated_count + 1;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      IF NOT p_skip_errors THEN RAISE; END IF;
      v_failed_rows := v_failed_rows || jsonb_build_object('sku', v_sku, 'error', SQLERRM);
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
$body$;
