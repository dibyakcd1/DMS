-- MIGRATION: Fix Shops RLS & Schema Consistency
-- This migration ensures that shops can be updated by authorized users and that all columns are present.

-- 1. Updated At Trigger (Move outside DO block)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $body$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DO $body$ 
BEGIN
  -- 2. Ensure RLS is enabled
  ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

  -- 3. Drop existing policies to avoid conflicts
  DROP POLICY IF EXISTS "Allow authenticated to view shops" ON public.shops;
  DROP POLICY IF EXISTS "Allow admins to manage shops" ON public.shops;
  DROP POLICY IF EXISTS "public_view_shops" ON public.shops;
  DROP POLICY IF EXISTS "admin_manage_shops" ON public.shops;

  -- 4. Create clean policies
  -- Anyone authenticated can view shops
  CREATE POLICY "Allow authenticated to view shops" 
  ON public.shops 
  FOR SELECT 
  TO authenticated 
  USING (true);

  -- Only admins and owners can perform write operations
  CREATE POLICY "Allow admins to manage shops" 
  ON public.shops 
  FOR ALL 
  TO authenticated 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

  -- 5. Ensure missing columns exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'discount_pct') THEN
    ALTER TABLE public.shops ADD COLUMN discount_pct NUMERIC(5,2) DEFAULT 0 NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'beat_route_id') THEN
    ALTER TABLE public.shops ADD COLUMN beat_route_id UUID;
  END IF;

  -- 6. Attach Trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_shops_updated_at') THEN
    CREATE TRIGGER trg_shops_updated_at
    BEFORE UPDATE ON public.shops
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;

END $body$;
