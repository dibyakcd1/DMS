-- Migration to ensure all target margin columns exist in the products table
-- and that the shop_type enum is fully populated.
-- This migration uses safe IF NOT EXISTS patterns.

-- 1. Ensure columns exist in public.products
DO $body$ 
BEGIN
  -- target_margin_premium
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_premium') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_premium numeric DEFAULT 3;
  END IF;

  -- target_margin_gold
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_gold') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_gold numeric DEFAULT 5;
  END IF;

  -- target_margin_silver
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_silver') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_silver numeric DEFAULT 7;
  END IF;

  -- target_margin_bronze
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_bronze') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_bronze numeric DEFAULT 10;
  END IF;

  -- target_margin_basic
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_basic') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_basic numeric DEFAULT 15;
  END IF;
END $body$;

-- 2. Populate shop_type Enum values
-- Note: ALTER TYPE ... ADD VALUE cannot be executed in a transaction block (DO block) in some PG versions.
-- We try to add them individually. If they exist, PG will throw an error which we expect if already present.
-- In some environments, we use the following trick for idempotency:
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'premium') THEN
    ALTER TYPE public.shop_type ADD VALUE 'premium';
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'premium could not be added';
END $body$;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'gold') THEN
    ALTER TYPE public.shop_type ADD VALUE 'gold';
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'gold could not be added';
END $body$;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'silver') THEN
    ALTER TYPE public.shop_type ADD VALUE 'silver';
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'silver could not be added';
END $body$;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'bronze') THEN
    ALTER TYPE public.shop_type ADD VALUE 'bronze';
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'bronze could not be added';
END $body$;

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'shop_type' AND e.enumlabel = 'basic') THEN
    ALTER TYPE public.shop_type ADD VALUE 'basic';
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'basic could not be added';
END $body$;
