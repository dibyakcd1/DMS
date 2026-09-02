-- Create scheme_type ENUM if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scheme_type') THEN
        CREATE TYPE public.scheme_type AS ENUM ('buy_x_get_y', 'discount_pct', 'discount_flat');
    END IF;
END $$;

-- Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  short_code VARCHAR(50) NOT NULL UNIQUE,
  accent_hex VARCHAR(50) NOT NULL DEFAULT '#6366F1',
  logo_url TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_companies_sort_order ON public.companies(sort_order);

-- Create schemes table
CREATE TABLE IF NOT EXISTS public.schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  category TEXT,
  scheme_type public.scheme_type NOT NULL,
  buy_qty NUMERIC(10,2),
  get_qty NUMERIC(10,2),
  discount_value NUMERIC(10,2),
  min_order_value NUMERIC(10,2),
  min_order_qty NUMERIC(10,2),
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schemes_company_id ON public.schemes(company_id);
CREATE INDEX IF NOT EXISTS idx_schemes_product_id ON public.schemes(product_id);

-- Alter products to add company_id if not exists
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Enable Row Level Security (RLS) on companies and schemes
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;

-- Grant select to anon & authenticated
GRANT SELECT ON public.companies TO anon, authenticated;
GRANT SELECT ON public.schemes TO anon, authenticated;

-- Grant all on companies, schemes to authenticated for management
GRANT ALL ON public.companies TO authenticated;
GRANT ALL ON public.schemes TO authenticated;

-- Drop and recreate views to pick up the brand new company_id column in products
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

CREATE OR REPLACE VIEW public.v_product_stock AS
WITH stock_summary AS (
  SELECT 
    product_id, 
    COALESCE(SUM(stock_base_units), 0) as stock_base_units, 
    AVG(NULLIF(avg_landed_cost, 0)) as avg_landed_cost
  FROM public.inventory
  GROUP BY product_id
)
SELECT 
    p.*,
    COALESCE(s.stock_base_units, 0) as stock_base_units,
    COALESCE(NULLIF(s.avg_landed_cost, 0), 0.01) as avg_landed_cost,
    (COALESCE(s.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock
FROM public.products p
LEFT JOIN stock_summary s ON p.id = s.product_id;

CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
WITH stock_summary AS (
  SELECT 
    id as inventory_id,
    warehouse_id, 
    product_id,
    COALESCE(stock_base_units, 0) as stock_base_units, 
    COALESCE(avg_landed_cost, 0) as avg_landed_cost
  FROM public.inventory
)
SELECT 
    s.inventory_id,
    s.warehouse_id,
    s.stock_base_units,
    s.avg_landed_cost,
    (s.stock_base_units <= COALESCE(p.min_stock, 0)) as is_low_stock,
    p.*
FROM public.products p
JOIN stock_summary s ON p.id = s.product_id;

-- Grant SELECT permissions on views to authenticated & anon
GRANT SELECT ON public.v_product_stock TO anon, authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO anon, authenticated;

-- Run fix_table_rls if function exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fix_table_rls') THEN
        PERFORM public.fix_table_rls('companies');
        PERFORM public.fix_table_rls('schemes');
    END IF;
END $$;
