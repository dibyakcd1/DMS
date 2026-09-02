-- ATOMIC RECOVERY: Final Definitive Inventory System Fix
-- This migration consolidates all previous fixes to ensure the schema and triggers are perfectly aligned.

-- 1. Ensure Table Schema is Consistent
DO $body$
BEGIN
    -- Ensure stock_base_units column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'stock_base_units') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'quantity') THEN
            ALTER TABLE public.inventory RENAME COLUMN quantity TO stock_base_units;
        ELSE
            ALTER TABLE public.inventory ADD COLUMN stock_base_units numeric DEFAULT 0;
        END IF;
    END IF;

    -- Ensure last_updated_at column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'last_updated_at') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'updated_at') THEN
            ALTER TABLE public.inventory RENAME COLUMN updated_at TO last_updated_at;
        ELSE
            ALTER TABLE public.inventory ADD COLUMN last_updated_at timestamptz DEFAULT now();
        END IF;
    END IF;
END $body$;

-- 2. Drop all conflicting triggers and old functions
DROP TRIGGER IF EXISTS trg_sync_inventory ON public.inventory_batches;
DROP TRIGGER IF EXISTS trig_sync_inventory_batches ON public.inventory_batches;
DROP TRIGGER IF EXISTS trg_sync_inventory_from_batches ON public.inventory_batches;
DROP FUNCTION IF EXISTS public.sync_inventory_from_batches();
DROP FUNCTION IF EXISTS public.sync_inventory_from_batches_v2();

-- 3. Define the Global Sync Function (Schema Consistent)
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

-- 4. Set up the Trigger
CREATE TRIGGER trg_sync_inventory_from_batches
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_batches();

-- 5. Define Recompute RPCs (Schema Consistent)
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

-- 6. PERFORM THE SURGICAL RESET (User Requested)
DO $body$
DECLARE
    v_product_id UUID;
BEGIN
    -- Tej Pata Reset
    FOR v_product_id IN 
        SELECT id FROM public.products 
        WHERE sku = 'BM-WS-BAYLEA-50G-PO' OR name ILIKE '%Tej Pata%'
    LOOP
        UPDATE public.inventory_batches SET remaining_qty = received_qty WHERE product_id = v_product_id;
        PERFORM public.recompute_inventory(v_product_id);
    END LOOP;

    -- Haldi/Turmeric 500 reset
    FOR v_product_id IN 
        SELECT id FROM public.products 
        WHERE (name ILIKE '%Haldi%' OR name ILIKE '%Turmeric%') AND name ILIKE '%500%'
    LOOP
        UPDATE public.inventory_batches SET remaining_qty = received_qty WHERE product_id = v_product_id;
        PERFORM public.recompute_inventory(v_product_id);
    END LOOP;

    -- Curry 500 reset
    FOR v_product_id IN 
        SELECT id FROM public.products 
        WHERE name ILIKE '%Curry%' AND name ILIKE '%500%'
    LOOP
        UPDATE public.inventory_batches SET remaining_qty = received_qty WHERE product_id = v_product_id;
        PERFORM public.recompute_inventory(v_product_id);
    END LOOP;
END $body$;

-- 7. Run Global Reconciliation
SELECT public.recompute_all_inventory();
