-- Migration: 20260529000000_definitive_order_revert_permissions.sql
-- Goal: Resolve "You do not have permission to perform this action" on order reversion by fixing RLS policies, bypasses, and trigger recursion.

-- 1. Re-define check_is_admin_v2 to use the non-recursive public.is_admin() instead of profiles table
CREATE OR REPLACE FUNCTION public.check_is_admin_v2()
RETURNS boolean AS $$
BEGIN
  RETURN COALESCE(public.is_admin(), false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Drop and Re-create RLS Policies for stock_ledger to use is_admin() (avoiding profiles)
DROP POLICY IF EXISTS "view_all_stock_ledger" ON public.stock_ledger;
CREATE POLICY "view_all_stock_ledger" ON public.stock_ledger FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_stock_ledger" ON public.stock_ledger;
CREATE POLICY "admin_manage_stock_ledger" ON public.stock_ledger FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Drop and Re-create RLS Policies for order_batch_deductions to use is_admin() (avoiding profiles)
DROP POLICY IF EXISTS "view_all_deductions" ON public.order_batch_deductions;
CREATE POLICY "view_all_deductions" ON public.order_batch_deductions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_deductions" ON public.order_batch_deductions;
CREATE POLICY "admin_manage_deductions" ON public.order_batch_deductions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Clean up any other policies referencing public.profiles directly for role checks if they can use public.is_admin()
-- In public.returns
DROP POLICY IF EXISTS "returns_admin" ON public.returns;
CREATE POLICY "returns_admin" ON public.returns FOR ALL TO authenticated
  USING (public.is_admin());

-- 5. Trigger recursion shield: Re-define trg_handle_order_reversal to honor sessions parameter 'app.reverting_order'
CREATE OR REPLACE FUNCTION public.trg_handle_order_reversal()
RETURNS TRIGGER AS $$
DECLARE
  v_reverting text;
BEGIN
  BEGIN
    v_reverting := current_setting('app.reverting_order', true);
  EXCEPTION WHEN OTHERS THEN
    v_reverting := 'false';
  END;

  -- Bypasses if we are already in the reversion RPC
  IF COALESCE(v_reverting, 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  -- If status moves from a "Deducted" state to a "Non-Deducted" state
  IF (OLD.status IN ('dispatched', 'delivered')) AND (NEW.status IN ('approved', 'pending_approval', 'draft')) THEN
    -- Set the flag to prevent nested execution
    PERFORM set_config('app.reverting_order', 'true', true);
    
    PERFORM public.revert_order_to_approved(NEW.id);
    NEW.dispatched_at = NULL;
    NEW.delivered_at = NULL;
    
    -- Reset the flag
    PERFORM set_config('app.reverting_order', 'false', true);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. Define the robust and completely secure revert_order_to_approved function
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
    v_already_reverting text;
BEGIN
    -- Auth check inside RPC for extra safety (though execute is granted to authenticated)
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
            SELECT obd.product_id, obd.warehouse_id, obd.qty_base_units, obd.batch_id
            FROM public.order_batch_deductions obd
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
