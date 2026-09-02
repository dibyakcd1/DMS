
-- Update existing products with default pack types and preferred sell units
-- 2026-05-01

-- 1. Pouch/Sachet Patterns -> Packets
UPDATE public.products
SET 
  item_pack_type = CASE 
    WHEN (name ~* 'SACHET' OR sku ~* 'SACHET') THEN 'sachet'
    ELSE 'pouch'
  END,
  preferred_sell_unit = 'packet'
WHERE (name ~* 'POUCH|SACHET|GMS|KG|PKT' OR sku ~* 'POUCH|SACHET|GMS|KG|PKT')
  AND (preferred_sell_unit IS NULL OR preferred_sell_unit = 'case');

-- 2. Jar/Bottle/Tin/ACB/Bag/Box/Can Patterns -> Units
UPDATE public.products
SET 
  item_pack_type = CASE 
    WHEN (name ~* 'ACB' OR sku ~* 'ACB') THEN 'acb'
    WHEN (name ~* 'JAR' OR sku ~* 'JAR') THEN 'jar'
    WHEN (name ~* 'BTL|BOTTLE' OR sku ~* 'BTL|BOTTLE') THEN 'bottle'
    WHEN (name ~* 'TIN' OR sku ~* 'TIN') THEN 'tin'
    WHEN (name ~* 'CAN' OR sku ~* 'CAN') THEN 'can'
    WHEN (name ~* 'BAG' OR sku ~* 'BAG') THEN 'bag'
    ELSE 'box'
  END,
  preferred_sell_unit = 'unit'
WHERE (name ~* 'ACB|JAR|BOTTLE|BTL|TIN|CAN|BOX|BAG' OR sku ~* 'ACB|JAR|BOTTLE|BTL|TIN|CAN|BOX|BAG')
  AND (preferred_sell_unit IS NULL OR preferred_sell_unit = 'case');

-- 3. Specialized case for "Chain" products if they exist (usually pouch/sachet)
UPDATE public.products
SET 
  item_pack_type = 'sachet',
  preferred_sell_unit = 'packet'
WHERE (name ~* 'CHAIN' OR sku ~* 'CHAIN')
  AND (preferred_sell_unit IS NULL OR preferred_sell_unit = 'case');
