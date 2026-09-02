-- Recovery Migration: Reset inventory for specific products requested by user
-- Targets: Tej Pata, Haldi 500gm, Curry 500gm

-- Ensure we fix the trigger function first if it's stale
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

  INSERT INTO public.inventory (product_id, stock_base_units, last_updated_at)
  VALUES (v_prod_id, v_qty, now())
  ON CONFLICT (product_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
    
  RETURN NULL;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DO $body$
DECLARE
    v_product_id UUID;
BEGIN
    -- 1. Reset Tej Pata
    FOR v_product_id IN SELECT id FROM public.products WHERE name ILIKE '%Tej Pata%' LOOP
        UPDATE public.inventory_batches 
        SET remaining_qty = received_qty 
        WHERE product_id = v_product_id;
        
        PERFORM public.recompute_inventory(v_product_id);
    END LOOP;

    -- 2. Reset Haldi 500gm
    FOR v_product_id IN SELECT id FROM public.products WHERE (name ILIKE '%Haldi%' OR name ILIKE '%Turmeric%') AND (name ILIKE '%500%') LOOP
        UPDATE public.inventory_batches 
        SET remaining_qty = received_qty 
        WHERE product_id = v_product_id;
        
        PERFORM public.recompute_inventory(v_product_id);
    END LOOP;

    -- 3. Reset Curry 500gm
    FOR v_product_id IN SELECT id FROM public.products WHERE (name ILIKE '%Curry%') AND (name ILIKE '%500%') LOOP
        UPDATE public.inventory_batches 
        SET remaining_qty = received_qty 
        WHERE product_id = v_product_id;
        
        PERFORM public.recompute_inventory(v_product_id);
    END LOOP;
    
END $body$;

-- Run final global sync to be absolutely sure
SELECT public.recompute_all_inventory();
