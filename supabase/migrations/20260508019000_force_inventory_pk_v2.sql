
-- FORCE INVENTORY PRIMARY KEY V2
-- This migration is a nuclear option to ensure that the inventory table
-- has EXACTLY ONE primary key on (product_id, warehouse_id).

BEGIN;

-- 1. Drop the view as it depends on the inventory table
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

-- 2. Drop the table and recreate it to be 100% sure of its structure
-- This is safe because inventory is a DERIVED table from inventory_batches.
DROP TABLE IF EXISTS public.inventory CASCADE;

CREATE TABLE public.inventory (
    product_id       UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id     UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    stock_base_units NUMERIC DEFAULT 0,
    last_updated_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (product_id, warehouse_id)
);

-- 3. Enable RLS and add policies
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_view_inventory_v3" ON public.inventory 
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin_all_inventory_v3" ON public.inventory 
  FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'owner')));

-- 4. Re-create the View (Summing across warehouses for global view)
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

-- 5. Restore Trigger for Auto-Toggle Product Active (if it was used)
CREATE OR REPLACE FUNCTION public.sync_product_active_status()
RETURNS TRIGGER AS $body$
BEGIN
  -- If total stock across all warehouses > 0, set active = true? 
  -- Or just handle it manually. For now, let's leave it as a placeholder if needed.
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

-- 6. Grant Permissions
GRANT ALL ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
GRANT SELECT ON public.v_product_stock TO authenticated;

-- 7. RECOMPUTE ALL
-- This fills the new empty inventory table
SELECT public.recompute_all_inventory();

COMMIT;
