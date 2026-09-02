-- MIGRATION: STOCK-1, STOCK-3, STOCK-4, STOCK-7, STOCK-8 - Atomic Stock Management
-- This migration hardens the stock engine, prevents negative stock, and moves GRN posting to a server-side RPC.

-- 1. Preventive Constraints (STOCK-1)
DO $body$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_batches_remaining_qty_non_negative') THEN
    ALTER TABLE public.inventory_batches ADD CONSTRAINT inventory_batches_remaining_qty_non_negative CHECK (remaining_qty >= 0);
  END IF;
END $body$;

-- 2. Enhanced Recompute Function (STOCK-3 - already using ON CONFLICT in warehouse migration, but let's double check/harden)
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id UUID)
RETURNS void AS $body$
BEGIN
  -- We now insert/update per (product_id, warehouse_id)
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
  SELECT 
    p.id, 
    w.id, 
    COALESCE(SUM(ib.remaining_qty), 0), 
    now()
  FROM 
    public.products p
  CROSS JOIN 
    public.warehouses w
  LEFT JOIN 
    public.inventory_batches ib ON ib.product_id = p.id AND ib.warehouse_id = w.id
  WHERE 
    p.id = _product_id
  GROUP BY 
    p.id, w.id
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Consolidated GRN Posting RPC (STOCK-4)
CREATE OR REPLACE FUNCTION public.post_grn(_grn_id UUID, _performed_by UUID)
RETURNS boolean AS $body$
DECLARE
  v_grn RECORD;
  v_item RECORD;
  v_product RECORD;
  v_base_qty NUMERIC;
  v_unit_landed NUMERIC;
  v_batch_id UUID;
  v_multiplier NUMERIC;
  v_upc NUMERIC;
  v_warehouse_id UUID;
