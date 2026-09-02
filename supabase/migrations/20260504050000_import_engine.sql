
-- Migration: Product Import Engine (confirm_product_import RPC)

CREATE OR REPLACE FUNCTION public.confirm_product_import(
  p_rows JSONB,
  p_skip_errors BOOLEAN DEFAULT TRUE,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  v_row JSONB;
  v_imported_count INT := 0;
  v_updated_count INT := 0;
  v_skipped_count INT := 0;
  v_failed_rows JSONB := '[]'::JSONB;
  v_product_id UUID;
  v_existing_id UUID;
  v_errors TEXT;
BEGIN
  -- Iterate through rows
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      -- Check if product exists by SKU
      SELECT id INTO v_existing_id FROM public.products WHERE sku = (v_row->>'sku');

      IF v_existing_id IS NOT NULL THEN
        -- UPDATE Product (Keep stock untouched, update metadata)
        UPDATE public.products
        SET
          name = COALESCE(v_row->>'name', name),
          mrp = COALESCE((v_row->>'mrp')::NUMERIC, mrp),
          gst_rate = COALESCE((v_row->>'gst_rate')::NUMERIC, gst_rate),
          hsn = COALESCE(v_row->>'hsn', hsn),
          division_category = COALESCE(v_row->>'division_category', division_category),
          division = COALESCE(v_row->>'division', division),
          brand = COALESCE(v_row->>'brand', brand),
          item_pack_type = COALESCE((v_row->>'item_pack_type')::public.item_pack_type, item_pack_type),
          pack_size_value = COALESCE((v_row->>'pack_size_value')::NUMERIC, pack_size_value),
          pack_size_unit = COALESCE(v_row->>'pack_size_unit', pack_size_unit),
          base_unit = COALESCE(v_row->>'base_unit', base_unit),
          units_per_packet = COALESCE((v_row->>'units_per_packet')::INT, units_per_packet),
          packets_per_case = COALESCE((v_row->>'packets_per_case')::INT, packets_per_case),
          units_per_case = COALESCE((v_row->>'units_per_case')::INT, units_per_case),
          case_qty_value = COALESCE((v_row->>'case_qty_value')::NUMERIC, case_qty_value),
          case_qty_unit = COALESCE(v_row->>'case_qty_unit', case_qty_unit),
          preferred_sell_unit = COALESCE((v_row->>'preferred_sell_unit')::public.item_pack_type, preferred_sell_unit),
          min_stock = COALESCE((v_row->>'min_stock')::INT, min_stock),
          is_chain_item = COALESCE((v_row->>'is_chain_item')::BOOLEAN, is_chain_item),
          is_mrp_priced = COALESCE((v_row->>'is_mrp_priced')::BOOLEAN, is_mrp_priced),
          chain_mrp_label = COALESCE(v_row->>'chain_mrp_label', chain_mrp_label),
          updated_at = NOW()
        WHERE id = v_existing_id;
        
        v_updated_count := v_updated_count + 1;
        v_product_id := v_existing_id;
      ELSE
        -- INSERT New Product
        INSERT INTO public.products (
          name, sku, mrp, gst_rate, hsn, division_category, division, brand,
          item_pack_type, pack_size_value, pack_size_unit, base_unit,
          units_per_packet, packets_per_case, units_per_case,
          case_qty_value, case_qty_unit, preferred_sell_unit, min_stock,
          is_chain_item, is_mrp_priced, chain_mrp_label
        ) VALUES (
          v_row->>'name',
          v_row->>'sku',
          COALESCE((v_row->>'mrp')::NUMERIC, 0),
          COALESCE((v_row->>'gst_rate')::NUMERIC, 0),
          v_row->>'hsn',
          v_row->>'division_category',
          v_row->>'division',
          v_row->>'brand',
          COALESCE((v_row->>'item_pack_type')::public.item_pack_type, 'packet'),
          (v_row->>'pack_size_value')::NUMERIC,
          v_row->>'pack_size_unit',
          v_row->>'base_unit',
          COALESCE((v_row->>'units_per_packet')::INT, 1),
          COALESCE((v_row->>'packets_per_case')::INT, 1),
          COALESCE((v_row->>'units_per_case')::INT, 1),
          (v_row->>'case_qty_value')::NUMERIC,
          v_row->>'case_qty_unit',
          COALESCE((v_row->>'preferred_sell_unit')::public.item_pack_type, 'packet'),
          COALESCE((v_row->>'min_stock')::INT, 0),
          COALESCE((v_row->>'is_chain_item')::BOOLEAN, FALSE),
          COALESCE((v_row->>'is_mrp_priced')::BOOLEAN, FALSE),
          v_row->>'chain_mrp_label'
        ) RETURNING id INTO v_product_id;

        -- Initialize Inventory if provided
        IF (v_row->'inventory'->>'stock_base_units') IS NOT NULL AND (v_row->'inventory'->>'stock_base_units')::NUMERIC > 0 THEN
          INSERT INTO public.inventory (product_id, quantity)
          VALUES (v_product_id, (v_row->'inventory'->>'stock_base_units')::NUMERIC);
          
          -- Record initial ledger entry
          INSERT INTO public.stock_ledger (product_id, qty_change, unit, type, reference_type, reference_id, balance_after)
          VALUES (
            v_product_id, 
            (v_row->'inventory'->>'stock_base_units')::NUMERIC, 
            'unit', 
            'IN', 
            'INITIAL_IMPORT', 
            'IMPORT-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'),
            (v_row->'inventory'->>'stock_base_units')::NUMERIC
          );
        ELSE
           INSERT INTO public.inventory (product_id, quantity)
           VALUES (v_product_id, 0);
        END IF;

        v_imported_count := v_imported_count + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_errors = MESSAGE_TEXT;
      v_failed_rows := v_failed_rows || jsonb_build_object(
        'sku', v_row->>'sku',
        'error', v_errors
      );
      v_skipped_count := v_skipped_count + 1;
      
      IF NOT p_skip_errors THEN
        RAISE EXCEPTION 'Import failed at SKU %: %', v_row->>'sku', v_errors;
      END IF;
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
