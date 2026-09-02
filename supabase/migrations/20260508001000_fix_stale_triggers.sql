-- MIGRATION: Fix Stale Inventory Triggers
-- This migration drops old sync functions and implement a unified, schema-correct trigger function.

-- 1. Drop old triggers to avoid conflicts
DROP TRIGGER IF EXISTS trg_sync_inventory ON public.inventory_batches;
DROP TRIGGER IF EXISTS trig_sync_inventory_batches ON public.inventory_batches;

-- 2. Drop old functions
DROP FUNCTION IF EXISTS public.sync_inventory_from_batches();
DROP FUNCTION IF EXISTS public.sync_inventory_from_batches_v2();

-- 3. Create the Unified Schema-Correct Sync Function
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

  -- Recompute current stock from batches
  SELECT COALESCE(SUM(remaining_qty), 0) INTO v_qty
  FROM public.inventory_batches
  WHERE product_id = v_prod_id;

  INSERT INTO public.inventory (product_id, stock_base_units, last_updated_at)
  VALUES (v_prod_id, v_qty, now())
  ON CONFLICT (product_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
    
  RETURN NULL;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Re-attach the trigger
CREATE TRIGGER trg_sync_inventory_from_batches
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_batches();

-- 5. Final sync of recompute functions (Redundant but safe)
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
