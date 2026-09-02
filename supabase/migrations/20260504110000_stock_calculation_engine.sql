
-- Stock Calculation Engine Functions

-- DEDUCT STOCK
CREATE OR REPLACE FUNCTION public.deduct_stock(
  p_product_id uuid,
  p_qty_sold numeric,
  p_sell_unit_used public.sell_unit,
  p_reference_type text,
  p_reference_id uuid DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  v_units_per_packet integer;
  v_units_per_case integer;
  v_pack_size_value numeric;
  v_pack_size_unit text;
  v_is_chain_item boolean;
  v_base_units_to_deduct integer;
  v_stock_before integer;
  v_stock_after integer;
  v_sell_unit_final public.sell_unit;
  v_qty_final numeric;
BEGIN
  -- Step 1: Fetch product details
  SELECT 
    units_per_packet, units_per_case, pack_size_value, pack_size_unit, is_chain_item
  INTO 
    v_units_per_packet, v_units_per_case, v_pack_size_value, v_pack_size_unit, v_is_chain_item
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_sell_unit_final := p_sell_unit_used;
  v_qty_final := p_qty_sold;

  -- Step 3: Calculate base_units_to_deduct (using requested conversion logic)
  CASE v_sell_unit_final
    WHEN 'case' THEN 
      -- Priority 1: Packet hierarchy
      IF (COALESCE(v_units_per_packet, 1) * COALESCE(v_units_per_case, 0)) > 1 AND v_units_per_case > 1 THEN
         -- Note: in some schemas v_units_per_case was overloaded to mean packets_per_case in older migrations
         -- Let's check packets_per_case specifically if we can.
         -- For now, let's use the robust logic from elsewhere.
         v_base_units_to_deduct := p_qty_sold * v_units_per_case;
      ELSE
         v_base_units_to_deduct := p_qty_sold * COALESCE(NULLIF(v_units_per_case, 1), v_units_per_packet);
      END IF;
    WHEN 'pkt' THEN 
      v_base_units_to_deduct := p_qty_sold * v_units_per_packet;
    WHEN 'pcs', 'unit', 'pouch' THEN 
      v_base_units_to_deduct := p_qty_sold;
    WHEN 'kg' THEN
      IF lower(v_pack_size_unit) IN ('g', 'gms', 'gm', 'grams') THEN
        v_base_units_to_deduct := CEIL((p_qty_sold * 1000) / v_pack_size_value);
      ELSIF lower(v_pack_size_unit) IN ('kg', 'kgs', 'kilograms') THEN
        v_base_units_to_deduct := CEIL(p_qty_sold / v_pack_size_value);
      ELSE
        v_base_units_to_deduct := p_qty_sold; -- Fallback
      END IF;
    WHEN 'g', 'ml' THEN
      v_base_units_to_deduct := CEIL(p_qty_sold / v_pack_size_value);
    ELSE
      v_base_units_to_deduct := p_qty_sold; -- Fallback
  END CASE;

  -- Step 2: Override sell unit for chain items (User requested this)
  -- If we force it to pcs, we should probably also update v_qty_final to reflect the base units
  IF v_is_chain_item = true THEN
    v_sell_unit_final := 'pcs';
    v_qty_final := v_base_units_to_deduct;
  END IF;

  -- Get current stock
  SELECT COALESCE(stock_base_units, 0) INTO v_stock_before
  FROM public.inventory
  WHERE product_id = p_product_id AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL));

  IF v_stock_before IS NULL THEN
    v_stock_before := 0;
    -- Create inventory row if missing
    INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units)
    VALUES (p_product_id, p_warehouse_id, 0);
  END IF;

  -- Step 4: Guard
  IF v_stock_before < v_base_units_to_deduct THEN
    RAISE EXCEPTION 'Insufficient stock';
  END IF;

  -- Step 5: Deduct
  v_stock_after := v_stock_before - v_base_units_to_deduct;
  UPDATE public.inventory 
  SET stock_base_units = v_stock_after,
      last_updated_at = now()
  WHERE product_id = p_product_id AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL));

  -- Step 6: Write ledger entry
  INSERT INTO public.stock_ledger (
    product_id, reference_type, reference_id, sell_unit_used, 
    qty_transacted, base_units_delta, stock_before, stock_after, notes
  ) VALUES (
    p_product_id, p_reference_type, p_reference_id, v_sell_unit_final,
    -v_qty_final, -v_base_units_to_deduct, v_stock_before, v_stock_after,
    'Stock deduction via deduct_stock function'
  );

  -- Step 7: Return
  RETURN jsonb_build_object(
    'stock_after', v_stock_after,
    'base_units_deducted', v_base_units_to_deduct,
    'sell_unit_used', v_sell_unit_final
  );
