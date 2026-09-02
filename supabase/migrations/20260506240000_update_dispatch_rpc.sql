
-- MIGRATION: Fix dispatch_order RPC and add parameter support for custom dates
-- This also grants execute permissions to handle the "schema cache" error.

-- 0. Drop existing to avoid signature conflicts
DROP FUNCTION IF EXISTS public.dispatch_order(UUID);
DROP FUNCTION IF EXISTS public.dispatch_order(UUID, TIMESTAMPTZ);

-- 1. Redefine dispatch_order with optional timestamp
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
  v_order_status TEXT;
BEGIN
  -- Lock the order
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order must be in approved status to dispatch. Current status: ' || v_order_status);
  END IF;

  -- Process each item in the order
  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    
    -- Calculate needed base units based on pack_type
    -- We need product details to calculate the multiplier
    DECLARE
      v_prod RECORD;
      v_multiplier NUMERIC;
    BEGIN
      SELECT 
        units_per_packet, packets_per_case, units_per_case, 
        pack_size_value, pack_size_unit,
        case_qty_value, case_qty_unit
      INTO v_prod 
      FROM products WHERE id = v_item.product_id;

      v_multiplier := 1;
      
      IF v_item.pack_type = 'case' THEN
        -- Priority 1: Use packets * units_per_packet IF it yields something > 1
        IF (COALESCE(v_prod.units_per_packet, 1) * COALESCE(v_prod.packets_per_case, 1)) > 1 THEN
          v_multiplier := (COALESCE(v_prod.units_per_packet, 1) * COALESCE(v_prod.packets_per_case, 1));
        -- Priority 2: Use explicit units_per_case
        ELSIF COALESCE(v_prod.units_per_case, 1) > 1 THEN
          v_multiplier := v_prod.units_per_case;
        -- Priority 3: Weight based fallback (e.g. Case of 16kg, Pack 500g)
        ELSIF COALESCE(v_prod.case_qty_value, 0) > 0 AND COALESCE(v_prod.pack_size_value, 0) > 0 THEN
          IF lower(v_prod.case_qty_unit) = 'kg' AND lower(v_prod.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') THEN
            v_multiplier := (v_prod.case_qty_value * 1000.0) / v_prod.pack_size_value;
          ELSIF lower(v_prod.case_qty_unit) = lower(v_prod.pack_size_unit) THEN
            v_multiplier := v_prod.case_qty_value / v_prod.pack_size_value;
          END IF;
        END IF;
        
      ELSIF v_item.pack_type = 'packet' THEN
        v_multiplier := COALESCE(v_prod.units_per_packet, 1);
        
      ELSIF v_item.pack_type = 'kg' THEN
        IF v_prod.pack_size_value > 0 THEN
          IF LOWER(v_prod.pack_size_unit) IN ('g', 'gms', 'grams', 'gm') THEN
            v_multiplier := 1000.0 / v_prod.pack_size_value;
          ELSIF LOWER(v_prod.pack_size_unit) IN ('kg', 'kgs', 'kilograms') THEN
            v_multiplier := 1.0 / v_prod.pack_size_value;
          END IF;
        END IF;
        
      ELSIF v_item.pack_type IN ('pouch', 'unit', 'pcs') THEN
        v_multiplier := 1;
      END IF;

      v_needed := v_item.quantity * COALESCE(v_multiplier, 1);
    END;
    
    -- Find available batches for this product (FIFO)
    FOR v_batch IN 
      SELECT id, remaining_qty 
      FROM inventory_batches 
      WHERE product_id = v_item.product_id AND remaining_qty > 0 
      ORDER BY received_at ASC, created_at ASC 
      FOR UPDATE
    LOOP
      IF v_needed <= 0 THEN EXIT; END IF;
      
      v_deducted := LEAST(v_needed, v_batch.remaining_qty);
      
      -- Update Batch
      UPDATE inventory_batches 
      SET remaining_qty = remaining_qty - v_deducted 
      WHERE id = v_batch.id;
      
      -- Record Deduction
      INSERT INTO order_batch_deductions (order_id, order_item_id, batch_id, qty_base_units)
      VALUES (p_order_id, v_item.id, v_batch.id, v_deducted);
      
      -- Record Ledger
      INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, reference_type, created_by)
      VALUES (v_item.product_id, v_batch.id, -v_deducted, 'dispatch', p_order_id, 'order', auth.uid());
      
      v_needed := v_needed - v_deducted;
    END LOOP;
    
    IF v_needed > 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product % during dispatch. Short by % units.', v_item.product_id, v_needed;
    END IF;
  END LOOP;

  -- Mark order as dispatched
  UPDATE orders 
  SET status = 'dispatched', 
      dispatched_at = COALESCE(p_dispatched_at, now()) 
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$body$;

-- 2. Explicitly grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.dispatch_order(UUID, TIMESTAMPTZ) TO authenticated;

-- 2.1 Ensure cancel_order exists and grant execute
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_deduction RECORD;
  v_order_status TEXT;
BEGIN
  -- Lock the order
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is already cancelled.');
  END IF;

  -- If it was dispatched, we must restore batch stock
  IF v_order_status = 'dispatched' OR v_order_status = 'delivered' THEN
    FOR v_deduction IN SELECT * FROM order_batch_deductions WHERE order_id = p_order_id FOR UPDATE LOOP
      -- Restore Stock
      UPDATE inventory_batches 
      SET remaining_qty = remaining_qty + v_deduction.qty_base_units 
      WHERE id = v_deduction.batch_id;

      -- Record Reversal Ledger
      INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, reference_type, created_by, notes)
      VALUES (
        (SELECT product_id FROM order_items WHERE id = v_deduction.order_item_id),
        v_deduction.batch_id,
        v_deduction.qty_base_units,
        'reversal',
        p_order_id,
        'order',
        auth.uid(),
        'Order Cancelled/Restored'
      );
    END LOOP;
    
    -- Clean up deductions record
    DELETE FROM order_batch_deductions WHERE order_id = p_order_id;
  END IF;

  -- Mark order as cancelled
  UPDATE orders 
  SET status = 'cancelled' 
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated;

-- 3. Redefine deliver_order with optional timestamp and note
CREATE OR REPLACE FUNCTION public.deliver_order(p_order_id UUID, p_delivered_at TIMESTAMPTZ DEFAULT now(), p_delivery_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_order_status TEXT;
BEGIN
  -- Lock the order
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order_status != 'dispatched' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order must be dispatched to mark as delivered. Current status: ' || v_order_status);
  END IF;

  -- Mark order as delivered
  UPDATE orders 
  SET status = 'delivered', 
      delivered_at = COALESCE(p_delivered_at, now()),
      delivery_note = p_delivery_note
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.deliver_order(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