BEGIN
  -- 1. Fetch and Lock GRN
  SELECT * INTO v_grn FROM public.purchase_invoices WHERE id = _grn_id FOR UPDATE;
  
  IF v_grn.status = 'posted' THEN
    RAISE EXCEPTION 'GRN already posted';
  END IF;

  v_warehouse_id := v_grn.warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses LIMIT 1;
  END IF;

  -- 2. Iterate items
  FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = _grn_id LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
    
    -- Calulate UPC (Units Per Case)
    v_upc := (COALESCE(v_item.units_per_packet, 1) * COALESCE(v_item.packets_per_case, 1));
    
    -- Multiplier based on pack_type
    IF v_item.pack_type = 'case' THEN
      v_multiplier := v_upc;
    ELSIF v_item.pack_type = 'packet' THEN
      v_multiplier := COALESCE(v_item.units_per_packet, 1);
    ELSIF v_item.pack_type = 'kg' OR v_item.pack_type = 'ltr' THEN
      IF (v_product.pack_size_unit IN ('g', 'gms', 'gm', 'grams', 'ml')) THEN
          v_multiplier := 1000.0 / COALESCE(v_product.pack_size_value, 1);
      ELSE
          v_multiplier := 1.0 / COALESCE(v_product.pack_size_value, 1);
      END IF;
    ELSIF v_item.pack_type = 'g' OR v_item.pack_type = 'ml' THEN
      IF (v_product.pack_size_unit IN ('g', 'gms', 'gm', 'grams', 'ml')) THEN
          v_multiplier := 1.0 / COALESCE(v_product.pack_size_value, 1);
      ELSE
          v_multiplier := 0.001 / COALESCE(v_product.pack_size_value, 1);
      END IF;
    ELSE
      v_multiplier := 1.0;
    END IF;

    v_base_qty := v_item.quantity * v_multiplier;
    v_unit_landed := v_item.unit_cost / v_multiplier;

    -- 3. Create Batch
    INSERT INTO public.inventory_batches (
      product_id, 
      warehouse_id,
      purchase_invoice_id, 
      batch_number, 
      received_qty, 
      remaining_qty, 
      cost_price, 
      landed_cost, 
      expiry_date, 
      mfg_date, 
      received_at, 
      received_by
    ) VALUES (
      v_item.product_id, 
      v_warehouse_id,
      _grn_id, 
      v_grn.invoice_number || '-' || upper(substring(gen_random_uuid()::text, 1, 4)),
      v_base_qty, 
      v_base_qty, 
      v_unit_landed, 
      v_unit_landed,
      COALESCE(v_item.expiry_date, (now() + interval '1 year')::date),
      v_item.mfg_date,
      v_grn.invoice_date,
      _performed_by
    ) RETURNING id INTO v_batch_id;

    -- 4. Log to Stock Ledger
    INSERT INTO public.stock_ledger (
      product_id, 
      batch_id, 
      qty_transacted, 
      entry_type, 
      reference_id, 
      reference_type, 
      created_by
    ) VALUES (
      v_item.product_id, 
      v_batch_id, 
      v_base_qty, 
      'purchase', 
      _grn_id, 
      'grn', 
      _performed_by
    );

    -- 5. Recompute Inventory for Product
    PERFORM public.recompute_inventory(v_item.product_id);
  END LOOP;

  -- 6. Update GRN status
  UPDATE public.purchase_invoices SET status = 'posted' WHERE id = _grn_id;
  
  -- 7. Log Action
  INSERT INTO public.grn_approval_log (grn_id, action, performed_by, notes)
  VALUES (_grn_id, 'posted', _performed_by, 'GRN posted via atomic RPC');

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enhanced Adjustment Trigger (STOCK-7)
CREATE OR REPLACE FUNCTION public.handle_stock_adjustment()
RETURNS TRIGGER AS $body$
BEGIN
  UPDATE public.inventory_batches 
  SET remaining_qty = remaining_qty + NEW.adjustment_qty
  WHERE id = NEW.batch_id;
  
  -- Log to Stock Ledger
  INSERT INTO public.stock_ledger (
    product_id, 
    batch_id, 
    qty_transacted, 
    entry_type, 
    reference_id, 
    reference_type, 
    notes,
    created_by
  ) VALUES (
    NEW.product_id, 
    NEW.batch_id, 
    NEW.adjustment_qty, 
    'adjustment', 
    NEW.id, 
    'adjustment', 
    NEW.reason || ': ' || COALESCE(NEW.notes, ''),
    NEW.performed_by
  );

  -- Recompute
  PERFORM public.recompute_inventory(NEW.product_id);
  
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Enhanced Transfer Trigger (STOCK-8)
CREATE OR REPLACE FUNCTION public.handle_stock_transfer()
RETURNS TRIGGER AS $body$
BEGIN
  -- Deduct from source
  UPDATE public.inventory_batches 
  SET remaining_qty = remaining_qty - NEW.quantity
  WHERE id = NEW.from_batch_id;
  
  -- Log deduction
  INSERT INTO public.stock_ledger (
    product_id, batch_id, qty_transacted, entry_type, 
    reference_id, reference_type, notes, created_by
  ) VALUES (
    NEW.product_id, NEW.from_batch_id, -NEW.quantity, 'adjustment', 
    NEW.id, 'transfer', 'Internal transfer out', NEW.performed_by
  );

  -- Add to destination
  UPDATE public.inventory_batches 
  SET remaining_qty = remaining_qty + NEW.quantity
  WHERE id = NEW.to_batch_id;
  
  -- Log addition
  INSERT INTO public.stock_ledger (
    product_id, batch_id, qty_transacted, entry_type, 
    reference_id, reference_type, notes, created_by
  ) VALUES (
    NEW.product_id, NEW.to_batch_id, NEW.quantity, 'adjustment', 
    NEW.id, 'transfer', 'Internal transfer in', NEW.performed_by
  );

  -- Recompute
  PERFORM public.recompute_inventory(NEW.product_id);
  
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;
