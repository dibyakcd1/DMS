
-- Migration: Warehouse Management System
-- Adds support for multiple warehouses and inter-warehouse stock movement.

-- 1. Create Warehouses Table
CREATE TABLE IF NOT EXISTS public.warehouses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  code        TEXT UNIQUE,
  location    TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read warehouses" ON public.warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin manage warehouses" ON public.warehouses FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'owner')));

-- 2. Seed Main Warehouse
INSERT INTO public.warehouses (name, code, location)
VALUES ('Main Warehouse', 'MWH', 'Headquarters')
ON CONFLICT (name) DO NOTHING;

-- 3. Update inventory_batches to include warehouse_id
DO $body$ 
DECLARE
  v_main_wh_id UUID;
BEGIN
  SELECT id INTO v_main_wh_id FROM public.warehouses WHERE name = 'Main Warehouse' LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_batches' AND column_name = 'warehouse_id') THEN
    ALTER TABLE public.inventory_batches ADD COLUMN warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;
    
    -- Assign existing batches to Main Warehouse
    UPDATE public.inventory_batches SET warehouse_id = v_main_wh_id WHERE warehouse_id IS NULL;
  END IF;
END $body$;

-- 4. Update inventory table to handle multi-warehouse unique constraint
DO $body$
DECLARE
  v_main_wh_id UUID;
BEGIN
  SELECT id INTO v_main_wh_id FROM public.warehouses WHERE name = 'Main Warehouse' LIMIT 1;

  -- Drop existing pk
  ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_pkey;
  
  -- Ensure warehouse_id has a value
  UPDATE public.inventory SET warehouse_id = v_main_wh_id WHERE warehouse_id IS NULL;

  -- Create new composite pk
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_pkey') THEN
    ALTER TABLE public.inventory ADD PRIMARY KEY (product_id, warehouse_id);
  END IF;
END $body$;

-- 5. New Table for Warehouse Transfers
CREATE TABLE IF NOT EXISTS public.warehouse_transfers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  from_warehouse_id   UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  to_warehouse_id     UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  batch_id            UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
  quantity            NUMERIC(15,2) NOT NULL CHECK (quantity > 0),
  status              TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'in_transit', 'completed', 'cancelled')),
  notes               TEXT,
  performed_by        UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read warehouse_transfers" ON public.warehouse_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admin manage warehouse_transfers" ON public.warehouse_transfers FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'owner')));

-- 6. Updated Recompute Functions (Warehouse Aware)
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id UUID)
RETURNS void AS $body$
BEGIN
  -- We now insert/update per (product_id, warehouse_id)
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
  SELECT product_id, warehouse_id, COALESCE(SUM(remaining_qty), 0), now()
  FROM public.inventory_batches
  WHERE product_id = _product_id
  GROUP BY product_id, warehouse_id
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
    
  -- Clean up zero stock rows that might have been left behind for other warehouses
  -- Actually, better to keep them or just ensure all combinations exist.
  -- For now, let's just ensure we only have what we computed.
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.recompute_all_inventory()
RETURNS boolean AS $body$
BEGIN
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
  SELECT product_id, warehouse_id, COALESCE(SUM(remaining_qty), 0), now()
  FROM public.inventory_batches
  GROUP BY product_id, warehouse_id
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Trigger for Warehouse Transfer
CREATE OR REPLACE FUNCTION public.handle_warehouse_transfer()
RETURNS TRIGGER AS $body$
DECLARE
  v_source_batch_qty NUMERIC;
  v_new_batch_id UUID;
  v_batch_record RECORD;
BEGIN
  -- Get source batch details
  SELECT * INTO v_batch_record FROM public.inventory_batches WHERE id = NEW.batch_id;
  
  IF v_batch_record.remaining_qty < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient quantity in source batch for transfer';
  END IF;

  -- If we are transferring the WHOLE batch to a different warehouse
  IF v_batch_record.remaining_qty = NEW.quantity THEN
    UPDATE public.inventory_batches 
    SET warehouse_id = NEW.to_warehouse_id 
    WHERE id = NEW.batch_id;
    
    -- Log in stock ledger as movement
    INSERT INTO public.stock_ledger (
      product_id, batch_id, qty_transacted, entry_type, 
      reference_id, reference_type, notes, created_by
    ) VALUES (
      NEW.product_id, NEW.batch_id, 0, 'adjustment', 
      NEW.id, 'transfer', 'Entire batch moved to ' || (SELECT name FROM warehouses WHERE id = NEW.to_warehouse_id), 
      NEW.performed_by
    );
  ELSE
    -- Transferring PART of a batch
    -- 1. Deduct from source
    UPDATE public.inventory_batches 
    SET remaining_qty = remaining_qty - NEW.quantity 
    WHERE id = NEW.batch_id;
    
    -- 2. Create NEW batch in destination warehouse with same details
    INSERT INTO public.inventory_batches (
      product_id, warehouse_id, batch_number, received_qty, remaining_qty,
      cost_price, landed_cost, mfg_date, expiry_date, received_at, purchase_invoice_id, notes
    ) VALUES (
      v_batch_record.product_id, NEW.to_warehouse_id, v_batch_record.batch_number || '-TR', 
      NEW.quantity, NEW.quantity, v_batch_record.cost_price, v_batch_record.landed_cost,
      v_batch_record.mfg_date, v_batch_record.expiry_date, now(), v_batch_record.purchase_invoice_id,
      'Transferred from ' || (SELECT name FROM warehouses WHERE id = NEW.from_warehouse_id)
    ) RETURNING id INTO v_new_batch_id;
    
    -- 3. Log in stock ledger
    -- Deduction from source batch
    INSERT INTO public.stock_ledger (
      product_id, batch_id, qty_transacted, entry_type, 
      reference_id, reference_type, notes, created_by
    ) VALUES (
      NEW.product_id, NEW.batch_id, -NEW.quantity, 'adjustment', 
      NEW.id, 'transfer', 'Moved to another warehouse', NEW.performed_by
    );
    
    -- Addition to new record
    INSERT INTO public.stock_ledger (
      product_id, batch_id, qty_transacted, entry_type, 
      reference_id, reference_type, notes, created_by
    ) VALUES (
      NEW.product_id, v_new_batch_id, NEW.quantity, 'purchase', 
      NEW.id, 'transfer', 'Received from another warehouse', NEW.performed_by
    );
  END IF;

  -- Force recompute
  PERFORM public.recompute_inventory(NEW.product_id);
  
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_warehouse_transfer ON public.warehouse_transfers;
CREATE TRIGGER trg_warehouse_transfer
AFTER INSERT ON public.warehouse_transfers
FOR EACH ROW EXECUTE FUNCTION public.handle_warehouse_transfer();

-- 8. Fix v_product_stock to be warehouse-aware or stay as a summary?
-- Usually users want a TOTAL summary across all warehouses on the main page,
-- but dedicated breakdowns elsewhere.
-- Let's keep the view as is (summing across warehouses) but update it to be correct.

DROP VIEW IF EXISTS public.v_product_stock CASCADE;

CREATE VIEW public.v_product_stock AS
WITH product_totals AS (
  SELECT 
    p.id as product_id,
    COALESCE(SUM(i.stock_base_units), 0) as stock_base_units,
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
  GROUP BY p.id, p.units_per_packet, p.packets_per_case, p.units_per_case, p.case_qty_value, p.pack_size_value, p.case_qty_unit, p.pack_size_unit
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
