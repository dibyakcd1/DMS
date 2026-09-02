
-- DEFINITIVE INVENTORY RECONCILIATION & STOCK RESTORATION V2
-- This migration fixes core conversion logic, enforces batch-aware stock movements,
-- and implements stock restoration on order deletion.

-- 1. Harmonize Inventory Table Schema
DO $body$
BEGIN
    -- Ensure stock_base_units exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'stock_base_units') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'quantity') THEN
            ALTER TABLE public.inventory RENAME COLUMN quantity TO stock_base_units;
        ELSE
            ALTER TABLE public.inventory ADD COLUMN stock_base_units numeric DEFAULT 0;
        END IF;
    END IF;

    -- Ensure last_updated_at exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'last_updated_at') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'updated_at') THEN
            ALTER TABLE public.inventory RENAME COLUMN updated_at TO last_updated_at;
        ELSE
            ALTER TABLE public.inventory ADD COLUMN last_updated_at timestamptz DEFAULT now();
        END IF;
    END IF;

    -- Ensure warehouse_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'warehouse_id') THEN
        ALTER TABLE public.inventory ADD COLUMN warehouse_id uuid;
    END IF;

    -- Standardize PK
    ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_pkey;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_pkey') THEN
        ALTER TABLE public.inventory ADD PRIMARY KEY (product_id);
    END IF;
END $body$;

-- 2. Definitive Unit Converter
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID, 
  p_qty NUMERIC, 
  p_unit TEXT
)
RETURNS NUMERIC AS $body$
DECLARE
  v_upp INTEGER;
  v_ppc INTEGER;
  v_upc INTEGER;
  v_psv NUMERIC;
  v_psu TEXT;
  v_cqv NUMERIC;
  v_cqu TEXT;
  v_normalized_unit TEXT;
BEGIN
  SELECT 
    units_per_packet, packets_per_case, units_per_case,
    pack_size_value, pack_size_unit,
    case_qty_value, case_qty_unit
  INTO v_upp, v_ppc, v_upc, v_psv, v_psu, v_cqv, v_cqu
  FROM public.products 
  WHERE id = p_product_id;
  
  v_psu := lower(COALESCE(v_psu, 'g'));
  v_cqu := lower(COALESCE(v_cqu, 'kg'));
  v_normalized_unit := lower(trim(p_unit));
  
  -- KG Handling
  IF v_normalized_unit = 'kg' THEN
    IF v_psu IN ('g', 'gms', 'gm', 'grams') AND COALESCE(v_psv, 0) > 0 THEN
      RETURN (p_qty * 1000.0) / v_psv;
    ELSIF v_psu IN ('kg', 'kgs', 'kilograms') AND COALESCE(v_psv, 0) > 0 THEN
      RETURN p_qty / v_psv;
    ELSE
      RETURN p_qty; 
    END IF;
  
  -- Packet Handling
  ELSIF v_normalized_unit IN ('packet', 'pkt', 'packets', 'pack') THEN
    RETURN p_qty * COALESCE(v_upp, 1);
  
  -- Case Handling (ROBUST)
  ELSIF v_normalized_unit IN ('case', 'carton', 'ctn', 'box', 'bag') THEN
    -- Priority 1: Multiplier of UPP * PPC
    IF (COALESCE(v_upp, 1) * COALESCE(v_ppc, 1)) > 1 THEN
      RETURN p_qty * (COALESCE(v_upp, 1) * COALESCE(v_ppc, 1));
    -- Priority 2: Use UPC
    ELSIF COALESCE(v_upc, 1) > 1 THEN
      RETURN p_qty * v_upc;
    -- Priority 3: Weight based fallback
    ELSIF COALESCE(v_cqv, 0) > 0 AND COALESCE(v_psv, 0) > 0 THEN
      IF v_cqu = 'kg' AND v_psu IN ('g', 'gms', 'gm', 'grams') THEN
        RETURN p_qty * ((v_cqv * 1000.0) / v_psv);
      ELSIF v_cqu = v_psu THEN
        RETURN p_qty * (v_cqv / v_psv);
      END IF;
    END IF;
    RETURN p_qty * COALESCE(v_ppc, 1);
    
  ELSE 
    RETURN p_qty;
  END IF;
