-- consolidated stock view fixes & reversal robustness
-- This migration ensures aggregate stock views are correct and reversal logic is robust.

-- 6. Robust revert_order_to_approved function (RE-DEFINED AS SECURITY DEFINER)
DROP FUNCTION IF EXISTS public.revert_order_to_approved(UUID);
CREATE OR REPLACE FUNCTION public.revert_order_to_approved(p_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_order_number TEXT;
    v_prev_status TEXT;
    v_user_id UUID;
BEGIN
    SELECT order_number, status INTO v_order_number, v_prev_status FROM public.orders WHERE id = p_order_id;
    
    -- Attempt to get current user, failure is okay for system triggers
    BEGIN
        v_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    -- Log to reversals table
    INSERT INTO public.order_reversals (order_id, reverted_by, previous_status, reason)
    VALUES (p_order_id, v_user_id, v_prev_status, 'Stock Reversal on Status Change');
    
    -- Restore batches
    FOR v_item IN 
        SELECT obd.product_id, obd.warehouse_id, obd.qty_base_units, obd.batch_id
        FROM public.order_batch_deductions obd
        WHERE obd.order_id = p_order_id
    LOOP
        UPDATE public.inventory_batches
        SET remaining_qty = remaining_qty + v_item.qty_base_units,
            updated_at = NOW()
        WHERE id = v_item.batch_id;
        
        INSERT INTO public.stock_ledger (
            product_id, warehouse_id, change_qty, 
            reference_type, reference_id, description
        ) VALUES (
            v_item.product_id, v_item.warehouse_id, v_item.qty_base_units,
            'REVERSAL', p_order_id, 'Restoration: Order ' || COALESCE(v_order_number, 'N/A') || ' reverted'
        );
        
        PERFORM public.recompute_inventory(v_item.product_id, v_item.warehouse_id);
    END LOOP;

    DELETE FROM public.order_batch_deductions WHERE order_id = p_order_id;
    UPDATE public.invoices SET is_void = true WHERE order_id = p_order_id;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_order_to_approved(UUID) TO authenticated;
