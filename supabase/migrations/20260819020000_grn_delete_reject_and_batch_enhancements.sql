-- Migration: GRN Delete, Reject, Batch Column and RPC Enhancements
-- Date: 2026-08-19

BEGIN;

-- 1. Ensure batch_number column exists on purchase_invoice_items
ALTER TABLE IF EXISTS public.purchase_invoice_items 
  ADD COLUMN IF NOT EXISTS batch_number TEXT;

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_batch ON public.purchase_invoice_items(batch_number);

-- 2. Ensure purchase_invoices has default_batch_number column
ALTER TABLE IF EXISTS public.purchase_invoices 
  ADD COLUMN IF NOT EXISTS default_batch_number TEXT;

-- 3. Delete Purchase Invoice / GRN RPC
CREATE OR REPLACE FUNCTION public.delete_purchase_invoice(
    p_grn_id UUID,
    p_performed_by UUID DEFAULT auth.uid()
) RETURNS boolean AS $$
DECLARE
    v_grn RECORD;
    v_batch RECORD;
    v_has_sold_stock BOOLEAN := false;
    v_prod RECORD;
BEGIN
    -- Check permissions
    IF NOT public.is_admin_or_owner() THEN
        RAISE EXCEPTION 'Only administrators or owners can delete purchase records.';
    END IF;

    -- Fetch the GRN
    SELECT * INTO v_grn FROM public.purchase_invoices WHERE id = p_grn_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase invoice with ID % not found.', p_grn_id;
    END IF;

    -- If status is 'posted', check if inventory batches have been consumed/sold
    IF v_grn.status = 'posted' THEN
        FOR v_batch IN SELECT * FROM public.inventory_batches WHERE purchase_invoice_id = p_grn_id
        LOOP
            IF v_batch.remaining_qty < v_batch.received_qty THEN
                v_has_sold_stock := true;
                EXIT;
            END IF;
        END LOOP;

        IF v_has_sold_stock THEN
            RAISE EXCEPTION 'Cannot delete posted GRN because stock from its batches has already been dispatched or sold in customer orders.';
        END IF;

        -- Safe to reverse unsold batches and movement records
        FOR v_batch IN SELECT * FROM public.inventory_batches WHERE purchase_invoice_id = p_grn_id
        LOOP
            -- Remove inventory movements associated with this purchase invoice
            DELETE FROM public.inventory_movements 
            WHERE (reference_type IN ('purchase_invoice', 'purchase', 'grn') AND reference_id = p_grn_id::text)
               OR batch_id = v_batch.id;

            -- Delete the batch
            DELETE FROM public.inventory_batches WHERE id = v_batch.id;
        END LOOP;

        -- Recompute inventory for all affected products
        FOR v_prod IN SELECT DISTINCT product_id FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_grn_id
        LOOP
            PERFORM public.recompute_inventory(v_prod.product_id);
        END LOOP;
    END IF;

    -- Delete any other orphaned inventory batches for this GRN
    DELETE FROM public.inventory_batches WHERE purchase_invoice_id = p_grn_id;

    -- Delete grn approval log
    DELETE FROM public.grn_approval_log WHERE grn_id = p_grn_id;

    -- Delete line items
    DELETE FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_grn_id;

    -- Delete the purchase invoice record
    DELETE FROM public.purchase_invoices WHERE id = p_grn_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Reject Purchase Invoice / GRN RPC
CREATE OR REPLACE FUNCTION public.reject_purchase_invoice(
    p_grn_id UUID,
    p_performed_by UUID DEFAULT auth.uid(),
    p_notes TEXT DEFAULT 'Rejected by administrator'
) RETURNS boolean AS $$
DECLARE
    v_grn RECORD;
    v_batch RECORD;
    v_has_sold_stock BOOLEAN := false;
    v_prod RECORD;
BEGIN
    -- Check permissions
    IF NOT public.is_admin_or_owner() THEN
        RAISE EXCEPTION 'Only administrators or owners can reject purchase records.';
    END IF;

    -- Fetch the GRN
    SELECT * INTO v_grn FROM public.purchase_invoices WHERE id = p_grn_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Purchase invoice with ID % not found.', p_grn_id;
    END IF;

    -- If status is already rejected
    IF v_grn.status = 'rejected' THEN
        RETURN true;
    END IF;

    -- If status is 'posted', reverse stock if none has been consumed
    IF v_grn.status = 'posted' THEN
        FOR v_batch IN SELECT * FROM public.inventory_batches WHERE purchase_invoice_id = p_grn_id
        LOOP
            IF v_batch.remaining_qty < v_batch.received_qty THEN
                v_has_sold_stock := true;
                EXIT;
            END IF;
        END LOOP;

        IF v_has_sold_stock THEN
            RAISE EXCEPTION 'Cannot reject posted GRN because stock from its batches has already been dispatched or sold in customer orders.';
        END IF;

        -- Remove inventory movements
        DELETE FROM public.inventory_movements 
        WHERE (reference_type IN ('purchase_invoice', 'purchase', 'grn') AND reference_id = p_grn_id::text)
           OR batch_id IN (SELECT id FROM public.inventory_batches WHERE purchase_invoice_id = p_grn_id);

        -- Delete the batches created by this GRN
        DELETE FROM public.inventory_batches WHERE purchase_invoice_id = p_grn_id;

        -- Recompute inventory
        FOR v_prod IN SELECT DISTINCT product_id FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_grn_id
        LOOP
            PERFORM public.recompute_inventory(v_prod.product_id);
        END LOOP;
    END IF;

    -- Update GRN status to rejected
    UPDATE public.purchase_invoices 
    SET status = 'rejected',
        notes = COALESCE(notes, '') || ' [Rejected: ' || COALESCE(p_notes, 'N/A') || ']'
    WHERE id = p_grn_id;

    -- Log to grn_approval_log
    INSERT INTO public.grn_approval_log (
        grn_id, action, performed_by, notes
    ) VALUES (
        p_grn_id, 'rejected', p_performed_by, p_notes
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Ensure RLS on purchase_invoices allows DELETE for admin/owner
DROP POLICY IF EXISTS "delete_purchase_invoices" ON public.purchase_invoices;
CREATE POLICY "delete_purchase_invoices" ON public.purchase_invoices FOR DELETE TO authenticated
  USING (public.is_admin_or_owner());

GRANT EXECUTE ON FUNCTION public.delete_purchase_invoice(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_purchase_invoice(UUID, UUID, TEXT) TO authenticated;

COMMIT;
