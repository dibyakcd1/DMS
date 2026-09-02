
-- First, remove any trailing ' pasta' that might have been added previously
UPDATE public.products 
SET name = REGEXP_REPLACE(name, '\s+pasta$', '', 'i')
WHERE name ILIKE '% vermicelli % pasta' 
   OR name ILIKE '% vermicelli pasta';

-- Then, insert ' /Pasta' directly after 'Vermicelli' if not already present
UPDATE public.products 
SET name = REGEXP_REPLACE(name, '(vermicelli)', '\1 /Pasta', 'i')
WHERE name ILIKE '%vermicelli%' 
  AND name NOT ILIKE '%vermicelli /Pasta%';
