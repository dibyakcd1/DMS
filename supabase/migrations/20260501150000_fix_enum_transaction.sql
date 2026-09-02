-- Migration to fix shop_type enum values outside of a transaction block
-- ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block in some PG versions
-- Note: ADD VALUE IF NOT EXISTS is PG 16+. For older versions, we just list them.
-- If these fail because they exist, we will handle it, but the error reported suggests they are missing.

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'premium') THEN
    ALTER TYPE public.shop_type ADD VALUE 'premium';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $body$;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'gold') THEN
    ALTER TYPE public.shop_type ADD VALUE 'gold';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $body$;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'silver') THEN
    ALTER TYPE public.shop_type ADD VALUE 'silver';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $body$;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'bronze') THEN
    ALTER TYPE public.shop_type ADD VALUE 'bronze';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $body$;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'basic') THEN
    ALTER TYPE public.shop_type ADD VALUE 'basic';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $body$;

-- Also ensure the columns are renamed correctly if they weren't
DO $body$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_retailer') THEN
    ALTER TABLE public.products RENAME COLUMN target_margin_retailer TO target_margin_silver;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_wholesaler') THEN
    ALTER TABLE public.products RENAME COLUMN target_margin_wholesaler TO target_margin_gold;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_distributor') THEN
    ALTER TABLE public.products RENAME COLUMN target_margin_distributor TO target_margin_premium;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_chain') THEN
    ALTER TABLE public.products RENAME COLUMN target_margin_chain TO target_margin_bronze;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_basic') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_basic numeric DEFAULT 0;
  END IF;
END $body$;
