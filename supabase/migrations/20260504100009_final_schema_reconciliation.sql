
-- Migration: Final Schema Reconciliation and Import Engine Fix
-- This migration standardizes the stock_ledger table to resolve conflicts between different engine versions.

DO $body$ 
BEGIN
  -- 1. Resolve reference_id type mismatch
  -- We force it to TEXT to support 'initial', 'import-xxx', and UUID strings.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'stock_ledger' AND column_name = 'reference_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.stock_ledger ALTER COLUMN reference_id TYPE TEXT USING reference_id::TEXT;
  END IF;

  -- 2. Standardize quantity columns
  -- Some versions used qty_change, others base_units_delta, others qty_transacted
  -- We will ensure base_units_delta and qty_transacted both exist and are used synonymously.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'qty_transacted') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN qty_transacted NUMERIC(15,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'base_units_delta') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN base_units_delta NUMERIC(15,2) DEFAULT 0;
  END IF;

  -- 3. Resolve stock_after / balance_after naming
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'stock_after') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'balance_after') THEN
      ALTER TABLE public.stock_ledger RENAME COLUMN balance_after TO stock_after;
    ELSE
      ALTER TABLE public.stock_ledger ADD COLUMN stock_after NUMERIC(15,2) DEFAULT 0;
    END IF;
  END IF;

  -- 4. Set Defaults to prevent NOT NULL violations in legacy functions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'stock_before') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN stock_before NUMERIC(15,2) DEFAULT 0;
  END IF;

  ALTER TABLE public.stock_ledger ALTER COLUMN qty_transacted SET DEFAULT 0;
  ALTER TABLE public.stock_ledger ALTER COLUMN base_units_delta SET DEFAULT 0;
  ALTER TABLE public.stock_ledger ALTER COLUMN stock_after SET DEFAULT 0;
  ALTER TABLE public.stock_ledger ALTER COLUMN stock_before SET DEFAULT 0;
  
  -- Ensure they are NOT NULL if they have defaults
  ALTER TABLE public.stock_ledger ALTER COLUMN qty_transacted SET NOT NULL;
  ALTER TABLE public.stock_ledger ALTER COLUMN base_units_delta SET NOT NULL;
  ALTER TABLE public.stock_ledger ALTER COLUMN stock_after SET NOT NULL;
  ALTER TABLE public.stock_ledger ALTER COLUMN stock_before SET NOT NULL;

END $body$;

-- 5. Drop all existing versions of confirm_product_import to avoid signature conflicts
DO $body$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 'public.' || proname || '(' || pg_get_function_identity_arguments(oid) || ')' as sig 
        FROM pg_proc 
        WHERE proname = 'confirm_product_import' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) 
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig;
    END LOOP;
END $body$;

-- 6. Definitive confirm_product_import implementation
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
    BEGIN
      v_sku := v_row->>'sku';
      IF v_sku IS NULL OR v_sku = '' THEN CONTINUE; END IF;
      
      -- Normalize enum values for public.pack_type
      v_item_pack_type := lower(COALESCE(v_row->>'item_pack_type', 'packet'));
      IF v_item_pack_type IN ('pkt', 'pouch', 'packet') THEN v_item_pack_type := 'packet'; END IF;
      IF v_item_pack_type IN ('pcs', 'pc', 'unit') THEN v_item_pack_type := 'unit'; END IF;
      IF v_item_pack_type IN ('carton', 'box', 'case') THEN v_item_pack_type := 'case'; END IF;
      IF v_item_pack_type NOT IN ('unit', 'packet', 'case') THEN v_item_pack_type := 'packet'; END IF;

      v_preferred_unit := lower(COALESCE(v_row->>'preferred_sell_unit', 'packet'));
      IF v_preferred_unit IN ('pkt', 'pouch', 'packet') THEN v_preferred_unit := 'packet'; END IF;
      IF v_preferred_unit IN ('pcs', 'pc', 'unit') THEN v_preferred_unit := 'unit'; END IF;
      IF v_preferred_unit IN ('carton', 'box', 'case') THEN v_preferred_unit := 'case'; END IF;
      IF v_preferred_unit NOT IN ('unit', 'packet', 'case') THEN v_preferred_unit := 'packet'; END IF;

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
        COALESCE(v_row->>'name', 'Unknown Product'),
        v_sku,
        COALESCE((v_row->>'mrp')::NUMERIC, 0),
        COALESCE((v_row->>'gst_rate')::NUMERIC, 0),
        v_row->>'division_category',
        v_row->>'sub_category',
        v_row->>'division',
        v_row->>'hsn',
        v_item_pack_type::public.pack_type,
        COALESCE((v_row->>'pack_size_value')::NUMERIC, 0),
        v_row->>'pack_size_unit',
        COALESCE(v_row->>'brand', 'Bharat Masala'),
        COALESCE((v_row->>'units_per_packet')::INT, 1),
        COALESCE((v_row->>'packets_per_case')::INT, 1),
        COALESCE((v_row->>'units_per_case')::INT, 1),
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
        v_opening_stock := COALESCE(
          (v_row->>'opening_stock')::NUMERIC, 
          (v_row->'inventory'->>'stock_base_units')::NUMERIC, 
          0
        );
        
        INSERT INTO public.inventory (product_id, quantity, updated_at)
        VALUES (v_product_id, v_opening_stock, now())
        ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
        
        -- Explicit insert into stock_ledger using standardized columns
        INSERT INTO public.stock_ledger (
          product_id, 
          reference_type, 
          reference_id, 
          base_units_delta, 
          qty_transacted, 
          stock_before,
          stock_after, 
          created_by
        ) VALUES (
          v_product_id, 
          'import', 
          'initial', 
          v_opening_stock, 
          v_opening_stock, 
          0,
          v_opening_stock, 
          v_final_user_id
        );
        
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