END;
$body$ LANGUAGE plpgsql STABLE;

-- 3. Recompute Functions
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id UUID)
RETURNS void AS $body$
BEGIN
  INSERT INTO public.inventory (product_id, stock_base_units, last_updated_at)
  SELECT product_id, COALESCE(SUM(remaining_qty), 0), now()
  FROM public.inventory_batches
  WHERE product_id = _product_id
  GROUP BY product_id
  ON CONFLICT (product_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.recompute_all_inventory()
RETURNS boolean AS $body$
BEGIN
  INSERT INTO public.inventory (product_id, stock_base_units, last_updated_at)
  SELECT product_id, COALESCE(SUM(remaining_qty), 0), now()
  FROM public.inventory_batches
  GROUP BY product_id
  ON CONFLICT (product_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Batch-Aware Dispatch logic
CREATE OR REPLACE FUNCTION public.dispatch_order(p_order_id UUID, p_dispatched_at TIMESTAMPTZ DEFAULT now())
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
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF v_status IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found'); END IF;
  IF v_status NOT IN ('pending_approval', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order ' || v_status || ' cannot be dispatched.');
  END IF;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    v_needed := public.convert_to_base_units(v_item.product_id, v_item.quantity, v_item.pack_type);
    
    FOR v_batch IN 
      SELECT id, remaining_qty FROM inventory_batches 
      WHERE product_id = v_item.product_id AND remaining_qty > 0 
      ORDER BY received_at ASC, created_at ASC FOR UPDATE
    LOOP
      IF v_needed <= 0 THEN EXIT; END IF;
      v_deducted := LEAST(v_needed, v_batch.remaining_qty);
      
      UPDATE inventory_batches SET remaining_qty = remaining_qty - v_deducted WHERE id = v_batch.id;
      
      INSERT INTO order_batch_deductions (order_id, order_item_id, batch_id, qty_base_units)
      VALUES (p_order_id, v_item.id, v_batch.id, v_deducted);
      
      INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, reference_type, created_by, notes)
      VALUES (v_item.product_id, v_batch.id, -v_deducted, 'dispatch', p_order_id, 'order', auth.uid(), 'Order Dispatched');
      
      v_needed := v_needed - v_deducted;
    END LOOP;
    
    IF v_needed > 0 THEN RAISE EXCEPTION 'Insufficient stock in batches for Order Item %', v_item.id; END IF;
    PERFORM public.recompute_inventory(v_item.product_id);
  END LOOP;

  UPDATE orders SET status = 'dispatched', dispatched_at = COALESCE(p_dispatched_at, now()) WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true);
END;
$body$;

-- 5. Batch-Aware Cancellation
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_deduction RECORD;
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF v_status IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found'); END IF;
  
  IF v_status IN ('dispatched', 'delivered') THEN
    FOR v_deduction IN 
      SELECT d.*, i.product_id FROM order_batch_deductions d 
      JOIN order_items i ON d.order_item_id = i.id 
      WHERE d.order_id = p_order_id FOR UPDATE 
    LOOP
      UPDATE inventory_batches SET remaining_qty = remaining_qty + v_deduction.qty_base_units WHERE id = v_deduction.batch_id;
      INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, reference_type, created_by, notes)
      VALUES (v_deduction.product_id, v_deduction.batch_id, v_deduction.qty_base_units, 'reversal', p_order_id, 'order', auth.uid(), 'Order Cancelled');
      PERFORM public.recompute_inventory(v_deduction.product_id);
    END LOOP;
    DELETE FROM order_batch_deductions WHERE order_id = p_order_id;
  END IF;

  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true);
