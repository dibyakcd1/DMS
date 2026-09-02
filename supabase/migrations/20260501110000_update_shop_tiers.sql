
-- Update Shop Categories to 5-Tier System
-- 2026-05-01

-- 1. Create temporary enum if needed or just add values
DO $body$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shop_type') THEN
    ALTER TYPE public.shop_type ADD VALUE IF NOT EXISTS 'premium';
    ALTER TYPE public.shop_type ADD VALUE IF NOT EXISTS 'gold';
    ALTER TYPE public.shop_type ADD VALUE IF NOT EXISTS 'silver';
    ALTER TYPE public.shop_type ADD VALUE IF NOT EXISTS 'bronze';
    ALTER TYPE public.shop_type ADD VALUE IF NOT EXISTS 'basic';
  END IF;
END $body$;

-- 2. Map old categories to new ones (Best effort mapping)
-- chain -> premium (actually premium is top tier, so distributor/chain -> premium)
-- retailer -> silver
-- wholesaler -> gold

UPDATE public.shops SET shop_type = 'premium' WHERE (shop_type::text IN ('chain', 'distributor'));
UPDATE public.shops SET shop_type = 'gold' WHERE shop_type::text = 'wholesaler';
UPDATE public.shops SET shop_type = 'silver' WHERE shop_type::text = 'retailer';

-- 3. Update any price tiers that used the old types
UPDATE public.product_price_tiers SET shop_type = 'premium' WHERE (shop_type::text IN ('chain', 'distributor'));
UPDATE public.product_price_tiers SET shop_type = 'gold' WHERE shop_type::text = 'wholesaler';
UPDATE public.product_price_tiers SET shop_type = 'silver' WHERE shop_type::text = 'retailer';

-- 4. Rename margin columns in products table for consistency
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
  
  -- Add basic margin column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'target_margin_basic') THEN
    ALTER TABLE public.products ADD COLUMN target_margin_basic numeric DEFAULT 0;
  END IF;
END $body$;
