
-- FIX CONVERSION OVERLOADS
-- This migration adds overloads for convert_to_base_units to handle enums correctly.
-- It also fixes the dispatch_order function to explicitly cast types.

-- 1. Ensure we have a TEXT-based version (already exists but re-declaring to be safe)
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID, 
  p_qty NUMERIC, 
  p_unit TEXT
)
RETURNS NUMERIC AS $body$
DECLARE
  v_upp INTEGER;
  v_ppc INTEGER;
  v_upc INTEGER;
  v_psv NUMERIC;
  v_psu TEXT;
  v_cqv NUMERIC;
  v_cqu TEXT;
  v_normalized_unit TEXT;
BEGIN
  SELECT 
    units_per_packet, packets_per_case, units_per_case,
    pack_size_value, pack_size_unit,
    case_qty_value, case_qty_unit
  INTO v_upp, v_ppc, v_upc, v_psv, v_psu, v_cqv, v_cqu
  FROM public.products 
  WHERE id = p_product_id;
  
  v_psu := lower(COALESCE(v_psu, 'g'));
  v_cqu := lower(COALESCE(v_cqu, 'kg'));
  v_normalized_unit := lower(trim(p_unit));
  
  -- KG Handling
  IF v_normalized_unit = 'kg' THEN
    IF v_psu IN ('g', 'gms', 'gm', 'grams') AND COALESCE(v_psv, 0) > 0 THEN
      RETURN (p_qty * 1000.0) / v_psv;
    ELSIF v_psu IN ('kg', 'kgs', 'kilograms') AND COALESCE(v_psv, 0) > 0 THEN
      RETURN p_qty / v_psv;
    ELSE
      RETURN p_qty; 
    END IF;
  
  -- Packet Handling
  ELSIF v_normalized_unit IN ('packet', 'pkt', 'packets', 'pack') THEN
    RETURN p_qty * COALESCE(v_upp, 1);
  
  -- Case Handling
  ELSIF v_normalized_unit IN ('case', 'carton', 'ctn', 'box', 'bag') THEN
    IF (COALESCE(v_upp, 1) * COALESCE(v_ppc, 1)) > 1 THEN
      RETURN p_qty * (COALESCE(v_upp, 1) * COALESCE(v_ppc, 1));
    ELSIF COALESCE(v_upc, 1) > 1 THEN
      RETURN p_qty * v_upc;
    ELSIF COALESCE(v_cqv, 0) > 0 AND COALESCE(v_psv, 0) > 0 THEN
      IF v_cqu = 'kg' AND v_psu IN ('g', 'gms', 'gm', 'grams') THEN
        RETURN p_qty * ((v_cqv * 1000.0) / v_psv);
      ELSIF v_cqu = v_psu THEN
        RETURN p_qty * (v_cqv / v_psv);
      END IF;
    END IF;
    RETURN p_qty * COALESCE(v_ppc, 1);
    
  ELSE 
    RETURN p_qty;
  END IF;
END;
$body$ LANGUAGE plpgsql STABLE;

-- 2. Add overload for public.pack_type enum
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID, 
  p_qty NUMERIC, 
  p_unit public.pack_type
)
RETURNS NUMERIC AS $body$
BEGIN
  RETURN public.convert_to_base_units(p_product_id, p_qty, p_unit::TEXT);
END;
$body$ LANGUAGE plpgsql STABLE;

-- 3. Add overload for public.sell_unit enum (if it exists)
DO $body$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sell_unit') THEN
    EXECUTE 'CREATE OR REPLACE FUNCTION public.convert_to_base_units(
      p_product_id UUID, 
      p_qty NUMERIC, 
      p_unit public.sell_unit
    )
    RETURNS NUMERIC AS $f$
    BEGIN
      RETURN public.convert_to_base_units(p_product_id, p_qty, p_unit::TEXT);
    END;
    $f$ LANGUAGE plpgsql STABLE;';
  END IF;
END $body$;

-- 4. Update dispatch_order to be safer (using explicit text cast just in case)
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
  IF v_status NOT IN ('pending_approval', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order ' || v_status || ' cannot be dispatched.');
  END IF;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    -- Explicitly cast pack_type to text to match the standard function signature
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
    
    IF v_needed > 0 THEN RAISE EXCEPTION 'Insufficient stock in batches for Order Item %', v_item.id; END IF;
    PERFORM public.recompute_inventory(v_item.product_id);
  END LOOP;

  UPDATE orders SET status = 'dispatched', dispatched_at = COALESCE(p_dispatched_at, now()) WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true);
END;
$body$;
