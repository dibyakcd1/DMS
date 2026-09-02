-- MIGRATION: Master Schema Reconciliation & Atomic Order Engine
-- This migration resolves long-standing technical debt and stabilizes the inventory/order flow.

DO $body$ 
BEGIN

  -- 1. CLEANUP: Redundant Triggers & Functions
  DROP TRIGGER IF EXISTS log_product_price_change ON public.products;
  DROP TRIGGER IF EXISTS log_product_price_changes ON public.products;
  
  -- 2. STOCK LEDGER: Standardize Naming
  -- Ensure qty_transacted is the primary name, base_units_delta as a secondary for legacy
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'qty_transacted') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'base_units_delta') THEN
      ALTER TABLE public.stock_ledger RENAME COLUMN base_units_delta TO qty_transacted;
    ELSE
      ALTER TABLE public.stock_ledger ADD COLUMN qty_transacted NUMERIC(15,2) DEFAULT 0 NOT NULL;
    END IF;
  END IF;

  -- Ensure base_units_delta exists as a generated alias or just keep both in sync via trigger (simplest is to keep both as real columns for now if legacy code expects them)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'base_units_delta') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN base_units_delta NUMERIC(15,2) DEFAULT 0 NOT NULL;
  END IF;

  -- 3. PRODUCTS: units_per_case generation
  -- NOTE: We must drop and re-create to make it GENERATED ALWAYS
  ALTER TABLE public.products DROP COLUMN IF EXISTS units_per_case;
  ALTER TABLE public.products ADD COLUMN units_per_case INT GENERATED ALWAYS AS (units_per_packet * packets_per_case) STORED;

  -- 4. SHOPS: Beat Route Reconciliation
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'beat_route_id' AND data_type = 'text') THEN
    ALTER TABLE public.shops RENAME COLUMN beat_route_id TO beat_route_legacy;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'beat_route_id') THEN
    ALTER TABLE public.shops ADD COLUMN beat_route_id UUID REFERENCES public.beat_routes(id) ON DELETE SET NULL;
  END IF;

END $body$;

-- 4.1. VIEW: Standardized Product Stock View
CREATE OR REPLACE VIEW public.v_product_stock AS
SELECT 
  p.*,
  COALESCE(i.quantity, 0) as stock_base_units,
  CASE 
    WHEN p.units_per_packet > 0 THEN floor(COALESCE(i.quantity, 0) / p.units_per_packet)
    ELSE 0 
  END as stock_packets,
  CASE 
    WHEN p.units_per_case > 0 THEN floor(COALESCE(i.quantity, 0) / p.units_per_case)
    ELSE 0 
  END as stock_cases,
  COALESCE(i.quantity, 0) < p.min_stock as is_low_stock,
  CASE 
    WHEN p.pack_size_unit = 'g' THEN (COALESCE(i.quantity, 0) * p.pack_size_value) / 1000.0
    WHEN p.pack_size_unit = 'Kg' THEN (COALESCE(i.quantity, 0) * p.pack_size_value)
    ELSE 0 
  END as stock_kg,
  i.updated_at as last_stock_update
FROM public.products p
LEFT JOIN public.inventory i ON p.id = i.product_id;

-- 4.2. TRIGGER: Log Adjustments to Ledger
CREATE OR REPLACE FUNCTION public.log_adjustment_to_ledger()
RETURNS TRIGGER AS $body$
BEGIN
  INSERT INTO public.stock_ledger (
    product_id,
    batch_id,
    qty_transacted,
    entry_type,
    reference_id,
    reason,
    notes,
    created_by
  ) VALUES (
    NEW.product_id,
    NEW.batch_id,
    NEW.adjustment_qty,
    'adjustment',
    NEW.id,
    NEW.reason,
    NEW.notes,
    NEW.performed_by
  );
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_adjustment_ledger ON public.stock_adjustments;
CREATE TRIGGER trg_log_adjustment_ledger
AFTER INSERT ON public.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION public.log_adjustment_to_ledger();

