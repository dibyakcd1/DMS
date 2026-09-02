-- FINAL COMPREHENSIVE INVENTORY & RLS FIX
-- Purpose: Fix missing triggers, standardise RLS using non-recursive helpers, and fix RPC signatures.

DO $body$ 
BEGIN

  -- 1. RE-ESTABLISH SECURITY HELPERS
  CREATE OR REPLACE FUNCTION public.check_is_admin_v2()
  RETURNS boolean AS $inner$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    );
  END;
  $inner$ LANGUAGE plpgsql SECURITY DEFINER;

  -- 2. INVENTORY BATCH TRIGGER
  -- Ensure the sync function exists
  CREATE OR REPLACE FUNCTION public.sync_inventory_from_batches_v2()
  RETURNS TRIGGER AS $inner$
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
  $inner$ LANGUAGE plpgsql SECURITY DEFINER;

  -- Attach trigger if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_sync_inventory_batches') THEN
    CREATE TRIGGER trig_sync_inventory_batches
    AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
    FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_batches_v2();
  END IF;

  -- 3. RLS HARDENING (NON-RECURSIVE)
  -- INVENTORY BATCHES
  ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "admin_all_inventory_batches" ON public.inventory_batches;
  DROP POLICY IF EXISTS "public_view_inventory_batches" ON public.inventory_batches;
  
  -- Admins can do everything
  CREATE POLICY "admin_all_inventory_batches_v2" ON public.inventory_batches FOR ALL TO authenticated
    USING (public.check_is_admin_v2())
    WITH CHECK (public.check_is_admin_v2());
    
  -- EVERYONE can view stock (Critical for Order management)
  CREATE POLICY "public_view_inventory_batches_v2" ON public.inventory_batches FOR SELECT TO authenticated
    USING (true);

  -- INVENTORY SUMMARY TABLE
  ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Allow authenticated to view inventory" ON public.inventory;
  DROP POLICY IF EXISTS "Allow admins to manage inventory" ON public.inventory;
  
  CREATE POLICY "public_view_inventory_v2" ON public.inventory FOR SELECT TO authenticated USING (true);
  CREATE POLICY "admin_all_inventory_v2" ON public.inventory FOR ALL TO authenticated 
    USING (public.check_is_admin_v2())
    WITH CHECK (public.check_is_admin_v2());

END $body$;

-- 4. RPC SIGNATURE FIX (DROP AND RECREATE)
DROP FUNCTION IF EXISTS public.recompute_all_inventory();
CREATE OR REPLACE FUNCTION public.recompute_all_inventory()
RETURNS boolean AS $body$
BEGIN
  -- Recompute for all products in the products table
  INSERT INTO public.inventory (product_id, quantity, updated_at)
  SELECT 
    p.id,
    COALESCE(SUM(ib.remaining_qty), 0),
    now()
  FROM public.products p
  LEFT JOIN public.inventory_batches ib ON p.id = ib.product_id
  GROUP BY p.id
  ON CONFLICT (product_id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    updated_at = now();
    
  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recompute_all_inventory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_inventory() TO service_role;

-- 5. PERFORM GLOBAL RECONCILIATION
SELECT public.recompute_all_inventory();
