-- Standardize packaging and remove redundant cost columns from products
ALTER TABLE public.products 
  DROP COLUMN IF EXISTS rbp_unit,
  DROP COLUMN IF EXISTS selling_price,
  DROP COLUMN IF EXISTS bag_landed_price,
  DROP COLUMN IF EXISTS bag_freight_cost,
  DROP COLUMN IF EXISTS min_selling_price,
  DROP COLUMN IF EXISTS target_margin_retailer,
  DROP COLUMN IF EXISTS target_margin_wholesaler,
  DROP COLUMN IF EXISTS target_margin_distributor,
  DROP COLUMN IF EXISTS target_margin_chain,
  DROP COLUMN IF EXISTS carton_invoice_price,
  DROP COLUMN IF EXISTS units_per_carton,
  DROP COLUMN IF EXISTS unit_per_carton,
  DROP COLUMN IF EXISTS units_per_bag,
  DROP COLUMN IF EXISTS packets_per_bag;

-- Rename rbp_carton to rbp_case if it exists
DO $body$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'rbp_carton') THEN
    ALTER TABLE public.products RENAME COLUMN rbp_carton TO rbp_case;
  END IF;
END $body$;

-- Also rename price source if any (Check if preferred_sell_unit needs migration)
UPDATE public.products SET preferred_sell_unit = 'case' WHERE preferred_sell_unit IN ('carton', 'bag');