-- 5. NEW TABLE: Order Batch Deductions
-- This tracks exactly which batch contributed to which order item, enabling safe cancellation.
CREATE TABLE IF NOT EXISTS public.order_batch_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
  qty_base_units NUMERIC(15,2) NOT NULL CHECK (qty_base_units > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup during cancellation
CREATE INDEX IF NOT EXISTS idx_batch_deductions_order ON public.order_batch_deductions(order_id);

-- 6. PRICE OVERRIDES: Consolidation
CREATE TABLE IF NOT EXISTS public.shop_product_price_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  pack_type public.pack_type NOT NULL,
  price NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shop_id, product_id, pack_type)
);

-- 7. ATOMIC ENGINE: Dispatch Order RPC
CREATE OR REPLACE FUNCTION public.dispatch_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_item RECORD;
  v_batch RECORD;
  v_needed NUMERIC;
  v_deducted NUMERIC;
  v_order_status TEXT;
BEGIN
  -- Lock the order
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order_status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order must be in approved status to dispatch. Current status: ' || v_order_status);
  END IF;

  -- Process each item in the order
  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    v_needed := v_item.qty_base_units;
    
    -- Find available batches for this product (FIFO)
    FOR v_batch IN 
      SELECT id, remaining_qty 
      FROM inventory_batches 
      WHERE product_id = v_item.product_id AND remaining_qty > 0 
      ORDER BY received_at ASC, created_at ASC 
      FOR UPDATE
    LOOP
      IF v_needed <= 0 THEN EXIT; END IF;
      
      v_deducted := LEAST(v_needed, v_batch.remaining_qty);
      
      -- Update Batch
      UPDATE inventory_batches 
      SET remaining_qty = remaining_qty - v_deducted 
      WHERE id = v_batch.id;
      
      -- Record Deduction
      INSERT INTO order_batch_deductions (order_id, order_item_id, batch_id, qty_base_units)
      VALUES (p_order_id, v_item.id, v_batch.id, v_deducted);
      
      -- Record Ledger
      INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, created_by)
      VALUES (v_item.product_id, v_batch.id, -v_deducted, 'dispatch', p_order_id, auth.uid());
      
      v_needed := v_needed - v_deducted;
    END LOOP;
    
    IF v_needed > 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product % during dispatch. Short by % units.', v_item.product_id, v_needed;
    END IF;
  END LOOP;

  -- Mark order as dispatched
  UPDATE orders 
  SET status = 'dispatched', 
      dispatched_at = now() 
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$body$;

-- 8. ATOMIC ENGINE: Cancel Order RPC
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_deduction RECORD;
  v_order_status TEXT;
BEGIN
  -- Lock the order
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is already cancelled.');
  END IF;

  -- If it was dispatched, we must restore batch stock
  IF v_order_status = 'dispatched' OR v_order_status = 'delivered' THEN
    FOR v_deduction IN SELECT * FROM order_batch_deductions WHERE order_id = p_order_id FOR UPDATE LOOP
      -- Restore Stock
      UPDATE inventory_batches 
      SET remaining_qty = remaining_qty + v_deduction.qty_base_units 
      WHERE id = v_deduction.batch_id;

      -- Record Reversal Ledger
      INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, created_by, notes)
      VALUES (
        (SELECT product_id FROM order_items WHERE id = v_deduction.order_item_id),
        v_deduction.batch_id,
        v_deduction.qty_base_units,
        'reversal',
        p_order_id,
        auth.uid(),
        'Order Cancelled/Restored'
      );
    END LOOP;
    
    -- Clean up deductions record
    DELETE FROM order_batch_deductions WHERE order_id = p_order_id;
  END IF;

  -- Mark order as cancelled
  UPDATE orders 
  SET status = 'cancelled' 
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$body$;
