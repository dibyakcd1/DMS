-- MIGRATION: INVENTORY-ENGINE-V2
-- Purpose: Implement a single source of truth for all inventory changes.
-- Requirements: 
-- 1. All stock movements must be logged to 'inventory_movements' table.
-- 2. Direct updates to inventory_batches from UI are forbidden.
-- 3. Atomicity via RPC functions.

BEGIN;

-- 1. Create the Movement Log Table
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id),
    batch_id UUID REFERENCES public.inventory_batches(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    quantity NUMERIC NOT NULL, -- Positive for inward/addition, negative for deduction/sale
    movement_type TEXT NOT NULL, -- 'purchase', 'sale', 'adjustment', 'transfer', 'reconciliation'
    reference_id TEXT, -- ID of order, purchase invoice, etc.
    reference_type TEXT, -- 'order', 'grn', 'audit', 'transfer'
    performed_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_inv_mov_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_batch ON public.inventory_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_created ON public.inventory_movements(created_at);

-- 2. Migrate Historical Data from stock_ledger
INSERT INTO public.inventory_movements (
    id, product_id, batch_id, warehouse_id, quantity, movement_type, 
    reference_id, reference_type, performed_by, notes, created_at
)
SELECT 
    id, 
    product_id, 
    batch_id, 
    (SELECT warehouse_id FROM public.inventory_batches WHERE id = stock_ledger.batch_id LIMIT 1),
    qty_transacted,
    entry_type, -- Maps to movement_type
    reference_id::text,
    reference_type,
    created_by,
    notes,
    created_at
FROM public.stock_ledger
ON CONFLICT (id) DO NOTHING;

-- 3. THE CORE ENGINE: record_inventory_movement
-- This is the only function allowed to touch batch quantities.
CREATE OR REPLACE FUNCTION public.record_inventory_movement(
    p_product_id UUID,
    p_batch_id UUID,
    p_warehouse_id UUID,
    p_quantity NUMERIC,
    p_movement_type TEXT,
    p_reference_id TEXT,
    p_reference_type TEXT,
    p_performed_by UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_movement_id UUID;
BEGIN
    -- 1. Update the batch quantity
    UPDATE public.inventory_batches 
    SET remaining_qty = remaining_qty + p_quantity,
        updated_at = now()
    WHERE id = p_batch_id;

    -- 2. Record the movement
    INSERT INTO public.inventory_movements (
        product_id, batch_id, warehouse_id, quantity, movement_type, 
        reference_id, reference_type, performed_by, notes
    ) VALUES (
        p_product_id, p_batch_id, p_warehouse_id, p_quantity, p_movement_type, 
        p_reference_id, p_reference_type, p_performed_by, p_notes
    ) RETURNING id INTO v_movement_id;

    -- 3. Synchronize global/warehouse inventory aggregates
    PERFORM public.recompute_inventory(p_product_id);

    RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update the View to use inventory_movements
DROP VIEW IF EXISTS public.v_stock_ledger_details;
CREATE OR REPLACE VIEW public.v_stock_ledger_details AS
SELECT 
    im.id,
    im.created_at,
    im.quantity as qty_transacted,
    im.movement_type as entry_type,
    im.reference_type,
    im.reference_id,
    im.notes,
    -- Product Details
    p.id as product_id,
    p.name as product_name,
    p.sku as product_sku,
    p.units_per_packet,
    p.packets_per_case,
    -- Batch Details
    ib.batch_number,
    -- Order/Shop Details (if applicable)
    o.id as order_id,
    o.order_number,
    o.status as order_status,
    s.id as shop_id,
    s.name as shop_name,
    s.address as shop_location,
    -- Purchase Details (if applicable)
    pi.invoice_number as purchase_invoice_number,
    pi.supplier_name,
    -- Transfer Details (if applicable)
    wt.id as transfer_id,
    fwh.name as from_warehouse_name,
    twh.name as to_warehouse_name,
    -- Responsible User
    pr.full_name as created_by_name
FROM 
    public.inventory_movements im
LEFT JOIN public.products p ON im.product_id = p.id
LEFT JOIN public.inventory_batches ib ON im.batch_id = ib.id
LEFT JOIN public.profiles pr ON im.performed_by = pr.id
-- Join for Orders
LEFT JOIN public.orders o ON (
    im.reference_type = 'order' 
    AND im.reference_id = o.id::text
)
LEFT JOIN public.shops s ON o.shop_id = s.id
-- Join for Purchase Invoices
LEFT JOIN public.purchase_invoices pi ON (
    (im.reference_type = 'purchase_invoice' OR im.reference_type = 'purchase' OR im.reference_type = 'grn')
    AND im.reference_id = pi.id::text
)
-- Join for Warehouse Transfers
LEFT JOIN public.warehouse_transfers wt ON (
    im.reference_type = 'transfer'
    AND im.reference_id = wt.id::text
)
LEFT JOIN public.warehouses fwh ON wt.from_warehouse_id = fwh.id
LEFT JOIN public.warehouses twh ON wt.to_warehouse_id = twh.id;

GRANT SELECT ON public.v_stock_ledger_details TO authenticated;

-- 3. Specific RPC: reconcile_stock (for Audits)
CREATE OR REPLACE FUNCTION public.reconcile_stock(
    p_audit_id UUID,
    p_performed_by UUID,
    p_items JSONB -- Array of {product_id, batch_id, warehouse_id, variance, notes}
) RETURNS boolean AS $$
DECLARE
    v_item RECORD;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID, 
        batch_id UUID, 
        warehouse_id UUID, 
        variance NUMERIC,
        notes TEXT
    ) LOOP
        IF v_item.variance != 0 THEN
            PERFORM public.record_inventory_movement(
                v_item.product_id,
                v_item.batch_id,
                v_item.warehouse_id,
                v_item.variance,
                'reconciliation',
                p_audit_id::text,
                'audit',
                p_performed_by,
                COALESCE(v_item.notes, 'Audit Reconciliation')
            );
        END IF;
    END LOOP;
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Specific RPC: transfer_stock
CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_product_id UUID,
    p_from_batch_id UUID,
    p_to_batch_id UUID,
    p_warehouse_id UUID,
    p_quantity NUMERIC,
    p_performed_by UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS boolean AS $$
BEGIN
    -- Deduct from source
    PERFORM public.record_inventory_movement(
        p_product_id, p_from_batch_id, p_warehouse_id, -p_quantity,
        'transfer', NULL, 'transfer', p_performed_by, 'Transfer Out: ' || COALESCE(p_notes, '')
    );

    -- Add to destination
    PERFORM public.record_inventory_movement(
        p_product_id, p_to_batch_id, p_warehouse_id, p_quantity,
        'transfer', NULL, 'transfer', p_performed_by, 'Transfer In: ' || COALESCE(p_notes, '')
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Specific RPC: invoice_deduction (Sale)
CREATE OR REPLACE FUNCTION public.invoice_deduction(
    p_order_id UUID,
    p_performed_by UUID
) RETURNS boolean AS $$
DECLARE
    v_item RECORD;
    v_deduction_units NUMERIC;
    v_batch RECORD;
    v_needed NUMERIC;
    v_deducted NUMERIC;
    v_warehouse_id UUID;
BEGIN
    -- Get order warehouse
    SELECT warehouse_id INTO v_warehouse_id FROM public.orders WHERE id = p_order_id;

    FOR v_item IN 
        SELECT oi.*, p.units_per_packet, p.packets_per_case 
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = p_order_id
    LOOP
        v_deduction_units := CASE 
            WHEN v_item.pack_type = 'unit' THEN v_item.quantity
            WHEN v_item.pack_type = 'packet' THEN v_item.quantity * COALESCE(v_item.units_per_packet, 1)
            WHEN v_item.pack_type = 'case' THEN v_item.quantity * COALESCE(v_item.units_per_packet, 1) * COALESCE(v_item.packets_per_case, 1)
            ELSE v_item.quantity 
        END;
        
        v_needed := v_deduction_units;

        -- FIFO Deduction
        FOR v_batch IN 
            SELECT id FROM public.inventory_batches 
            WHERE product_id = v_item.product_id AND warehouse_id = v_warehouse_id AND remaining_qty > 0 
            ORDER BY expiry_date ASC, created_at ASC
        LOOP
            IF v_needed <= 0 THEN EXIT; END IF;
            
            SELECT remaining_qty INTO v_deducted FROM public.inventory_batches WHERE id = v_batch.id;
            v_deducted := LEAST(v_needed, v_deducted);
            
            PERFORM public.record_inventory_movement(
                v_item.product_id, v_batch.id, v_warehouse_id, -v_deducted,
                'sale', p_order_id::text, 'order', p_performed_by, 'Order Dispatch Deduction'
            );
            
            v_needed := v_needed - v_deducted;
        END LOOP;

        IF v_needed > 0 THEN
            RAISE EXCEPTION 'Insufficient stock for product % during dispatch', v_item.product_id;
        END IF;
    END LOOP;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Specific RPC: inward_stock (Purchase/GRN)
CREATE OR REPLACE FUNCTION public.inward_stock(
    p_product_id UUID,
    p_batch_id UUID,
    p_warehouse_id UUID,
    p_quantity NUMERIC,
    p_reference_id TEXT,
    p_performed_by UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS boolean AS $$
BEGIN
    PERFORM public.record_inventory_movement(
        p_product_id, p_batch_id, p_warehouse_id, p_quantity,
        'purchase', p_reference_id, 'grn', p_performed_by, p_notes
    );
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Specific RPC: inward_purchase_invoice (Consolidated GRN)
CREATE OR REPLACE FUNCTION public.inward_purchase_invoice(
    p_grn_id UUID,
    p_performed_by UUID
) RETURNS boolean AS $$
DECLARE
    v_item RECORD;
    v_batch_id UUID;
    v_grn RECORD;
    v_warehouse_id UUID;
BEGIN
    SELECT * INTO v_grn FROM public.purchase_invoices WHERE id = p_grn_id;
    v_warehouse_id := COALESCE(v_grn.warehouse_id, (SELECT id FROM public.warehouses LIMIT 1));

    FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = p_grn_id
    LOOP
        -- Logic simplified for engine example, in production this should include freight distribution
        INSERT INTO public.inventory_batches (
            product_id, warehouse_id, purchase_invoice_id, batch_number,
            received_qty, remaining_qty, cost_price, landed_cost,
            expiry_date, mfg_date, received_by
        ) VALUES (
            v_item.product_id, v_warehouse_id, p_grn_id, v_grn.invoice_number || '-' || v_item.id,
            v_item.quantity, 0, v_item.unit_cost, v_item.unit_cost,
            v_item.expiry_date, v_item.mfg_date, p_performed_by
        ) RETURNING id INTO v_batch_id;

        PERFORM public.record_inventory_movement(
            v_item.product_id, v_batch_id, v_warehouse_id, v_item.quantity,
            'purchase', p_grn_id::text, 'grn', p_performed_by, 'GRN Inward'
        );
    END LOOP;

    UPDATE public.purchase_invoices SET status = 'posted' WHERE id = p_grn_id;
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RLS Policies
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_movements_select_auth" ON public.inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_movements_insert_admin" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner());

COMMIT;
