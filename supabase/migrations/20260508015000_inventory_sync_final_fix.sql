
-- FINAL INVENTORY SYNC FIX
-- This migration ensures that dispatch_order and revert_order_to_approved are warehouse-aware
-- and always keep the inventory table in sync with the batches.

-- 1. Re-define revert_order_to_approved with correct inventory sync
CREATE OR REPLACE FUNCTION public.revert_order_to_approved(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_deduction RECORD;
  v_order_status TEXT;
  v_product_id UUID;
BEGIN
  -- Lock the order
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order_status IN ('draft', 'pending_approval', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is already in a pre-dispatch state.');
  END IF;

  IF v_order_status = 'cancelled' THEN
     RETURN jsonb_build_object('success', false, 'error', 'Cannot revert a cancelled order.');
  END IF;

  -- Restore batch stock if it was dispatched or delivered
  FOR v_deduction IN SELECT * FROM order_batch_deductions WHERE order_id = p_order_id FOR UPDATE LOOP
    -- Get product_id before we might lose items (though item deletion happens after this RPC)
    SELECT product_id INTO v_product_id FROM order_items WHERE id = v_deduction.order_item_id;

    -- Restore Stock
    UPDATE inventory_batches 
    SET remaining_qty = remaining_qty + v_deduction.qty_base_units 
    WHERE id = v_deduction.batch_id;

    -- Record Reversal Ledger
    INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, reference_type, created_by, notes)
    VALUES (
      v_product_id,
      v_deduction.batch_id,
      v_deduction.qty_base_units,
      'reversal',
      p_order_id,
      'order',
      auth.uid(),
      'Order Reverted to Approved (Edit Mode)'
    );
    
    -- Sync aggregate inventory for THIS product and warehouse
    PERFORM public.recompute_inventory(v_product_id);
  END LOOP;
  
  -- Clean up deductions record
  DELETE FROM order_batch_deductions WHERE order_id = p_order_id;

  -- Reset status to approved and clear dispatch/delivery timestamps
  UPDATE orders 
  SET status = 'approved',
      dispatched_at = NULL,
      delivered_at = NULL,
      delivery_note = NULL
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$body$;

-- 2. Re-define dispatch_order with correct inventory sync
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

-- 3. Robust Recompute Functions
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id UUID)
RETURNS void AS $body$
BEGIN
  -- Ensure we cover all warehouses that have ever had this product or just all warehouses
  WITH warehouse_stock AS (
    SELECT w.id as warehouse_id, COALESCE(SUM(ib.remaining_qty), 0) as total
    FROM public.warehouses w
    LEFT JOIN public.inventory_batches ib ON ib.warehouse_id = w.id AND ib.product_id = _product_id
    GROUP BY w.id
  )
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
  SELECT _product_id, warehouse_id, total, now()
  FROM warehouse_stock
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.recompute_all_inventory()
RETURNS boolean AS $body$
BEGIN
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
  SELECT p.id, w.id, COALESCE(SUM(ib.remaining_qty), 0), now()
  FROM public.products p
  CROSS JOIN public.warehouses w
  LEFT JOIN public.inventory_batches ib ON ib.product_id = p.id AND ib.warehouse_id = w.id
  GROUP BY p.id, w.id
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Run a full recompute to fix any existing discrepancies
SELECT public.recompute_all_inventory();
