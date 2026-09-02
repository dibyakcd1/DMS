-- NUCLEAR INVENTORY CONSTRAINT REPAIR
-- This migration definitively removes ALL possible conflicting constraints
-- on the inventory table to solve the ON CONFLICT error once and for all.

BEGIN;

-- 1. Drop the view to allow table modifications
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

-- 2. Drop EVERY possible index or constraint that could interfere with (product_id, warehouse_id)
DO $body$
DECLARE
    r RECORD;
BEGIN
    -- Drop all constraints on the inventory table except foreign keys (or drop them all and recreate)
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.inventory'::regclass
    ) LOOP
        EXECUTE 'ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname) || ' CASCADE';
    END LOOP;

    -- Drop all indexes on the inventory table
    FOR r IN (
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'inventory'
    ) LOOP
        EXECUTE 'DROP INDEX IF EXISTS public.' || quote_ident(r.indexname);
    END LOOP;
END $body$;

-- 3. Ensure the columns are correct and Clean
ALTER TABLE public.inventory ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE public.inventory ALTER COLUMN warehouse_id SET NOT NULL;

-- 4. Deduplicate any potential leftover data before applying the new PK
DELETE FROM public.inventory 
WHERE (product_id, warehouse_id, last_updated_at) NOT IN (
    SELECT product_id, warehouse_id, MAX(last_updated_at)
    FROM public.inventory
    GROUP BY product_id, warehouse_id
);

-- 5. APPLY THE DEFINITIVE PRIMARY KEY
-- This is what ON CONFLICT (product_id, warehouse_id) requires.
ALTER TABLE public.inventory ADD PRIMARY KEY (product_id, warehouse_id);

-- 6. Add standard performance indexes
CREATE INDEX idx_inventory_product_id ON public.inventory(product_id);
CREATE INDEX idx_inventory_warehouse_id ON public.inventory(warehouse_id);

-- 7. Restore Foreign Keys
ALTER TABLE public.inventory ADD CONSTRAINT inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;

-- 8. Re-create the View
CREATE VIEW public.v_product_stock AS
WITH stock_agg AS (
    SELECT 
        product_id, 
        SUM(COALESCE(stock_base_units, 0)) as total_stock
    FROM public.inventory
    GROUP BY product_id
)
SELECT 
  p.*,
  COALESCE(s.total_stock, 0) as stock_base_units,
  COALESCE(s.total_stock, 0) as stock_pcs,
  CASE 
    WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
    WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
    WHEN COALESCE(p.case_qty_value, 0) > 0 AND COALESCE(p.pack_size_value, 0) > 0 THEN
      CASE 
        WHEN lower(p.case_qty_unit) = 'kg' AND lower(p.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') THEN (p.case_qty_value * 1000.0) / p.pack_size_value
        WHEN lower(p.case_qty_unit) = lower(p.pack_size_unit) THEN p.case_qty_value / p.pack_size_value
        ELSE 1
      END
    ELSE 1 
  END as calc_units_per_case,
  CASE 
    WHEN COALESCE(p.units_per_packet, 1) > 1 THEN FLOOR(COALESCE(s.total_stock, 0)::numeric / p.units_per_packet)
    ELSE COALESCE(s.total_stock, 0)
  END as stock_packets,
  (COALESCE(s.total_stock, 0) <= p.min_stock) as is_low_stock
FROM 
  public.products p
LEFT JOIN 
  stock_agg s ON p.id = s.product_id;

-- 9. Force a full recompute to populate the clean table
SELECT public.recompute_all_inventory();

-- 10. Fix permissions
GRANT ALL ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
GRANT SELECT ON public.v_product_stock TO authenticated;

COMMIT;
