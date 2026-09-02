-- MIGRATION: STOCK-2, STOCK-5 - Warehouse Aware Orders & Dispatch
-- Adds warehouse_id to orders and creates a warehouse-specific stock view.

-- 1. Add warehouse_id to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id);

-- 2. Create a Warehouse-Specific Stock View
DROP VIEW IF EXISTS public.v_product_stock_warehouse;
CREATE VIEW public.v_product_stock_warehouse AS
SELECT 
    p.*,
    w.id as warehouse_id,
    w.name as warehouse_name,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
      ELSE 1 
    END as calc_units_per_case,
    (COALESCE(i.stock_base_units, 0) <= p.min_stock) as is_low_stock
FROM 
    public.products p
CROSS JOIN 
    public.warehouses w
LEFT JOIN 
    public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id;

-- 3. Update dispatch_order RPC to be warehouse-aware (STOCK-2)
CREATE OR REPLACE FUNCTION public.dispatch_order(_order_id UUID, _dispatched_by UUID, _tracking_details JSONB DEFAULT NULL)
RETURNS boolean AS $body$
DECLARE
  v_batch RECORD;
  v_item RECORD;
  v_needed NUMERIC;
  v_deducted NUMERIC;
  v_order_warehouse_id UUID;
BEGIN
  -- 1. Get and Lock Order
  SELECT warehouse_id INTO v_order_warehouse_id FROM public.orders WHERE id = _order_id FOR UPDATE;
  
  IF v_order_warehouse_id IS NULL THEN
     -- Default to Main Warehouse if not set (for legacy orders)
     SELECT id INTO v_order_warehouse_id FROM public.warehouses WHERE name = 'Main Warehouse' LIMIT 1;
     UPDATE public.orders SET warehouse_id = v_order_warehouse_id WHERE id = _order_id;
  END IF;

  -- 2. Process items
  FOR v_item IN SELECT * FROM public.order_items WHERE order_id = _order_id LOOP
    -- Convert order item quantity to base units
    v_needed := public.convert_to_base_units(v_item.quantity, v_item.pack_type::text, (SELECT row_to_json(p) FROM public.products p WHERE id = v_item.product_id));
    
    -- FIFO Deduction from batches IN THE SPECIFIED WAREHOUSE
    FOR v_batch IN 
      SELECT * FROM public.inventory_batches 
      WHERE product_id = v_item.product_id 
      AND warehouse_id = v_order_warehouse_id
      AND remaining_qty > 0 
      ORDER BY expiry_date ASC, created_at ASC 
      FOR UPDATE
    LOOP
      IF v_needed <= 0 THEN EXIT; END IF;
      
      v_deducted := LEAST(v_needed, v_batch.remaining_qty);
      
      UPDATE public.inventory_batches 
      SET remaining_qty = remaining_qty - v_deducted 
      WHERE id = v_batch.id;
      
      v_needed := v_needed - v_deducted;
      
      -- Log to ledger
      INSERT INTO public.stock_ledger (
        product_id, batch_id, qty_transacted, entry_type, 
        reference_id, reference_type, created_by
      ) VALUES (
        v_item.product_id, v_batch.id, -v_deducted, 'sale', 
        _order_id, 'order', _dispatched_by
      );
    END LOOP;
    
    IF v_needed > 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product % in warehouse % (Missing % units)', 
        (SELECT name FROM public.products WHERE id = v_item.product_id),
        (SELECT name FROM public.warehouses WHERE id = v_order_warehouse_id),
        v_needed;
    END IF;

    -- Recompute
    PERFORM public.recompute_inventory(v_item.product_id);
  END LOOP;

  -- 3. Update Order Status
  UPDATE public.orders SET 
    status = 'dispatched', 
    dispatched_at = now(),
    updated_at = now()
  WHERE id = _order_id;

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;
