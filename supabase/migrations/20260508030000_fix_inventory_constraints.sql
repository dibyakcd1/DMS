
-- FIX: RE-ESTABLISH INVENTORY TABLE CONSTRAINTS
-- This migration ensures the inventory table has the correct composite primary key (product_id, warehouse_id)
-- and fixes the "no unique or exclusion constraint matching the ON CONFLICT specification" error.

BEGIN;

-- 1. Ensure warehouses exist and we have a default
DO $body$
DECLARE
  v_main_wh_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE name = 'Main Warehouse') THEN
    INSERT INTO public.warehouses (name, code, location)
    VALUES ('Main Warehouse', 'MWH', 'Headquarters')
    RETURNING id INTO v_main_wh_id;
  ELSE
    SELECT id INTO v_main_wh_id FROM public.warehouses WHERE name = 'Main Warehouse';
  END IF;

  -- 2. Drop old primary keys (could be inventory_pkey or products_id_pkey etc)
  -- We search for any primary key on public.inventory and drop it
  EXECUTE (
    SELECT 'ALTER TABLE public.inventory DROP CONSTRAINT ' || quote_ident(conname)
    FROM pg_constraint 
    WHERE conrelid = 'public.inventory'::regclass 
    AND contype = 'p'
  );

  -- 3. Cleanup duplicates if they exist (keep the one with most stock or just any)
  -- This is rare but possible if constraints were missing
  DELETE FROM public.inventory a USING (
      SELECT MIN(ctid) as keep_ctid, product_id, COALESCE(warehouse_id, v_main_wh_id) as wh_id
      FROM public.inventory 
      GROUP BY product_id, COALESCE(warehouse_id, v_main_wh_id) 
      HAVING COUNT(*) > 1
  ) b
  WHERE a.product_id = b.product_id 
    AND COALESCE(a.warehouse_id, v_main_wh_id) = b.wh_id 
    AND a.ctid != b.keep_ctid;

  -- 4. Fill missing warehouse_ids
  UPDATE public.inventory SET warehouse_id = v_main_wh_id WHERE warehouse_id IS NULL;

  -- 5. Add the correct Primary Key
  ALTER TABLE public.inventory ADD PRIMARY KEY (product_id, warehouse_id);

  -- 6. Ensure warehouse_id in batches is also solid
  UPDATE public.inventory_batches SET warehouse_id = v_main_wh_id WHERE warehouse_id IS NULL;

END $body$;

-- 7. RE-Populate Inventory from Batches to ensure consistency
TRUNCATE public.inventory;
INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, last_updated_at)
SELECT product_id, warehouse_id, COALESCE(SUM(remaining_qty), 0), now()
FROM public.inventory_batches
GROUP BY product_id, warehouse_id
ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
  stock_base_units = EXCLUDED.stock_base_units,
  last_updated_at = now();

COMMIT;
