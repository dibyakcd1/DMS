
-- Migration: Data Cleanup for Product Attributes
-- 2026-05-04

DO $body$
BEGIN
  -- 1. Reset Chain Item logic (Strict Correctness)
  -- ACB is NOT a chain item.
  UPDATE public.products
  SET 
    is_chain_item = FALSE,
    is_mrp_priced = FALSE,
    chain_mrp_label = NULL;

  -- Rule: is_mrp_priced is true for items with MRP > 0
  UPDATE public.products
  SET is_mrp_priced = TRUE
  WHERE mrp > 0;

  -- Then, enable only for those that match specific chain patterns (excluding ACB)
  UPDATE public.products
  SET 
    is_chain_item = TRUE,
    is_mrp_priced = TRUE,
    -- Improved extraction for Rs label
    chain_mrp_label = substring(name from '(?i)(Rs\.?|Re\.?)\s*\d+\s*\/-(\s*\(\d+pc\))?')
  WHERE name ~* '(chain pack|cb item|chainpack)'
    AND name !~* '\[ACB\]';

  -- 2. Clean up Pack Size Unit
  -- If it has numbers in it (like '100 gms'), we extract just the letters and normalize
  UPDATE public.products
  SET pack_size_unit = lower(substring(pack_size_unit from '[a-zA-Z]+'))
  WHERE pack_size_unit ~ '[0-9]';

  -- Normalize common units
  UPDATE public.products
  SET pack_size_unit = 'g'
  WHERE pack_size_unit IN ('gms', 'gm', 'gram', 'grams', 'g');

  UPDATE public.products
  SET pack_size_unit = 'l'
  WHERE pack_size_unit IN ('ltr', 'ltrs', 'liter', 'liters', 'l');

  -- 3. Consolidate unit and base_unit
  UPDATE public.products
  SET unit = COALESCE(base_unit, unit)
  WHERE base_unit IS NOT NULL;

  UPDATE public.products
  SET base_unit = unit
  WHERE unit IS NOT NULL AND base_unit IS NULL;

  -- 4. Final consistency check for Case Types and Weight Units
  UPDATE public.products
  SET case_type = 'bag'
  WHERE item_pack_type ~* '(pouch|bag|sachet|pkt|packet)';

  UPDATE public.products
  SET case_type = 'carton'
  WHERE case_type IS NULL OR item_pack_type IS NULL OR item_pack_type !~* '(pouch|bag|sachet|pkt|packet)';

  UPDATE public.products
  SET base_weight_unit = 'g'
  WHERE item_pack_type ~* '(pouch|sachet)';

  UPDATE public.products
  SET base_weight_unit = 'pcs'
  WHERE base_weight_unit IS NULL OR item_pack_type IS NULL OR item_pack_type !~* '(pouch|sachet)';

  -- 5. Preferred Sell Unit Correction
  -- Rule: if "pc" or "pcs" is in the name, Preferred Sell Unit must be 'packet'
  UPDATE public.products
  SET preferred_sell_unit = 'packet'
  WHERE name ~* '(\d+pc|pcs)';

  -- Jars, Bottles, Tins, ACB items usually 'unit' unless 'pc' rule above applied
  UPDATE public.products
  SET preferred_sell_unit = 'unit'
  WHERE (item_pack_type ~* '(jar|bottle|tin|acb)' OR name ~* '\[ACB\]')
    AND name !~* '(\d+pc|pcs)';

END $body$;
