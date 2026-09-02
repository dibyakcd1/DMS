-- Migration to ensure all target margin columns exist in the products table
-- and that the shop_type enum is fully populated.

-- 1. Populate Enum (Outside transaction if possible, but we'll use a safe check)
-- Note: In Supabase, if this fails, it's usually because the values already exist.
DO $body$ 
BEGIN
  BEGIN
    ALTER TYPE public.shop_type ADD VALUE 'premium';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.shop_type ADD VALUE 'gold';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.shop_type ADD VALUE 'silver';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.shop_type ADD VALUE 'bronze';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.shop_type ADD VALUE 'basic';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
END $body$;

-- 2. Ensure Columns Exist in public.products
DO $body$ 
BEGIN
  -- Add Columns if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_premium') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_premium numeric DEFAULT 10;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_gold') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_gold numeric DEFAULT 15;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_silver') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_silver numeric DEFAULT 25;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_bronze') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_bronze numeric DEFAULT 35;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_basic') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_basic numeric DEFAULT 45;
  END IF;
END $body$;

-- 3. Cleanup old columns if they exist (optional, but good for hygiene)
-- We will keep them for now to avoid data loss in case the rename logic from previous turn worked halfway.
