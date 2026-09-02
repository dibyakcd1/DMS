-- Migration: Grant owner role to dibyaprakashkcd4
-- This user is reporting permission issues, likely because their email was not included in previous owner assignment migrations.

-- 1. Upgrade profile if exists
UPDATE public.profiles 
SET role = 'owner',
    full_name = 'Owner'
WHERE email = 'dibyaprakashkcd4@gmail.com';

-- 2. Ensure in user_roles
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        INSERT INTO public.user_roles (user_id, role)
        SELECT id, 'owner' FROM public.profiles WHERE email = 'dibyaprakashkcd4@gmail.com'
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $$;

-- 3. Fix revert_order_to_approved function to actually change status
-- AND make it SECURITY DEFINER to bypass any lingering RLS issues for the status update
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
    -- Auth check inside RPC for extra safety (though execute is granted to authenticated)
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT order_number, status INTO v_order_number, v_prev_status FROM public.orders WHERE id = p_order_id;
    
    -- Log to reversals table
    INSERT INTO public.order_reversals (order_id, reverted_by, previous_status, reason)
    VALUES (p_order_id, v_user_id, v_prev_status, 'Manual Reversal to Approved');
    
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

    -- Clean up deductions
    DELETE FROM public.order_batch_deductions WHERE order_id = p_order_id;
    
    -- Void existing invoices
    UPDATE public.invoices SET is_void = true WHERE order_id = p_order_id;
    
    -- CRITICAL FIX: Update the order status back to approved
    UPDATE public.orders 
    SET status = 'approved', 
        dispatched_at = NULL, 
        delivered_at = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_order_to_approved(UUID) TO authenticated;
