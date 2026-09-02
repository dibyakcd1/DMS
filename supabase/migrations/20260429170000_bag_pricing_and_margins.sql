-- Bharat Masala Bag Pricing and Margin Enhancements (2026-04-29)

-- 1. Add missing reference pricing columns to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rbp_bag numeric(10,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS units_per_bag integer DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bag_invoice_price numeric(10,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS carton_invoice_price numeric(10,2) DEFAULT 0;

-- 2. Add Chain Margin
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS target_margin_chain numeric(5,2) DEFAULT 10;

-- 3. Ensure consistency in unit_per_carton
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS units_per_carton integer DEFAULT 1;
UPDATE public.products SET units_per_carton = unit_per_carton WHERE units_per_carton = 1 AND unit_per_carton IS NOT NULL;

-- 4. Update Log Trigger to support rbp_bag
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
  IF (OLD.rbp_bag IS DISTINCT FROM NEW.rbp_bag) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'rbp_bag', OLD.rbp_bag, NEW.rbp_bag, auth.uid());
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;
