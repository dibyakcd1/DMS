-- Migration: Definitive Function Ambiguity Fix
-- Purpose: Resolve "function recompute_inventory(uuid) is not unique" by dropping all overloads and creating one canonical version.

BEGIN;

-- 1. Drop all known signatures of recompute_inventory
DROP FUNCTION IF EXISTS public.recompute_inventory(UUID);
DROP FUNCTION IF EXISTS public.recompute_inventory(UUID, UUID);

-- 2. Create the one true canonical version (with optional warehouse)
CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id UUID, _warehouse_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
    -- If warehouse is provided, sync that specific bucket
    IF _warehouse_id IS NOT NULL THEN
        INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, avg_landed_cost, last_updated_at)
        SELECT 
            product_id, 
            warehouse_id, 
            COALESCE(SUM(remaining_qty), 0), 
            COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0),
            now()
        FROM public.inventory_batches
        WHERE product_id = _product_id AND warehouse_id = _warehouse_id
        GROUP BY product_id, warehouse_id
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            stock_base_units = EXCLUDED.stock_base_units,
            avg_landed_cost = EXCLUDED.avg_landed_cost,
            last_updated_at = now();
    ELSE
        -- If no warehouse provided, loop through all warehouses that have history for this product
        INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, avg_landed_cost, last_updated_at)
        SELECT 
            product_id, 
            warehouse_id, 
            COALESCE(SUM(remaining_qty), 0), 
            COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0),
            now()
        FROM public.inventory_batches
        WHERE product_id = _product_id
        GROUP BY product_id, warehouse_id
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            stock_base_units = EXCLUDED.stock_base_units,
            avg_landed_cost = EXCLUDED.avg_landed_cost,
            last_updated_at = now();
    END IF;

    -- Update summary table if exists (for dashboard performance)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'summary_product_stock') THEN
        INSERT INTO public.summary_product_stock (product_id, warehouse_id, total_qty, updated_at)
        SELECT product_id, warehouse_id, stock_base_units, last_updated_at
        FROM public.inventory
        WHERE product_id = _product_id
        ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
            total_qty = EXCLUDED.total_qty,
            updated_at = EXCLUDED.updated_at;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.recompute_inventory(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_inventory(UUID, UUID) TO service_role;

COMMIT;
