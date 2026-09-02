-- Migration: Overhaul Products, GRN Import, External Codes and Aliases
-- Date: 2026-08-19

-- 1. Extend grn_product_aliases table
ALTER TABLE IF EXISTS public.grn_product_aliases 
  ADD COLUMN IF NOT EXISTS external_code TEXT,
  ADD COLUMN IF NOT EXISTS code_type TEXT DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hsn TEXT;

-- Create indexes for grn_product_aliases
CREATE INDEX IF NOT EXISTS idx_grn_aliases_product_id ON public.grn_product_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_grn_aliases_ext_code ON public.grn_product_aliases(external_code);
CREATE INDEX IF NOT EXISTS idx_grn_aliases_company_id ON public.grn_product_aliases(company_id);

-- 2. Extend purchase_invoices table
ALTER TABLE IF EXISTS public.purchase_invoices 
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_company_id ON public.purchase_invoices(company_id);

-- 3. Extend purchase_invoice_items table
ALTER TABLE IF EXISTS public.purchase_invoice_items 
  ADD COLUMN IF NOT EXISTS external_code TEXT,
  ADD COLUMN IF NOT EXISTS hsn TEXT;

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_ext_code ON public.purchase_invoice_items(external_code);

-- 4. Deterministic SKU Backfill for any product with empty or null SKU
UPDATE public.products
SET sku = UPPER(
  COALESCE(
    NULLIF(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), ''),
    'PROD'
  )
) || '-' || SUBSTRING(id::text, 1, 4)
WHERE sku IS NULL OR TRIM(sku) = '';

-- 5. Refresh product stock views to reflect any schema adjustments
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
LEFT JOIN stock_summary s ON p.id = s.product_id;

GRANT SELECT ON public.v_product_stock TO anon, authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO anon, authenticated;
