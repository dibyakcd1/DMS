
-- Standardize Terminology: Rename Bag/Carton to Case
-- 2026-05-01

-- 1. Rename columns in products table
DO $body$ 
BEGIN
  -- packets_per_bag to packets_per_case
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'packets_per_bag') THEN
    ALTER TABLE public.products RENAME COLUMN packets_per_bag TO packets_per_case;
  END IF;

  -- units_per_bag to units_per_case
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'units_per_bag') THEN
    ALTER TABLE public.products RENAME COLUMN units_per_bag TO units_per_case;
  END IF;

  -- rbp_bag to rbp_case
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'rbp_bag') THEN
    ALTER TABLE public.products RENAME COLUMN rbp_bag TO rbp_case;
  END IF;

  -- bag_landed_price to case_landed_price
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'bag_landed_price') THEN
    ALTER TABLE public.products RENAME COLUMN bag_landed_price TO case_landed_price;
  END IF;

  -- bag_freight_cost to case_freight_cost
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'bag_freight_cost') THEN
    ALTER TABLE public.products RENAME COLUMN bag_freight_cost TO case_freight_cost;
  END IF;

  -- bag_invoice_price to case_invoice_price
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'bag_invoice_price') THEN
    ALTER TABLE public.products RENAME COLUMN bag_invoice_price TO case_invoice_price;
  END IF;

  -- units_per_carton to units_per_case_alt (just in case they both existed)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'units_per_carton') THEN
    ALTER TABLE public.products RENAME COLUMN units_per_carton TO units_per_case_legacy;
  END IF;

  -- carton_invoice_price to case_invoice_price_legacy
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'carton_invoice_price') THEN
    ALTER TABLE public.products RENAME COLUMN carton_invoice_price TO case_invoice_price_legacy;
  END IF;
  
  -- unit_per_carton to units_per_case_v1
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'unit_per_carton') THEN
    ALTER TABLE public.products RENAME COLUMN unit_per_carton TO units_per_case_v1;
  END IF;
END $body$;

-- 2. Update price change logging trigger to use new column names
CREATE OR REPLACE FUNCTION public.log_product_price_change()
RETURNS TRIGGER AS $body$
BEGIN
  IF (OLD.selling_price IS DISTINCT FROM NEW.selling_price) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'selling_price', OLD.selling_price, NEW.selling_price, auth.uid());
  END IF;
  IF (OLD.rbp_unit IS DISTINCT FROM NEW.rbp_unit) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'rbp_unit', OLD.rbp_unit, NEW.rbp_unit, auth.uid());
  END IF;
  IF (OLD.rbp_carton IS DISTINCT FROM NEW.rbp_carton) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'rbp_carton', OLD.rbp_carton, NEW.rbp_carton, auth.uid());
  END IF;
  IF (OLD.rbp_case IS DISTINCT FROM NEW.rbp_case) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'rbp_case', OLD.rbp_case, NEW.rbp_case, auth.uid());
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Extend pack_type enum if not already done
DO $body$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type') THEN
    -- Try to add 'case' if it doesn't exist (enum values can't be added inside a transaction easily in older PG, but Supabase handles it)
    BEGIN
      ALTER TYPE public.pack_type ADD VALUE IF NOT EXISTS 'case';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $body$;
