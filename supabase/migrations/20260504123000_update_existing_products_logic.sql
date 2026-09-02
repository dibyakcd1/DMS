
-- Migration: Apply new business logic to existing products 
-- 2026-05-04

DO $body$
BEGIN
  -- 1. Update Case Type logic
  -- If Item Pack Type is pouch, bag, sachet, or packet -> 'bag', else 'carton'
  UPDATE public.products
  SET case_type = 'bag'
  WHERE item_pack_type ~* '(pouch|bag|sachet|pkt|packet)';

  UPDATE public.products
  SET case_type = 'carton'
  WHERE case_type IS NULL OR item_pack_type IS NULL OR item_pack_type !~* '(pouch|bag|sachet|pkt|packet)';

  -- 2. Update Base Weight Unit logic
  -- Only 'g' (grams) for pouches/sachets, others use 'pcs'
  UPDATE public.products
  SET base_weight_unit = 'g'
  WHERE item_pack_type ~* '(pouch|sachet)';

  UPDATE public.products
  SET base_weight_unit = 'pcs'
  WHERE base_weight_unit IS NULL OR item_pack_type IS NULL OR item_pack_type !~* '(pouch|sachet)';

  -- 3. Update Chain Pack / MRP Priced logic based on name
  UPDATE public.products
  SET 
    is_chain_item = TRUE,
    is_mrp_priced = TRUE
  WHERE name ~* '(chain pack|cb item|chainpack|\[ACB\])' 
     OR sku ~* '^BM-ACB-';

  -- 4. Set Preferred Sell Unit for specialized items
  -- Chain packs and ACB items should default to 'unit' (pcs) for selling
  UPDATE public.products
  SET preferred_sell_unit = 'unit'
  WHERE is_chain_item = TRUE 
     OR item_pack_type ~* 'acb';

  -- 5. Standardize legacy 'unit' and 'base_unit' columns if null
  UPDATE public.products
  SET brand = 'Bharat Masala'
  WHERE brand IS NULL OR brand = '';

END $body$;
