-- Migration: Ensure warehouses table supports both address and location columns
-- Fixes schema mismatch between address and location fields

DO $$
BEGIN
  -- Ensure address column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'address'
  ) THEN
    ALTER TABLE public.warehouses ADD COLUMN address TEXT;
  END IF;

  -- Ensure location column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'location'
  ) THEN
    ALTER TABLE public.warehouses ADD COLUMN location TEXT;
  END IF;

  -- Keep both columns in sync for backwards and forwards compatibility
  UPDATE public.warehouses SET address = location WHERE address IS NULL AND location IS NOT NULL;
  UPDATE public.warehouses SET location = address WHERE location IS NULL AND address IS NOT NULL;
END $$;
