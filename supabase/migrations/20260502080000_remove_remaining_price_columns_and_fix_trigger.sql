-- Remove remaining cost/price columns from products and fix broken trigger
-- 1. Drop the trigger and function that depend on old columns
DROP TRIGGER IF EXISTS tr_log_product_price_changes ON public.products;
DROP FUNCTION IF EXISTS public.log_product_price_changes();

-- 2. Drop the remaining redundant/cost columns
ALTER TABLE public.products 
  DROP COLUMN IF EXISTS rbp_case,
  DROP COLUMN IF EXISTS units_per_case,
  DROP COLUMN IF EXISTS case_landed_price,
  DROP COLUMN IF EXISTS case_freight_cost,
  DROP COLUMN IF EXISTS target_margin_silver,
  DROP COLUMN IF EXISTS target_margin_gold,
  DROP COLUMN IF EXISTS target_margin_premium,
  DROP COLUMN IF EXISTS target_margin_bronze,
  DROP COLUMN IF EXISTS target_margin_basic;

-- 3. Re-create the trigger to only track MRP and GST (the remaining price-like fields in products)
CREATE OR REPLACE FUNCTION public.log_product_field_changes()
RETURNS TRIGGER AS $body$
BEGIN
  IF COALESCE(OLD.mrp, 0) <> COALESCE(NEW.mrp, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'mrp', OLD.mrp, NEW.mrp, auth.uid());
  END IF;
  
  IF COALESCE(OLD.gst_rate, 0) <> COALESCE(NEW.gst_rate, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'gst_rate', OLD.gst_rate, NEW.gst_rate, auth.uid());
  END IF;

  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_log_product_field_changes
AFTER UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.log_product_field_changes();