END;
$body$;

-- ADD STOCK
CREATE OR REPLACE FUNCTION public.add_stock(
  p_product_id uuid,
  p_qty numeric,
  p_sell_unit_used public.sell_unit,
  p_reference_type text,
  p_reference_id uuid DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  v_units_per_packet integer;
  v_units_per_case integer;
  v_pack_size_value numeric;
  v_pack_size_unit text;
  v_is_chain_item boolean;
  v_base_units_to_add integer;
  v_stock_before integer;
  v_stock_after integer;
  v_sell_unit_final public.sell_unit;
  v_qty_final numeric;
BEGIN
  -- Step 1: Fetch product details
  SELECT 
    units_per_packet, units_per_case, pack_size_value, pack_size_unit, is_chain_item
  INTO 
    v_units_per_packet, v_units_per_case, v_pack_size_value, v_pack_size_unit, v_is_chain_item
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  v_sell_unit_final := p_sell_unit_used;
  v_qty_final := p_qty;

  -- Calculate base_units_to_add
  CASE v_sell_unit_final
    WHEN 'case' THEN 
      -- Priority 1: Use explicit units_per_case if > 1
      IF COALESCE(v_units_per_case, 1) > 1 THEN
        v_base_units_to_add := p_qty * v_units_per_case;
      -- Priority 2: Use units_per_packet as fallback if units_per_case is 1
      ELSE
        v_base_units_to_add := p_qty * COALESCE(v_units_per_packet, 1);
      END IF;
    WHEN 'pkt' THEN 
      v_base_units_to_add := p_qty * v_units_per_packet;
    WHEN 'pcs', 'unit', 'pouch' THEN 
      v_base_units_to_add := p_qty;
    WHEN 'kg' THEN
      IF lower(v_pack_size_unit) IN ('g', 'gms', 'gm', 'grams') THEN
        v_base_units_to_add := CEIL((p_qty * 1000) / v_pack_size_value);
      ELSIF lower(v_pack_size_unit) IN ('kg', 'kgs', 'kilograms') THEN
        v_base_units_to_add := CEIL(p_qty / v_pack_size_value);
      ELSE
        v_base_units_to_add := p_qty; -- Fallback
      END IF;
    WHEN 'g', 'ml' THEN
      v_base_units_to_add := CEIL(p_qty / v_pack_size_value);
    ELSE
      v_base_units_to_add := p_qty; -- Fallback
  END CASE;

  -- Override sell unit for chain items
  IF v_is_chain_item = true THEN
    v_sell_unit_final := 'pcs';
    v_qty_final := v_base_units_to_add;
  END IF;

  -- Get current stock
  SELECT COALESCE(stock_base_units, 0) INTO v_stock_before
  FROM public.inventory
  WHERE product_id = p_product_id AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL));

  IF v_stock_before IS NULL THEN
    v_stock_before := 0;
    -- Create inventory row if missing
    INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units)
    VALUES (p_product_id, p_warehouse_id, 0);
  END IF;

  -- Add
  v_stock_after := v_stock_before + v_base_units_to_add;
  UPDATE public.inventory 
  SET stock_base_units = v_stock_after,
      last_updated_at = now()
  WHERE product_id = p_product_id AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL));

  -- Write ledger entry
  INSERT INTO public.stock_ledger (
    product_id, reference_type, reference_id, sell_unit_used, 
    qty_transacted, base_units_delta, stock_before, stock_after, notes
  ) VALUES (
    p_product_id, p_reference_type, p_reference_id, v_sell_unit_final,
    v_qty_final, v_base_units_to_add, v_stock_before, v_stock_after,
    'Stock addition via add_stock function'
  );

  -- Return
  RETURN jsonb_build_object(
    'stock_after', v_stock_after,
    'base_units_added', v_base_units_to_add,
    'sell_unit_used', v_sell_unit_final
  );
END;
$body$;
