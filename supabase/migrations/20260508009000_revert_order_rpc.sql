
-- RPC to revert an order to approved status, restoring stock if it was already dispatched or delivered.
CREATE OR REPLACE FUNCTION public.revert_order_to_approved(p_order_id UUID)
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

  IF v_order_status IN ('draft', 'pending_approval', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is already in a pre-dispatch state.');
  END IF;

  IF v_order_status = 'cancelled' THEN
     RETURN jsonb_build_object('success', false, 'error', 'Cannot revert a cancelled order.');
  END IF;

  -- Restore batch stock if it was dispatched or delivered
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
      'Order Reverted to Approved (Edit Mode)'
    );
  END LOOP;
  
  -- Clean up deductions record
  DELETE FROM order_batch_deductions WHERE order_id = p_order_id;

  -- Force recompute inventory totals for all products in this order to ensure sync
  -- There might be multiple products, so we loop through the items that WERE in the order
  -- or we just use a subquery.
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
  SELECT product_id, warehouse_id, COALESCE(SUM(remaining_qty), 0), now()
  FROM public.inventory_batches
  WHERE product_id IN (SELECT product_id FROM order_items WHERE order_id = p_order_id)
  GROUP BY product_id, warehouse_id
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();

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

GRANT EXECUTE ON FUNCTION public.revert_order_to_approved(UUID) TO authenticated;
