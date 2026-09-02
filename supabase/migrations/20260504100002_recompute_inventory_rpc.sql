
-- Migration: Recompute Inventory RPC
-- Provides a manual way to ensure inventory totals match batch sums

CREATE OR REPLACE FUNCTION public.recompute_inventory(_product_id UUID)
RETURNS VOID AS $body$
BEGIN
  INSERT INTO public.inventory (product_id, quantity, updated_at)
  SELECT product_id, COALESCE(SUM(remaining_qty), 0), now()
  FROM public.inventory_batches
  WHERE product_id = _product_id
  GROUP BY product_id
  ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
  
  -- If no batches exist, ensured it's set to 0
  IF NOT EXISTS (SELECT 1 FROM public.inventory_batches WHERE product_id = _product_id) THEN
    UPDATE public.inventory SET quantity = 0, updated_at = now() WHERE product_id = _product_id;
  END IF;
END;
$body$ LANGUAGE plpgsql;
