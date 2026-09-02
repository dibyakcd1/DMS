-- MIGRATION: Definitive Inventory Sync Fix & Surgical Reset
-- This migration fixes the stale "quantity" column references in triggers and resets specific product stocks.

-- 1. DROP ALL POTENTIALLY STALE TRIGGERS
DROP TRIGGER IF EXISTS trg_sync_inventory ON public.inventory_batches;
DROP TRIGGER IF EXISTS trig_sync_inventory_batches ON public.inventory_batches;
DROP TRIGGER IF EXISTS trg_sync_inventory_from_batches ON public.inventory_batches;

-- 2. REDEFINE THE SYNC FUNCTION (Correct column names)
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

  -- Ensure target table is formatted correctly
  INSERT INTO public.inventory (product_id, stock_base_units, last_updated_at)
  VALUES (v_prod_id, v_qty, now())
  ON CONFLICT (product_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
    
  RETURN NULL;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RE-ATTACH TRIGGER
CREATE TRIGGER trg_sync_inventory_from_batches
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_batches();

-- 4. SURGICAL RESET FOR REQUESTED PRODUCTS
DO $body$
DECLARE
    v_product_id UUID;
BEGIN
    -- A. Tej Pata (Exact SKU from image: BM-WS-BAYLEA-50G-PO)
    FOR v_product_id IN 
        SELECT id FROM public.products 
        WHERE sku = 'BM-WS-BAYLEA-50G-PO' 
           OR name ILIKE '%Tej Pata%' 
           OR name ILIKE '%Bay Leaf%'
    LOOP
        UPDATE public.inventory_batches 
        SET remaining_qty = received_qty 
        WHERE product_id = v_product_id;
        
        PERFORM public.recompute_inventory(v_product_id);
    END LOOP;

    -- B. Haldi 500gm
    FOR v_product_id IN 
        SELECT id FROM public.products 
        WHERE (name ILIKE '%Haldi%' OR name ILIKE '%Turmeric%') 
          AND (name ILIKE '%500%')
    LOOP
        UPDATE public.inventory_batches 
        SET remaining_qty = received_qty 
        WHERE product_id = v_product_id;
        
        PERFORM public.recompute_inventory(v_product_id);
    END LOOP;

    -- C. Curry 500gm
    FOR v_product_id IN 
        SELECT id FROM public.products 
        WHERE (name ILIKE '%Curry%') 
          AND (name ILIKE '%500%')
    LOOP
        UPDATE public.inventory_batches 
        SET remaining_qty = received_qty 
        WHERE product_id = v_product_id;
        
        PERFORM public.recompute_inventory(v_product_id);
    END LOOP;
    
END $body$;

-- 5. FINAL RECOMPUTE
SELECT public.recompute_all_inventory();
