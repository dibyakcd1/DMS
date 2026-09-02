
-- Ensure the product_price_tiers table has a proper unique constraint for upserts
-- This is critical after the enum type changes that might have dropped existing indices

-- 1. Drop existing index if it exists (using a name that might have been used)
DROP INDEX IF EXISTS public.idx_product_price_tiers_unique;

-- 2. Drop any existing unique constraint on these columns if it has a different name
DO $body$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_price_tiers_unique_key') THEN
        ALTER TABLE public.product_price_tiers DROP CONSTRAINT product_price_tiers_unique_key;
    END IF;
END $body$;

-- 3. Add an explicit UNIQUE CONSTRAINT (not just an index)
-- PostgREST works best with named unique constraints for on_conflict
ALTER TABLE public.product_price_tiers 
ADD CONSTRAINT product_price_tiers_unique_key UNIQUE (product_id, shop_type, pack_type);

-- 4. Verify RLS for product_price_tiers
ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to authenticated" ON public.product_price_tiers;
CREATE POLICY "Allow all access to authenticated" ON public.product_price_tiers
FOR ALL TO authenticated USING (true) WITH CHECK (true);
