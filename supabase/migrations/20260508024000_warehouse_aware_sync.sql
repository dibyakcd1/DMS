-- WAREHOUSE-AWARE INVENTORY SYNC
-- This migration fixes the "ON CONFLICT" error by updating inventory sync functions 
-- to be warehouse-aware and use the correct (product_id, warehouse_id) constraint.

BEGIN;

-- 1. Drop old triggers and functions to ensure a clean state
DROP TRIGGER IF EXISTS trg_sync_inventory_from_batches ON public.inventory_batches;
DROP FUNCTION IF EXISTS public.sync_inventory_from_batches();
DROP FUNCTION IF EXISTS public.recompute_inventory(UUID);
DROP FUNCTION IF EXISTS public.recompute_all_inventory();

-- 2. Create the Unified warehouse-aware Sync Function
CREATE OR REPLACE FUNCTION public.sync_inventory_from_batches()
RETURNS TRIGGER AS $body$
DECLARE
  v_prod_id UUID;
  v_warehouse_id UUID;
  v_qty NUMERIC;
BEGIN
  -- Determine which product and warehouse to sync
  IF (TG_OP = 'DELETE') THEN
    v_prod_id := OLD.product_id;
    v_warehouse_id := OLD.warehouse_id;
  ELSE
    v_prod_id := NEW.product_id;
    v_warehouse_id := NEW.warehouse_id;
  END IF;

  -- Recompute current stock for THIS (product, warehouse) combination
  SELECT COALESCE(SUM(remaining_qty), 0) INTO v_qty
  FROM public.inventory_batches
  WHERE product_id = v_prod_id AND warehouse_id = v_warehouse_id;

  -- Update the inventory table using the composite primary key
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
  VALUES (v_prod_id, v_warehouse_id, v_qty, now())
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
    
  RETURN NULL;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-attach the trigger
CREATE TRIGGER trg_sync_inventory_from_batches
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_batches();

-- 4. Recompute Product (Warehouse-aware)
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id UUID)
RETURNS void AS $body$
BEGIN
  -- Delete existing entries for this product to ensure we don't have stale warehouses
  DELETE FROM public.inventory WHERE product_id = _product_id;

  -- Re-insert from batches grouped by warehouse
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
  SELECT product_id, warehouse_id, COALESCE(SUM(remaining_qty), 0), now()
  FROM public.inventory_batches
  WHERE product_id = _product_id
  GROUP BY product_id, warehouse_id
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Recompute All (Warehouse-aware)
CREATE OR REPLACE FUNCTION public.recompute_all_inventory()
RETURNS boolean AS $body$
BEGIN
  -- Clean the inventory table first
  TRUNCATE public.inventory;

  -- Re-populate all
  INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
  SELECT product_id, warehouse_id, COALESCE(SUM(remaining_qty), 0), now()
  FROM public.inventory_batches
  GROUP BY product_id, warehouse_id;
  
  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION public.recompute_all_inventory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_inventory() TO service_role;

-- 7. Execute a final recompute to ensure consistency
SELECT public.recompute_all_inventory();

COMMIT;
