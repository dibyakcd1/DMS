
-- FIX INVENTORY CONSTRAINTS FOR WAREHOUSING
-- This migration ensures the inventory table has the correct structure for multi-warehouse support.

DO $body$
DECLARE
  v_main_wh_id UUID;
BEGIN
  -- 1. Get the main warehouse ID
  SELECT id INTO v_main_wh_id FROM public.warehouses WHERE name = 'Main Warehouse' LIMIT 1;
  
  -- 2. Add warehouse_id to inventory table if it's missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'warehouse_id') THEN
    ALTER TABLE public.inventory ADD COLUMN warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE;
  END IF;

  -- 3. Backfill warehouse_id
  UPDATE public.inventory SET warehouse_id = v_main_wh_id WHERE warehouse_id IS NULL;
  
  -- 4. Make it NOT NULL
  ALTER TABLE public.inventory ALTER COLUMN warehouse_id SET NOT NULL;

  -- 5. Drop existing primary key or unique constraints that might conflict
  -- We need exactly ONE unique constraint/PK on (product_id, warehouse_id)
  ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_pkey;
  ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_product_id_key;
  
  -- 6. Create the composite primary key
  -- This is the "unique constraint" that ON CONFLICT (product_id, warehouse_id) needs.
  ALTER TABLE public.inventory ADD PRIMARY KEY (product_id, warehouse_id);

END $body$;

-- 7. Re-sync all inventory once the constraints are correct
SELECT public.recompute_all_inventory();
