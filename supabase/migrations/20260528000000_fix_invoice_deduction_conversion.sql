-- Migration to fix conversion issue in invoice_deduction RPC 
-- Uses public.convert_to_base_units to handle kg -> base units (pieces/units/pouches) conversions correctly.

CREATE OR REPLACE FUNCTION public.invoice_deduction(
    p_order_id UUID,
    p_performed_by UUID
) RETURNS boolean AS $$
DECLARE
    v_item        RECORD;
    v_batch       RECORD;
    v_deduction_units NUMERIC;
    v_needed      NUMERIC;
    v_deducted    NUMERIC;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id INTO v_warehouse_id FROM public.orders WHERE id = p_order_id;

    FOR v_item IN
        SELECT oi.id AS order_item_id, oi.product_id, oi.quantity, oi.pack_type
        FROM public.order_items oi
        WHERE oi.order_id = p_order_id
    LOOP
        v_deduction_units := public.convert_to_base_units(v_item.product_id, v_item.quantity, v_item.pack_type::TEXT);
        v_needed := v_deduction_units;

        FOR v_batch IN
            SELECT id, remaining_qty FROM public.inventory_batches
            WHERE product_id = v_item.product_id
              AND warehouse_id = v_warehouse_id
              AND remaining_qty > 0
            ORDER BY expiry_date ASC, created_at ASC
        LOOP
            IF v_needed <= 0 THEN EXIT; END IF;
            v_deducted := LEAST(v_needed, v_batch.remaining_qty);

            -- 1. Deduct via the movement engine (updates batch + logs movement)
            PERFORM public.record_inventory_movement(
                v_item.product_id, v_batch.id, v_warehouse_id,
                -v_deducted, 'sale', p_order_id::text, 'order',
                p_performed_by, 'Order Dispatch Deduction'
            );

            -- 2. Write to order_batch_deductions
            INSERT INTO public.order_batch_deductions
                (order_id, order_item_id, batch_id, product_id, warehouse_id, qty_base_units)
            VALUES
                (p_order_id, v_item.order_item_id, v_batch.id,
                 v_item.product_id, v_warehouse_id, v_deducted)
            ON CONFLICT (id) DO NOTHING; -- prevent duplicates if called retry

            v_needed := v_needed - v_deducted;
        END LOOP;

        IF v_needed > 0 THEN
            RAISE EXCEPTION 'Insufficient stock for product % during dispatch', v_item.product_id;
        END IF;
    END LOOP;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.invoice_deduction(UUID, UUID) TO authenticated;
