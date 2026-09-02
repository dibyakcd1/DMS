-- ULTIMATE INVENTORY CONSTRAINT FIX
-- This migration ensures the inventory table has the exact composite primary key
-- required for the ON CONFLICT (product_id, warehouse_id) operations.

BEGIN;

-- 1. Drop the view as it depends on the inventory table
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

-- 2. Clean up inventory table constraints and prepare for primary key change
DO $body$
BEGIN
    -- Drop all potential conflicting constraints
    ALTER TABLE IF EXISTS public.inventory DROP CONSTRAINT IF EXISTS inventory_pkey;
    ALTER TABLE IF EXISTS public.inventory DROP CONSTRAINT IF EXISTS inventory_product_id_key;
    ALTER TABLE IF EXISTS public.inventory DROP CONSTRAINT IF EXISTS inventory_product_id_warehouse_id_key;
END $body$;

-- 3. Ensure columns exist and are correct
-- If warehouse_id doesn't exist, we can't have a multi-warehouse system.
-- We'll default any orphaned rows to the 'Main Warehouse'.
DO $body$
DECLARE
    v_main_wh_id UUID;
BEGIN
    SELECT id INTO v_main_wh_id FROM public.warehouses WHERE name = 'Main Warehouse' LIMIT 1;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory' AND column_name = 'warehouse_id') THEN
        ALTER TABLE public.inventory ADD COLUMN warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE CASCADE;
    END IF;

    -- Assign a warehouse to anything null so we can set NOT NULL
    UPDATE public.inventory SET warehouse_id = v_main_wh_id WHERE warehouse_id IS NULL;
    ALTER TABLE public.inventory ALTER COLUMN warehouse_id SET NOT NULL;
END $body$;

-- 4. Deduplicate the table before adding Primary Key
-- If there are duplicates, the PK creation will fail.
-- We sum them up temporarily or just delete and let recompute handle it.
DELETE FROM public.inventory 
WHERE (product_id, warehouse_id, last_updated_at) NOT IN (
    SELECT product_id, warehouse_id, MAX(last_updated_at)
    FROM public.inventory
    GROUP BY product_id, warehouse_id
);

-- 5. Establish the Composite Primary Key
-- This is critical for ON CONFLICT (product_id, warehouse_id)
ALTER TABLE public.inventory ADD PRIMARY KEY (product_id, warehouse_id);

-- 6. Re-create the View (Summing across warehouses for global view)
CREATE VIEW public.v_product_stock AS
WITH product_totals AS (
  SELECT 
    p.id as product_id,
    COALESCE(SUM(i.stock_base_units), 0) as stock_base_units,
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
    END as calc_units_per_case
  FROM 
    public.products p
  LEFT JOIN public.inventory i ON p.id = i.product_id
  GROUP BY p.id, p.units_per_packet, p.packets_per_case, p.units_per_case, p.case_qty_value, p.pack_size_value, p.case_qty_unit, p.pack_size_unit
)
SELECT 
  p.*,
  t.stock_base_units as stock_base_units,
  t.stock_base_units as stock_pcs,
  CASE 
    WHEN COALESCE(p.units_per_packet, 1) > 1 THEN FLOOR(t.stock_base_units::numeric / p.units_per_packet)
    ELSE t.stock_base_units
  END as stock_packets,
  CASE 
    WHEN t.calc_units_per_case > 0 THEN FLOOR(t.stock_base_units::numeric / t.calc_units_per_case)
    ELSE 0 
  END as stock_cases,
  CASE 
    WHEN lower(p.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') AND p.pack_size_value > 0 THEN ROUND((t.stock_base_units * p.pack_size_value / 1000.0)::numeric, 3)
    WHEN lower(p.pack_size_unit) IN ('kg', 'kgs', 'kilograms') AND p.pack_size_value > 0 THEN ROUND((t.stock_base_units * p.pack_size_value)::numeric, 3)
    ELSE 0
  END as stock_kg,
  (t.stock_base_units <= p.min_stock) as is_low_stock
FROM 
  public.products p
JOIN 
  product_totals t ON p.id = t.product_id;

-- 7. Fix any potential permissions issues on the table
GRANT ALL ON public.inventory TO authenticated;
GRANT ALL ON public.v_product_stock TO authenticated;

-- 8. Run full recompute to ensure all balances are perfect
SELECT public.recompute_all_inventory();

COMMIT;
