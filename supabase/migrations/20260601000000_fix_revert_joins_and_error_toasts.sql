-- Migration: 20260601000000_fix_revert_joins_and_error_toasts.sql
-- Goal: Fix column nonexistent error inside order reversal by joining inventory_batches correctly to retrieve product_id and warehouse_id

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
    v_already_reverting text;
BEGIN
    -- Auth check inside RPC for extra safety
    v_user_id := auth.uid();

    -- Check if user exists in profiles to satisfy FK constraint
    IF v_user_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
            v_user_id := NULL;
        END IF;
    END IF;

    -- Look up order details
    SELECT order_number, status INTO v_order_number, v_prev_status 
    FROM public.orders 
    WHERE id = p_order_id;
    
    -- Cache current session variable
    BEGIN
        v_already_reverting := current_setting('app.reverting_order', true);
    EXCEPTION WHEN OTHERS THEN
        v_already_reverting := 'false';
    END;

    -- Set session variable to prevent infinite trigger nesting
    PERFORM set_config('app.reverting_order', 'true', true);

    -- Log and restore batch inventory if previous state was actually dispatched or delivered
    IF COALESCE(v_already_reverting, 'false') <> 'true' AND v_prev_status IN ('dispatched', 'delivered') THEN
        -- Log to reversals table for auditing
        INSERT INTO public.order_reversals (order_id, reverted_by, previous_status, reason)
        VALUES (p_order_id, v_user_id, v_prev_status, 'Manual Reversal to Approved');
        
        -- Restore inventory batches via the consolidated movement engine (updates qty, logs movement, recomputes aggregates)
        FOR v_item IN 
            SELECT ib.product_id, ib.warehouse_id, obd.qty_base_units, obd.batch_id
            FROM public.order_batch_deductions obd
            JOIN public.inventory_batches ib ON obd.batch_id = ib.id
            WHERE obd.order_id = p_order_id
        LOOP
            PERFORM public.record_inventory_movement(
                v_item.product_id,
                v_item.batch_id,
                v_item.warehouse_id,
                v_item.qty_base_units,
                'reversal',
                p_order_id::text,
                'order',
                v_user_id,
                'Restoration: Order ' || COALESCE(v_order_number, 'N/A') || ' reverted'
            );
        END LOOP;

        -- Clean up deductions mapping
        DELETE FROM public.order_batch_deductions WHERE order_id = p_order_id;
        
        -- Void existing invoices associated with the order
        UPDATE public.invoices SET is_void = true WHERE order_id = p_order_id;
    END IF;
    
    -- Update the order status back to approved safely (Trigger ignores this due to session flag)
    UPDATE public.orders 
    SET status = 'approved', 
        dispatched_at = NULL, 
        delivered_at = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Restore session variable to normal
    PERFORM set_config('app.reverting_order', 'false', true);

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    -- Safety cleanup
    PERFORM set_config('app.reverting_order', 'false', true);
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execution permissions on the RPC to authenticated & anon users
GRANT EXECUTE ON FUNCTION public.revert_order_to_approved(UUID) TO authenticated, anon, service_role;