END;
$body$;

-- 6. Trigger for Stock Restoration on Order Record Deletion
CREATE OR REPLACE FUNCTION public.handle_order_deletion_stock_restore()
RETURNS TRIGGER AS $body$
DECLARE
  v_deduction RECORD;
BEGIN
  IF OLD.status IN ('dispatched', 'delivered') THEN
    FOR v_deduction IN 
      SELECT d.*, i.product_id FROM public.order_batch_deductions d
      JOIN public.order_items i ON d.order_item_id = i.id
      WHERE d.order_id = OLD.id FOR UPDATE
    LOOP
      UPDATE public.inventory_batches SET remaining_qty = remaining_qty + v_deduction.qty_base_units WHERE id = v_deduction.batch_id;
      INSERT INTO public.stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, reference_type, created_by, notes)
      VALUES (v_deduction.product_id, v_deduction.batch_id, v_deduction.qty_base_units, 'reversal', OLD.id, 'order', auth.uid(), 'Source: Hard Delete (' || OLD.status || ')');
      PERFORM public.recompute_inventory(v_deduction.product_id);
    END LOOP;
  END IF;
  RETURN OLD;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_restore_stock_on_order_delete ON public.orders;
CREATE TRIGGER trg_restore_stock_on_order_delete
BEFORE DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_order_deletion_stock_restore();

-- 7. Heal Bharat Masala Product Packaging Data
UPDATE public.products
SET packets_per_case = ROUND((case_qty_value * 1000.0 / pack_size_value))::INT
WHERE (packets_per_case IS NULL OR packets_per_case <= 1)
  AND case_qty_unit = 'kg'
  AND pack_size_unit IN ('g', 'gms', 'gm', 'grams')
  AND case_qty_value > 0
  AND pack_size_value > 0;

-- 8. Final Unified View for Product Stock
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock AS
WITH product_totals AS (
  SELECT 
    p.id as product_id,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
      WHEN COALESCE(p.case_qty_value, 0) > 0 AND COALESCE(p.pack_size_value, 0) > 0 THEN
        CASE 
          WHEN lower(p.case_qty_unit) = 'kg' AND lower(p.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') THEN (p.case_qty_value * 1000.0) / p.pack_size_value
          WHEN lower(p.case_qty_unit) = lower(p.pack_size_unit) THEN p.case_qty_value / p.pack_size_value
          ELSE 1
        END
      ELSE 1 
    END as calc_units_per_case
  FROM 
    public.products p
  LEFT JOIN public.inventory i ON p.id = i.product_id
)
SELECT 
  p.*,
  t.stock_base_units as stock_base_units,
  t.stock_base_units as stock_pcs,
  CASE 
    WHEN COALESCE(p.units_per_packet, 1) > 1 THEN FLOOR(t.stock_base_units::numeric / p.units_per_packet)
    ELSE t.stock_base_units
  END as stock_packets,
  CASE 
    WHEN t.calc_units_per_case > 0 THEN FLOOR(t.stock_base_units::numeric / t.calc_units_per_case)
    ELSE 0 
  END as stock_cases,
  CASE 
    WHEN lower(p.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') AND p.pack_size_value > 0 THEN ROUND((t.stock_base_units * p.pack_size_value / 1000.0)::numeric, 3)
    WHEN lower(p.pack_size_unit) IN ('kg', 'kgs', 'kilograms') AND p.pack_size_value > 0 THEN ROUND((t.stock_base_units * p.pack_size_value)::numeric, 3)
    ELSE 0
  END as stock_kg,
  (t.stock_base_units <= p.min_stock) as is_low_stock
FROM 
  public.products p
JOIN 
  product_totals t ON p.id = t.product_id;

-- 9. Run Final Sync
SELECT public.recompute_all_inventory();

-- 10. Grants
GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_order(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_inventory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_inventory(UUID) TO authenticated;
