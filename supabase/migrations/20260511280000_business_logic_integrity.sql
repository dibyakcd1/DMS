-- Item 2.1 - 2.7: Business Logic & Data Integrity Consolidation Final
-- This migration fixes critical gaps in stock atomicity, order validation, credit limits, and consistency.

-- 0. Ensure is_over_limit column exists and warehouse_id integrity
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_over_limit BOOLEAN DEFAULT false;

-- G4 Fix: Ensure purchase_invoices has warehouse_id and is not null where possible
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_invoices' AND column_name = 'warehouse_id') THEN
    ALTER TABLE public.purchase_invoices ADD COLUMN warehouse_id UUID REFERENCES public.warehouses(id);
  END IF;
END $$;

-- 1. Atomic Dispatch RPC (Item 2.1) - Corrected for FIFO Batches
CREATE OR REPLACE FUNCTION public.dispatch_order_v2(
  p_order_id uuid,
  p_warehouse_id uuid DEFAULT NULL,
  p_dispatched_at timestamp with time zone DEFAULT now()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_item record;
  v_batch record;
  v_warehouse_id uuid;
  v_order_status text;
  v_deduction_units numeric;
  v_needed numeric;
  v_deducted numeric;
BEGIN
  -- 1. Lock the order row to prevent concurrent dispatches of the same order
  SELECT status, warehouse_id INTO v_order_status, v_warehouse_id
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order_status = 'dispatched' THEN
    RETURN json_build_object('success', false, 'error', 'Order already dispatched');
  END IF;

  IF v_order_status = 'cancelled' OR v_order_status = 'rejected' THEN
    RETURN json_build_object('success', false, 'error', 'Cannot dispatch cancelled or rejected order');
  END IF;

  -- Use provided warehouse or order's default
  v_warehouse_id := COALESCE(p_warehouse_id, v_warehouse_id);
  IF v_warehouse_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No warehouse specified for dispatch');
  END IF;

  -- 2. Process each item with ATOMIC FIFO BATCH DEDUCTION
  FOR v_item IN 
    SELECT oi.*, p.units_per_packet, p.packets_per_case, p.name as product_name
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    -- Calculate units to deduct based on pack_type
    v_deduction_units := CASE 
      WHEN v_item.pack_type = 'unit' THEN v_item.quantity
      WHEN v_item.pack_type = 'packet' THEN v_item.quantity * COALESCE(v_item.units_per_packet, 1)
      WHEN v_item.pack_type = 'case' THEN v_item.quantity * COALESCE(v_item.units_per_packet, 1) * COALESCE(v_item.packets_per_case, 1)
      ELSE v_item.quantity 
    END;

    v_needed := v_deduction_units;

    -- FIFO BATCH DEDUCTION WITH LOCKING
    FOR v_batch IN 
      SELECT * FROM public.inventory_batches 
      WHERE product_id = v_item.product_id 
      AND warehouse_id = v_warehouse_id
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
      
      -- Ledger entry for this batch deduction
      INSERT INTO public.stock_ledger (
        product_id, 
        warehouse_id, 
        batch_id,
        change_amount, 
        source_type, 
        source_id,
        pack_type,
        quantity,
        notes
      ) VALUES (
        v_item.product_id,
        v_warehouse_id,
        v_batch.id,
        -v_deducted,
        'order_dispatch',
        p_order_id,
        v_item.pack_type,
        v_item.quantity,
        'Batch FIFO deduction for order ' || p_order_id
      );
    END LOOP;

    IF v_needed > 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product % in warehouse. Missing % units.', v_item.product_name, v_needed;
    END IF;

    -- 3. Update master inventory table (Summary)
    UPDATE public.inventory
    SET 
      stock_base_units = stock_base_units - v_deduction_units,
      last_updated_at = now()
    WHERE product_id = v_item.product_id 
    AND warehouse_id = v_warehouse_id;

    IF NOT FOUND THEN
      INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
      VALUES (v_item.product_id, v_warehouse_id, -v_deduction_units, now());
    END IF;
  END LOOP;

  -- 4. Mark order dispatched
  UPDATE public.orders 
  SET status = 'dispatched', dispatched_at = p_dispatched_at 
  WHERE id = p_order_id;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 2. Enhanced Order Insertion with Server-side Validation (Items 2.2 & 2.3)
CREATE OR REPLACE FUNCTION public.insert_order_with_pin_v2(
  p_session_token text,
  p_order_data jsonb,
  p_items_data jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_calc_subtotal numeric := 0;
  v_calc_gst numeric := 0;
  v_calc_total numeric := 0;
  v_shop_id uuid;
  v_warehouse_id uuid;
  v_credit_limit numeric;
  v_current_balance numeric;
  v_is_over_limit boolean := false;
BEGIN
  -- 1. Validate session token
  SELECT profile_id INTO v_profile_id
  FROM public.salesperson_sessions
  WHERE session_token = p_session_token
  AND expires_at > now();

  IF v_profile_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired session');
  END IF;

  v_shop_id := (p_order_data->>'shop_id')::uuid;
  v_warehouse_id := (p_order_data->>'warehouse_id')::uuid;

  -- 2. Credit Limit Check (Item 2.3)
  SELECT credit_limit, COALESCE(balance, 0) INTO v_credit_limit, v_current_balance
  FROM public.shops
  WHERE id = v_shop_id;

  -- 3. VALIDATE TOTALS (Item 2.2)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
  LOOP
    v_calc_subtotal := v_calc_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
    v_calc_gst := v_calc_gst + (((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric) * (COALESCE((v_item->>'gst_rate')::numeric, 0) / 100));
  END LOOP;

  v_calc_total := v_calc_subtotal + v_calc_gst;
  -- Apply discount logic
  IF (p_order_data->>'discount_type' = 'flat') THEN
    v_calc_total := v_calc_total - COALESCE((p_order_data->>'discount_amount')::numeric, 0);
  ELSIF (p_order_data->>'discount_type' = 'percentage') THEN
    v_calc_total := v_calc_total * (1 - (COALESCE((p_order_data->>'discount_amount')::numeric, 0) / 100));
  END IF;

  v_is_over_limit := (v_credit_limit > 0 AND (v_current_balance + v_calc_total) > v_credit_limit);

  -- Reject IF NOT DRAFT and exceeds limit
  IF v_is_over_limit AND (COALESCE(p_order_data->>'status', 'pending_approval') != 'draft') THEN
    RETURN json_build_object('success', false, 'error', 'Credit limit exceeded. Shop Limit: ' || v_credit_limit || ', New Balance: ' || (v_current_balance + v_calc_total));
  END IF;

  -- 4. INSERT ORDER
  INSERT INTO public.orders (
    shop_id, salesperson_id, warehouse_id, status, 
    subtotal, gst_total, total, 
    discount_amount, discount_type, notes, order_date,
    is_over_limit
  ) VALUES (
    v_shop_id, v_profile_id, v_warehouse_id, COALESCE(p_order_data->>'status', 'pending_approval')::order_status,
    v_calc_subtotal, v_calc_gst, v_calc_total,
    COALESCE((p_order_data->>'discount_amount')::numeric, 0), COALESCE(p_order_data->>'discount_type', 'flat'),
    p_order_data->>'notes', COALESCE((p_order_data->>'order_date')::timestamp with time zone, now()),
    v_is_over_limit
  ) RETURNING id INTO v_order_id;

  -- 5. INSERT ITEMS
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, quantity, unit_price, gst_rate, pack_type,
      line_total, line_total_tax_exclusive, line_tax_amount
    ) VALUES (
      v_order_id, 
      (v_item->>'product_id')::uuid, 
      (v_item->>'quantity')::numeric, 
      (v_item->>'unit_price')::numeric, 
      (v_item->>'gst_rate')::numeric, 
      (v_item->>'pack_type')::pack_type,
      ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric * (1 + COALESCE((v_item->>'gst_rate')::numeric, 0)/100)),
      ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric),
      ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric * (COALESCE((v_item->>'gst_rate')::numeric, 0)/100))
    );
  END LOOP;

  RETURN json_build_object('success', true, 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. Payment Reconciliation Trigger (Item 2.5)
CREATE OR REPLACE FUNCTION public.fn_sync_invoice_paid_amount()
RETURNS trigger AS $$
BEGIN
  UPDATE public.invoices
  SET amount_paid = (
    SELECT COALESCE(SUM(amount), 0) 
    FROM public.payments 
    WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    AND is_void = false
  )
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_sync_payment_to_invoice ON public.payments;
CREATE TRIGGER tr_sync_payment_to_invoice
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_invoice_paid_amount();

-- 4. Pack Type Defaults and Validation (Item 2.7)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_units_per_packet') THEN
    ALTER TABLE public.products ADD CONSTRAINT check_units_per_packet CHECK (units_per_packet > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_packets_per_case') THEN
    ALTER TABLE public.products ADD CONSTRAINT check_packets_per_case CHECK (packets_per_case > 0);
  END IF;
END $$;

UPDATE public.products SET units_per_packet = 1 WHERE units_per_packet IS NULL OR units_per_packet <= 0;
UPDATE public.products SET packets_per_case = 1 WHERE packets_per_case IS NULL OR packets_per_case <= 0;

-- 5. Void Order Stock Reversal (Item 2.4)
CREATE OR REPLACE FUNCTION public.fn_handle_order_void()
RETURNS trigger AS $$
DECLARE
  v_item record;
  v_deduction_units numeric;
BEGIN
  IF NEW.is_void = true AND (OLD.is_void = false OR OLD.is_void IS NULL) THEN
    IF OLD.status = 'dispatched' THEN
      FOR v_item IN 
        SELECT oi.*, p.units_per_packet, p.packets_per_case
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = NEW.id
      LOOP
        v_deduction_units := CASE 
          WHEN v_item.pack_type = 'unit' THEN v_item.quantity
          WHEN v_item.pack_type = 'packet' THEN v_item.quantity * COALESCE(v_item.units_per_packet, 1)
          WHEN v_item.pack_type = 'case' THEN v_item.quantity * COALESCE(v_item.units_per_packet, 1) * COALESCE(v_item.packets_per_case, 1)
          ELSE v_item.quantity
        END;

        UPDATE public.inventory
        SET stock_base_units = stock_base_units + v_deduction_units,
            last_updated_at = now()
        WHERE product_id = v_item.product_id AND warehouse_id = NEW.warehouse_id;

        INSERT INTO public.stock_ledger (
          product_id, warehouse_id, change_amount, 
          source_type, source_id, notes
        ) VALUES (
          v_item.product_id, NEW.warehouse_id, v_deduction_units,
          'order_void_reversal', NEW.id, 'Stock reversed due to order void'
        );
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_handle_order_void ON public.orders;
CREATE TRIGGER tr_handle_order_void
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_handle_order_void();

-- 6. Avg Landed Cost Null Guards (Item 2.6)
DROP VIEW IF EXISTS public.margin_report_view CASCADE;
CREATE OR REPLACE VIEW public.margin_report_view AS
WITH current_cost AS (
  SELECT product_id, AVG(landed_cost) as avg_landed_cost
  FROM public.inventory_batches WHERE remaining_qty > 0
  GROUP BY product_id
),
basic_unit_price AS (
  SELECT product_id, MIN(price) as standard_selling_price
  FROM public.product_price_tiers
  WHERE shop_type = 'basic' AND pack_type = 'pcs'
  GROUP BY product_id
)
SELECT
  p.id as product_id, p.name as product_name, p.sku,
  COALESCE(bup.standard_selling_price, p.mrp, 0.01) as standard_selling_price,
  COALESCE(NULLIF(cc.avg_landed_cost, 0), 0) as avg_landed_cost,
  CASE WHEN COALESCE(bup.standard_selling_price, p.mrp, 0) > 0 THEN
    ((COALESCE(bup.standard_selling_price, p.mrp) - COALESCE(NULLIF(cc.avg_landed_cost, 0), 0))
      / COALESCE(bup.standard_selling_price, p.mrp)) * 100
  ELSE 0 END as margin_percent
FROM public.products p
LEFT JOIN current_cost cc ON p.id = cc.product_id
LEFT JOIN basic_unit_price bup ON p.id = bup.product_id
WHERE p.is_active = true;

DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock AS
WITH stock_summary AS (
  SELECT 
    product_id, 
    SUM(stock_base_units) as stock_base_units, 
    AVG(NULLIF(avg_landed_cost, 0)) as avg_landed_cost
  FROM public.inventory
  GROUP BY product_id
)
SELECT 
    p.*,
    COALESCE(s.stock_base_units, 0) as stock_base_units,
    COALESCE(NULLIF(s.avg_landed_cost, 0), 0.01) as avg_landed_cost
FROM public.products p
LEFT JOIN stock_summary s ON p.id = s.product_id;

DROP VIEW IF EXISTS public.v_product_stock_v3 CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock_v3 AS
SELECT 
    p.*,
    COALESCE(s.stock_base_units, 0) as stock_base_units,
    COALESCE(NULLIF(s.avg_landed_cost, 0), 0.01) as guarded_avg_landed_cost
FROM public.products p
LEFT JOIN (
  SELECT product_id, SUM(stock_base_units) as stock_base_units, AVG(avg_landed_cost) as avg_landed_cost
  FROM public.inventory
  GROUP BY product_id
) s ON p.id = s.product_id;
