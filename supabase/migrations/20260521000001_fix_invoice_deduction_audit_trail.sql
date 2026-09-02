-- Fix invoice_deduction to populate order_batch_deductions
-- so that revert_order_to_approved can correctly restore stock.

-- Ensure order_batch_deductions has product_id and warehouse_id columns
ALTER TABLE public.order_batch_deductions ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.order_batch_deductions ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE;

-- Update function to write to audit trail
CREATE OR REPLACE FUNCTION public.invoice_deduction(
    p_order_id UUID,
    p_performed_by UUID
) RETURNS boolean AS $$
DECLARE
    v_item        RECORD;
    v_batch       RECORD;
    v_order_item  RECORD;
    v_deduction_units NUMERIC;
    v_needed      NUMERIC;
    v_deducted    NUMERIC;
    v_warehouse_id UUID;
BEGIN
    SELECT warehouse_id INTO v_warehouse_id FROM public.orders WHERE id = p_order_id;

    FOR v_item IN
        SELECT oi.id AS order_item_id, oi.product_id, oi.quantity, oi.pack_type,
               p.units_per_packet, p.packets_per_case
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = p_order_id
    LOOP
        v_deduction_units := CASE
            WHEN v_item.pack_type = 'unit'   THEN v_item.quantity
            WHEN v_item.pack_type = 'packet' THEN v_item.quantity * COALESCE(v_item.units_per_packet, 1)
            WHEN v_item.pack_type = 'case'   THEN v_item.quantity * COALESCE(v_item.units_per_packet, 1)
                                                                   * COALESCE(v_item.packets_per_case, 1)
            ELSE v_item.quantity
        END;
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

            -- 2. *** THE MISSING PIECE *** Write to order_batch_deductions
            --    so revert_order_to_approved knows what to restore.
            INSERT INTO public.order_batch_deductions
                (order_id, order_item_id, batch_id, product_id, warehouse_id, qty_base_units)
            VALUES
                (p_order_id, v_item.order_item_id, v_batch.id,
                 v_item.product_id, v_warehouse_id, v_deducted);

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
