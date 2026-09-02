-- Multi-level hierarchy and auto-calculation enhancements
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS units_per_packet integer DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS packets_per_bag integer DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bag_landed_price numeric(10,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bag_freight_cost numeric(10,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS target_margin_chain numeric(5,2) DEFAULT 10;

-- Update product_price_tiers
ALTER TABLE public.product_price_tiers ADD COLUMN IF NOT EXISTS is_auto_calculated boolean DEFAULT false;
ALTER TABLE public.product_price_tiers ADD COLUMN IF NOT EXISTS source_landed_cost numeric(10,2);

-- Since there is no native 'enum' for pack_type in standard Postgres without a type, 
-- but Supabase often uses check constraints or just text. 
-- If it's a domain/type, we extend it.
DO $body$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type') THEN
    ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'packet';
  END IF;
END $body$;
