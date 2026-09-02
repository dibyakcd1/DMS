-- BM Pricing & Shop Enhancements (2026-04-29)

-- 1. Add discount_pct to shops
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) NOT NULL DEFAULT 0;

-- 2. Add min_selling_price to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_selling_price numeric(10,2) DEFAULT 0;

-- 3. Update products rbp fields defaults if not set
ALTER TABLE public.products ALTER COLUMN rbp_unit SET DEFAULT 0;
ALTER TABLE public.products ALTER COLUMN rbp_carton SET DEFAULT 0;
