-- Migration to ensure inventory table exists and sync trigger is functional
-- This fixes the 'relation "public.inventory" does not exist' error

-- 1. Create the inventory table
CREATE TABLE IF NOT EXISTS public.inventory (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create or replace the sync function
CREATE OR REPLACE FUNCTION public.sync_inventory_from_batches()
RETURNS TRIGGER AS $body$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.inventory (product_id, quantity, updated_at)
    SELECT product_id, SUM(remaining_qty), now()
    FROM public.inventory_batches
    WHERE product_id = OLD.product_id
    GROUP BY product_id
    ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
    -- If no more batches, set quantity to 0
    IF NOT EXISTS (SELECT 1 FROM public.inventory_batches WHERE product_id = OLD.product_id) THEN
      UPDATE public.inventory SET quantity = 0, updated_at = now() WHERE product_id = OLD.product_id;
    END IF;
    RETURN OLD;
  ELSE
    INSERT INTO public.inventory (product_id, quantity, updated_at)
    SELECT product_id, SUM(remaining_qty), now()
    FROM public.inventory_batches
    WHERE product_id = NEW.product_id
    GROUP BY product_id
    ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
    RETURN NEW;
  END IF;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure trigger exists
DROP TRIGGER IF EXISTS trg_sync_inventory ON public.inventory_batches;
CREATE TRIGGER trg_sync_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_batches();

-- 4. Initial sync
INSERT INTO public.inventory (product_id, quantity, updated_at)
SELECT product_id, SUM(remaining_qty), now()
FROM public.inventory_batches
GROUP BY product_id
ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
