
-- FIX CONVERSION OVERLOADS (DEFINITIVE)
-- This migration ensures that convert_to_base_units exists for all common parameter types 
-- and correctly handles the pack_type enum to text casting.

-- 1. Text version (The core logic)
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID, 
  p_qty NUMERIC, 
  p_unit TEXT
)
RETURNS NUMERIC AS $body$
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

  IF v_unit_type = 'kg_g' AND v_weight_per_unit_g > 0 THEN
    CASE v_unit
      WHEN 'pcs', 'unit', 'pc', 'pouch', 'packet', 'pkt' THEN v_result := p_qty;
      WHEN 'case' THEN v_result := p_qty * v_units_per_case;
      WHEN 'g', 'gms', 'gm' THEN v_result := p_qty / v_weight_per_unit_g;
      WHEN 'kg' THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
      WHEN 'ml' THEN v_result := p_qty / v_weight_per_unit_g;
      WHEN 'ltr', 'l' THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
      ELSE v_result := p_qty;
    END CASE;
  ELSE
    CASE v_unit
      WHEN 'pcs', 'unit', 'pc' THEN v_result := p_qty;
      WHEN 'packet', 'pkt' THEN v_result := p_qty * v_units_per_packet;
      WHEN 'case' THEN v_result := p_qty * v_units_per_case;
      WHEN 'kg', 'ltr', 'l' THEN 
        IF v_unit_type = 'kg_g' THEN v_result := p_qty * 1000.0; ELSE v_result := p_qty; END IF;
      ELSE v_result := p_qty;
    END CASE;
  END IF;

  RETURN ROUND(v_result, 4);
END;
$body$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Pack Type Enum Overload
DO $body$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type') THEN
    CREATE OR REPLACE FUNCTION public.convert_to_base_units(
      p_product_id UUID, 
      p_qty NUMERIC, 
      p_unit public.pack_type
    )
    RETURNS NUMERIC AS $f$
    BEGIN
      RETURN public.convert_to_base_units(p_product_id, p_qty, p_unit::TEXT);
    END;
    $f$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  END IF;
END $body$;

-- 3. Sell Unit Enum Overload (if it exists)
DO $body$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sell_unit') THEN
    CREATE OR REPLACE FUNCTION public.convert_to_base_units(
      p_product_id UUID, 
      p_qty NUMERIC, 
      p_unit public.sell_unit
    )
    RETURNS NUMERIC AS $f$
    BEGIN
      RETURN public.convert_to_base_units(p_product_id, p_qty, p_unit::TEXT);
    END;
    $f$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
  END IF;
END $body$;

-- 4. Update dispatch_order to use TEXT cast explicitly everywhere
CREATE OR REPLACE FUNCTION public.dispatch_order(p_order_id UUID, p_dispatched_at TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_item RECORD;
  v_batch RECORD;
  v_needed NUMERIC;
  v_deducted NUMERIC;
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF v_status IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found'); END IF;
  
  IF v_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order must be approved. Current status: ' || v_status);
  END IF;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    -- Using ::TEXT ensures we hit the correct core function regardless of enum type
    v_needed := public.convert_to_base_units(v_item.product_id, v_item.quantity, v_item.pack_type::TEXT);
    
    FOR v_batch IN 
      SELECT id, remaining_qty FROM inventory_batches 
      WHERE product_id = v_item.product_id AND remaining_qty > 0 
      ORDER BY received_at ASC, created_at ASC FOR UPDATE
    LOOP
      IF v_needed <= 0 THEN EXIT; END IF;
      v_deducted := LEAST(v_needed, v_batch.remaining_qty);
      
      UPDATE inventory_batches SET remaining_qty = remaining_qty - v_deducted WHERE id = v_batch.id;
      
      INSERT INTO order_batch_deductions (order_id, order_item_id, batch_id, qty_base_units)
      VALUES (p_order_id, v_item.id, v_batch.id, v_deducted);
      
      INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, reference_type, created_by, notes)
      VALUES (v_item.product_id, v_batch.id, -v_deducted, 'dispatch', p_order_id, 'order', auth.uid(), 'Order Dispatched');
      
      v_needed := v_needed - v_deducted;
    END LOOP;
    
    IF v_needed > 0 THEN RAISE EXCEPTION 'Insufficient stock for Order Item %', v_item.id; END IF;
    
    -- Sync aggregate inventory (Warehouse Aware)
    PERFORM public.recompute_inventory(v_item.product_id);
  END LOOP;

  UPDATE orders SET status = 'dispatched', dispatched_at = COALESCE(p_dispatched_at, now()) WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true);
END;
$body$;
