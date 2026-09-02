-- LANDED COST & PRICING ENHANCEMENTS (2026-04-29)

-- 1. Add min_price to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_price numeric(10,2) NOT NULL DEFAULT 0;

-- 2. Add freight + handling to inventory_batches
ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS freight_cost_per_unit numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handling_cost_per_unit numeric(10,4) NOT NULL DEFAULT 0;

-- 3. Add target margins to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS target_margin_retailer numeric(5,2) DEFAULT 50,
  ADD COLUMN IF NOT EXISTS target_margin_wholesaler numeric(5,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS target_margin_distributor numeric(5,2) DEFAULT 15;

-- 4. Update landing cost view or add comments
COMMENT ON COLUMN public.inventory_batches.landed_cost IS 'Sum of unit_cost + freight_cost_per_unit + handling_cost_per_unit';

-- 5. Add shop_type constraint if not already present (already exists but just to be sure)
-- (Already handled in previous scripts)
