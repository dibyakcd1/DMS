-- consolidated stock view fixes & reversal robustness
-- This migration ensures aggregate stock views are correct and reversal logic is robust.

-- 1. Add avg_landed_cost to inventory table if missing
DO $body$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'avg_landed_cost') THEN
        ALTER TABLE public.inventory ADD COLUMN avg_landed_cost NUMERIC(15,2) DEFAULT 0;
    END IF;
END $body$;

-- 2. Update recompute_inventory to calculate avg_landed_cost properly
DROP FUNCTION IF EXISTS public.recompute_inventory(UUID);
DROP FUNCTION IF EXISTS public.recompute_inventory(UUID, UUID);
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id UUID, _warehouse_id UUID DEFAULT NULL)
RETURNS void AS $body$
BEGIN
    -- If warehouse is provided, sync that specific bucket
    IF _warehouse_id IS NOT NULL THEN
        INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, avg_landed_cost, last_updated_at)
        SELECT 
            product_id, 
            warehouse_id, 
            COALESCE(SUM(remaining_qty), 0), 
            COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0),
            now()
        FROM public.inventory_batches
        WHERE product_id = _product_id AND warehouse_id = _warehouse_id
        GROUP BY product_id, warehouse_id
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            stock_base_units = EXCLUDED.stock_base_units,
            avg_landed_cost = EXCLUDED.avg_landed_cost,
            last_updated_at = now();
    ELSE
        -- If no warehouse provided, loop through all warehouses that have history for this product
        INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, avg_landed_cost, last_updated_at)
        SELECT 
            product_id, 
            warehouse_id, 
            COALESCE(SUM(remaining_qty), 0), 
            COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0),
            now()
        FROM public.inventory_batches
        WHERE product_id = _product_id
        GROUP BY product_id, warehouse_id
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            stock_base_units = EXCLUDED.stock_base_units,
            avg_landed_cost = EXCLUDED.avg_landed_cost,
            last_updated_at = now();
    END IF;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update v_product_stock to AGGREGATE stock correctly across ALL warehouses
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE VIEW public.v_product_stock AS
SELECT 
    p.id, p.name, p.sku, p.mrp, p.gst_rate, 
    p.units_per_packet, p.packets_per_case, p.units_per_case, 
    p.is_active, p.min_stock, p.pack_size_value, p.pack_size_unit, 
    p.division_category, p.preferred_sell_unit, p.base_unit, p.unit_type,
    COALESCE(SUM(i.stock_base_units), 0) as stock_base_units,
    CASE 
        WHEN SUM(i.stock_base_units) > 0 THEN 
            SUM(i.stock_base_units * i.avg_landed_cost) / SUM(i.stock_base_units)
        ELSE (
            SELECT COALESCE(landed_cost, 0) 
            FROM public.inventory_batches 
            WHERE product_id = p.id 
            ORDER BY received_at DESC, created_at DESC 
            LIMIT 1
        )
    END as avg_landed_cost,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
      ELSE 1 
    END as calc_units_per_case,
    (COALESCE(SUM(i.stock_base_units), 0) <= p.min_stock) as is_low_stock
FROM 
    public.products p
LEFT JOIN 
    public.inventory i ON p.id = i.product_id
GROUP BY 
    p.id;

-- 4. Update v_product_stock_warehouse for granular warehouse view
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
CREATE VIEW public.v_product_stock_warehouse AS
SELECT 
    w.id as warehouse_id,
    w.name as warehouse_name,
    p.id as product_id,
    p.sku, p.name,
    p.units_per_packet, p.packets_per_case, p.units_per_case,
    p.min_stock, p.is_active,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    COALESCE(i.avg_landed_cost, 0) as avg_landed_cost,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
      ELSE 1 
    END as calc_units_per_case,
    (COALESCE(i.stock_base_units, 0) <= p.min_stock) as is_low_stock
FROM 
    public.warehouses w
CROSS JOIN 
    public.products p
LEFT JOIN 
    public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id;

-- 5. Create Reversals Table for Auditing if not exists
CREATE TABLE IF NOT EXISTS public.order_reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    reverted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reverted_by UUID,
    previous_status TEXT,
    reason TEXT
);

-- 5.1 Update recompute_all_inventory to also sync active status
CREATE OR REPLACE FUNCTION public.recompute_all_inventory()
RETURNS boolean AS $body$
BEGIN
  -- Recompute inventory aggregates
  TRUNCATE public.inventory;
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, avg_landed_cost, last_updated_at)
  SELECT 
    product_id, 
    warehouse_id, 
    COALESCE(SUM(remaining_qty), 0), 
    COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0),
    now()
  FROM public.inventory_batches
  GROUP BY product_id, warehouse_id;
  
  -- Sync active status
  UPDATE public.products p
  SET is_active = EXISTS (
      SELECT 1 
      FROM public.inventory i 
      WHERE i.product_id = p.id AND i.stock_base_units > 0
  );
  
  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Robust revert_order_to_approved function
DROP FUNCTION IF EXISTS public.revert_order_to_approved(UUID);
CREATE OR REPLACE FUNCTION public.revert_order_to_approved(p_order_id UUID)
RETURNS JSON AS $body$
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
$body$ LANGUAGE plpgsql;

-- 7. Update status reversal trigger
CREATE OR REPLACE FUNCTION public.trg_handle_order_reversal()
RETURNS TRIGGER AS $body$
BEGIN
    -- If status moves from a "Deducted" state to a "Non-Deducted" state
    IF (OLD.status IN ('dispatched', 'delivered')) AND (NEW.status IN ('approved', 'pending_approval', 'draft')) THEN
        PERFORM public.revert_order_to_approved(NEW.id);
        NEW.dispatched_at = NULL;
        NEW.delivered_at = NULL;
    END IF;
    RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_reversal ON public.orders;
CREATE TRIGGER trg_order_reversal
BEFORE UPDATE ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.trg_handle_order_reversal();

-- 8. Fix aggregate-aware auto-toggle for product active status
CREATE OR REPLACE FUNCTION public.fn_auto_toggle_product_active()
RETURNS TRIGGER AS $body$
DECLARE
    v_total_stock NUMERIC;
BEGIN
    -- Calculate total stock across all warehouses for this product
    SELECT COALESCE(SUM(stock_base_units), 0) INTO v_total_stock
    FROM public.inventory
    WHERE product_id = NEW.product_id;

    -- If stock > 0, always activate
    IF v_total_stock > 0 THEN
        UPDATE public.products 
        SET is_active = true 
        WHERE id = NEW.product_id AND is_active = false;
    -- If stock <= 0, deactivate (only if it was active)
    ELSIF v_total_stock <= 0 THEN
        UPDATE public.products 
        SET is_active = false 
        WHERE id = NEW.product_id AND is_active = true;
    END IF;
    
    RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_toggle_product_active ON public.inventory;
CREATE TRIGGER trg_auto_toggle_product_active
AFTER INSERT OR UPDATE ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_toggle_product_active();

-- 9. Run reconciliation for ALL products and sync active status
DO $body$
DECLARE
    r RECORD;
BEGIN
    -- First reconcile stock counts
    FOR r IN SELECT id FROM public.products LOOP
        PERFORM public.recompute_inventory(r.id);
    END LOOP;

    -- Then sync active status based on aggregate stock
    UPDATE public.products p
    SET is_active = EXISTS (
        SELECT 1 
        FROM public.inventory i 
        WHERE i.product_id = p.id AND i.stock_base_units > 0
    );
END $body$;

GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;
