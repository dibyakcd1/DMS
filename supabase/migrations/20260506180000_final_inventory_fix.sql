-- FINAL INVENTORY FIX
-- 1. Ensure inventory table has consistent schema and RLS
DO $body$ 
BEGIN
  -- Enable RLS
  ALTER TABLE IF EXISTS public.inventory ENABLE ROW LEVEL SECURITY;
  
  -- Create policies if they don't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory' AND policyname = 'Allow authenticated to view inventory') THEN
    CREATE POLICY "Allow authenticated to view inventory" ON public.inventory FOR SELECT TO authenticated USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory' AND policyname = 'Allow admins to manage inventory') THEN
    CREATE POLICY "Allow admins to manage inventory" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $body$;

-- 2. Ensure recompute_inventory RPC is robust
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

GRANT EXECUTE ON FUNCTION public.recompute_inventory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_inventory(uuid) TO service_role;

-- 3. Ensure recompute_all_inventory RPC exists and is accessible
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

-- 4. Initial Global Sync
SELECT public.recompute_all_inventory();
