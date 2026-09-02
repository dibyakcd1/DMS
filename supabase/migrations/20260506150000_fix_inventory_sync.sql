-- FIX: Inventory Synchronization & Visibility
-- This migration ensures a single source of truth for inventory and fixes the RPCs.

DO $body$ 
BEGIN
  -- 1. Standardize Inventory Table to be single-row per product (for now)
  -- If there are multiple rows per product (warehouses), we'll sum them into a single-row summary for the view.
  -- But we need to ensure the quantity/stock_base_units column naming is consistent.
  
  -- Ensure 'quantity' exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'quantity') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'stock_base_units') THEN
      ALTER TABLE public.inventory RENAME COLUMN stock_base_units TO quantity;
    ELSE
      ALTER TABLE public.inventory ADD COLUMN quantity NUMERIC(15,2) DEFAULT 0 NOT NULL;
    END IF;
  END IF;

  -- Remove 'stock_base_units' if it's still there and separate from quantity
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'stock_base_units') AND 
     EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'quantity') THEN
     -- Sync before dropping
     UPDATE public.inventory SET quantity = COALESCE(stock_base_units, quantity);
     ALTER TABLE public.inventory DROP COLUMN stock_base_units;
  END IF;

  -- Ensure updating_at exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'updated_at') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'last_updated_at') THEN
      ALTER TABLE public.inventory RENAME COLUMN last_updated_at TO updated_at;
    ELSE
      ALTER TABLE public.inventory ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
  END IF;

END $body$;

-- 2. Improved sync function to handle the case where all batches are deleted (sets qty to 0)
CREATE OR REPLACE FUNCTION public.sync_inventory_from_batches()
RETURNS TRIGGER AS $body$
DECLARE
  v_prod_id UUID;
  v_qty NUMERIC;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_prod_id := OLD.product_id;
  ELSE
    v_prod_id := NEW.product_id;
  END IF;

  SELECT COALESCE(SUM(remaining_qty), 0) INTO v_qty
  FROM public.inventory_batches
  WHERE product_id = v_prod_id;

  INSERT INTO public.inventory (product_id, quantity, updated_at)
  VALUES (v_prod_id, v_qty, now())
  ON CONFLICT (product_id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    updated_at = now();
    
  RETURN NULL;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix recompute_inventory RPC (handles 0 case)
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id uuid)
RETURNS void AS $body$
DECLARE
  v_qty numeric;
BEGIN
  SELECT COALESCE(SUM(remaining_qty), 0) INTO v_qty
  FROM public.inventory_batches
  WHERE product_id = _product_id;

  INSERT INTO public.inventory (product_id, quantity, updated_at)
  VALUES (_product_id, v_qty, now())
  ON CONFLICT (product_id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    updated_at = now();
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Robust v_product_stock View
DROP VIEW IF EXISTS public.v_product_stock;
CREATE OR REPLACE VIEW public.v_product_stock AS
SELECT 
  p.*,
  COALESCE(i.quantity, 0) as stock_base_units,
  COALESCE(i.quantity, 0) as stock_pcs,
  CASE 
    WHEN p.units_per_packet > 0 THEN floor(COALESCE(i.quantity, 0) / p.units_per_packet)
    ELSE 0 
  END as stock_packets,
  CASE 
    WHEN p.units_per_case > 0 THEN floor(COALESCE(i.quantity, 0) / p.units_per_case)
    ELSE 0 
  END as stock_cases,
  CASE 
    WHEN LOWER(p.pack_size_unit) = 'g' OR LOWER(p.pack_size_unit) = 'gms' THEN (COALESCE(i.quantity, 0) * COALESCE(p.pack_size_value, 0)) / 1000.0
    WHEN LOWER(p.pack_size_unit) = 'kg' THEN (COALESCE(i.quantity, 0) * COALESCE(p.pack_size_value, 0))
    ELSE 0 
  END as stock_kg,
  COALESCE(i.quantity, 0) <= p.min_stock as is_low_stock,
  i.updated_at as last_stock_update,
  CASE 
    WHEN COALESCE(i.quantity, 0) > 0 THEN (
      SELECT SUM(remaining_qty * landed_cost) / SUM(remaining_qty)
      FROM public.inventory_batches
      WHERE product_id = p.id AND remaining_qty > 0
    )
    ELSE 0
  END as avg_landed_cost
FROM public.products p
LEFT JOIN public.inventory i ON p.id = i.product_id;

-- 5. Force a global sync
INSERT INTO public.inventory (product_id, quantity, updated_at)
SELECT product_id, SUM(remaining_qty), now()
FROM public.inventory_batches
GROUP BY product_id
ON CONFLICT (product_id) DO UPDATE SET 
  quantity = EXCLUDED.quantity,
  updated_at = now();
