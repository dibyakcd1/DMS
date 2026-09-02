
-- Migration: Update Product Import RPC to handle standardized units
-- 2026-05-05

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
      v_name TEXT;
      v_ipt TEXT;
      v_preferred_unit TEXT;
      v_case_type TEXT;
      v_bw_unit TEXT;
      v_pack_unit TEXT;
    BEGIN
      v_sku := v_row->>'sku';
      IF v_sku IS NULL OR v_sku = '' THEN CONTINUE; END IF;
      
      v_name := COALESCE(v_row->>'name', 'Unknown Product');
      
      -- ITEM PACK TYPE LOGIC
      v_ipt := COALESCE(v_row->>'item_pack_type', 'Packet');
      
      -- CASE TYPE LOGIC
      IF lower(v_ipt) ~* '(pouch|bag|sachet|pkt|packet)' THEN
        v_case_type := 'bag';
      ELSE
        v_case_type := 'carton';
      END IF;

      -- PACK SIZE UNIT STANDARDIZATION
      v_pack_unit := lower(COALESCE(v_row->>'pack_size_unit', ''));
      IF v_pack_unit IN ('g', 'gms', '.gms', 'g.', 'gms.') THEN
        v_pack_unit := 'g';
      ELSIF v_pack_unit = 'kg' THEN
        v_pack_unit := 'Kg';
      END IF;

      -- BASE WEIGHT UNIT LOGIC (Prefer standardized incoming value)
      v_bw_unit := v_row->>'base_weight_unit';
      IF v_bw_unit IS NULL THEN
        -- Fallback logic
        IF v_pack_unit IN ('g', 'Kg') THEN
          v_bw_unit := v_pack_unit;
        ELSE
          v_bw_unit := NULL;
        END IF;
      ELSE
        -- Standardize base_weight_unit too
        IF lower(v_bw_unit) IN ('g', 'gms', '.gms', 'g.', 'gms.') THEN
          v_bw_unit := 'g';
        ELSIF lower(v_bw_unit) = 'kg' THEN
          v_bw_unit := 'Kg';
        END IF;
      END IF;

      -- PREFERRED SELL UNIT (Enum-constrained logic)
      v_preferred_unit := lower(COALESCE(v_row->>'preferred_sell_unit', 'packet'));
      IF v_preferred_unit IN ('pkt', 'pouch', 'packet', 'sachet') THEN v_preferred_unit := 'packet'; END IF;
      IF v_preferred_unit IN ('pcs', 'pc', 'unit', 'jar', 'bottle', 'tin', 'can', 'acb', 'jar') THEN v_preferred_unit := 'unit'; END IF;
      IF v_preferred_unit IN ('carton', 'box', 'case') THEN v_preferred_unit := 'case'; END IF;
      -- Ensure it falls into the enum values (packet, unit, case, kg)
      IF v_preferred_unit NOT IN ('unit', 'packet', 'case', 'kg') THEN v_preferred_unit := 'packet'; END IF;

      -- CHAIN PACK DETECTION
      DECLARE
        v_is_chain BOOLEAN;
        v_is_mrp_priced BOOLEAN;
        v_has_pcs BOOLEAN;
        v_final_chain_label TEXT := NULL;
      BEGIN
        v_is_chain := COALESCE(
          (v_row->>'is_chain_item')::BOOLEAN, 
          (v_name ~* '(chain pack|cb item|chainpack)' AND v_name !~* '\[ACB\]')
        );

        IF COALESCE((v_row->>'mrp')::NUMERIC, 0) > 0 THEN
          v_is_mrp_priced := TRUE;
        ELSE
          v_is_mrp_priced := v_is_chain;
        END IF;

        IF v_is_chain THEN
          v_final_chain_label := v_row->>'chain_mrp_label';
          IF v_final_chain_label IS NULL OR v_final_chain_label = '' THEN
            v_final_chain_label := substring(v_name from '(?i)(Rs\.?|Re\.?)\s*\d+\s*\/-(\s*\(\d+pc\))?');
          END IF;
        END IF;

        -- PREFERRED SELL UNIT Rule refinement
        v_has_pcs := v_name ~* '(\d+pc|pcs)';
        IF v_has_pcs THEN
          v_preferred_unit := 'packet';
        ELSIF lower(v_ipt) ~* '(jar|bottle|tin|acb)' THEN
          v_preferred_unit := 'unit';
        END IF;

        -- UPSERT Product
        INSERT INTO public.products (
          name, sku, mrp, gst_rate, 
          division_category, sub_category, division, 
          hsn, brand, unit, base_unit,
          item_pack_type,
          pack_size_value, pack_size_unit,
          units_per_packet, packets_per_case, units_per_case, 
          case_qty_value, case_qty_unit,
          case_type, base_weight_unit,
          preferred_sell_unit,
          is_chain_item, is_mrp_priced, chain_mrp_label,
          target_margin_basic, target_margin_premium, target_margin_gold, target_margin_silver, target_margin_bronze,
          min_stock, batch_number, is_active, updated_at
        ) VALUES (
          v_name,
          v_sku,
          COALESCE((v_row->>'mrp')::NUMERIC, 0),
          COALESCE((v_row->>'gst_rate')::NUMERIC, 0),
          v_row->>'division_category',
          v_row->>'sub_category',
          v_row->>'division',
          v_row->>'hsn',
          COALESCE(v_row->>'brand', 'Bharat Masala'),
          COALESCE(v_row->>'unit', v_row->>'base_unit'),
          COALESCE(v_row->>'base_unit', v_row->>'unit'),
          v_ipt,
          COALESCE((v_row->>'pack_size_value')::NUMERIC, 0),
          v_pack_unit,
          COALESCE((v_row->>'units_per_packet')::INT, 1),
          COALESCE((v_row->>'packets_per_case')::INT, 1),
          COALESCE((v_row->>'units_per_case')::INT, 1),
          (v_row->>'case_qty_value')::NUMERIC,
          COALESCE(v_row->>'case_qty_unit', 'unit'),
          v_case_type,
          v_bw_unit,
          v_preferred_unit::public.pack_type,
          v_is_chain,
          v_is_mrp_priced,
          v_final_chain_label,
          COALESCE((v_row->>'target_margin_basic')::NUMERIC, 15),
          COALESCE((v_row->>'target_margin_premium')::NUMERIC, 3),
          COALESCE((v_row->>'target_margin_gold')::NUMERIC, 5),
          COALESCE((v_row->>'target_margin_silver')::NUMERIC, 7),
          COALESCE((v_row->>'target_margin_bronze')::NUMERIC, 10),
          COALESCE((v_row->>'min_stock')::NUMERIC, 0),
          v_row->>'batch_number',
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
          is_active = EXCLUDED.is_active,
          updated_at = now()
        RETURNING id INTO v_product_id;
      END;
      
      -- Inventory
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
