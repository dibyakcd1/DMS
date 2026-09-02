
-- WAREHOUSE AWARE SYNC TRIGGER
-- This migration updates the primary sync trigger to correctly handle multi-warehouse inventory.

-- 1. Redefine the sync function to be warehouse-aware
CREATE OR REPLACE FUNCTION public.sync_inventory_from_batches()
RETURNS TRIGGER AS $body$
DECLARE
  v_prod_id UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_prod_id := OLD.product_id;
    -- For deletions, we recompute for ALL warehouses this product was in
    -- or simply call recompute_inventory which now handles all warehouses.
  ELSE
    v_prod_id := NEW.product_id;
  END IF;

  PERFORM public.recompute_inventory(v_prod_id);
  
  RETURN NULL;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop and recreate the trigger to ensure it's using the new function
DROP TRIGGER IF EXISTS trg_sync_inventory_from_batches ON public.inventory_batches;
CREATE TRIGGER trg_sync_inventory_from_batches
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_batches();

-- 3. Run a final global recompute
SELECT public.recompute_all_inventory();
