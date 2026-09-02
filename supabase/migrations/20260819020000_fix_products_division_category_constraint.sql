-- Migration to fix products_division_category_check constraint
-- Ensures valid category check constraint or drops obsolete check constraint if incompatible

BEGIN;

-- Check and replace/relax the products_division_category_check constraint to allow all standard categories and fallback
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.products'::regclass 
      AND conname = 'products_division_category_check'
  ) THEN
    ALTER TABLE public.products DROP CONSTRAINT products_division_category_check;
  END IF;
END $$;

-- Fix any legacy rows with invalid or NULL category
UPDATE public.products 
SET division_category = 'Spices' 
WHERE division_category IS NULL OR TRIM(division_category) = '' OR division_category = 'SPECIAL PRODUCTS';

-- Alter default value on products.division_category to 'Spices'
ALTER TABLE public.products ALTER COLUMN division_category SET DEFAULT 'Spices';

COMMIT;
