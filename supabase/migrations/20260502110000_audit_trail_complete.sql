
-- Restore target margins to products for override functionality
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS target_margin_premium numeric DEFAULT 3,
  ADD COLUMN IF NOT EXISTS target_margin_gold numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS target_margin_silver numeric DEFAULT 7,
  ADD COLUMN IF NOT EXISTS target_margin_bronze numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS target_margin_basic numeric DEFAULT 15;

-- 1. Correct the Products trigger to include MRP, GST and target margins
CREATE OR REPLACE FUNCTION public.log_product_field_changes()
RETURNS TRIGGER AS $body$
BEGIN
  -- MRP
  IF COALESCE(OLD.mrp, 0) <> COALESCE(NEW.mrp, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'mrp', OLD.mrp, NEW.mrp, auth.uid());
  END IF;
  
  -- GST Rate
  IF COALESCE(OLD.gst_rate, 0) <> COALESCE(NEW.gst_rate, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'gst_rate', OLD.gst_rate, NEW.gst_rate, auth.uid());
  END IF;

  -- Margins (Primary drivers for RBP)
  IF COALESCE(OLD.target_margin_premium, 0) <> COALESCE(NEW.target_margin_premium, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'target_margin_premium', OLD.target_margin_premium, NEW.target_margin_premium, auth.uid());
  END IF;

  IF COALESCE(OLD.target_margin_gold, 0) <> COALESCE(NEW.target_margin_gold, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'target_margin_gold', OLD.target_margin_gold, NEW.target_margin_gold, auth.uid());
  END IF;

  IF COALESCE(OLD.target_margin_silver, 0) <> COALESCE(NEW.target_margin_silver, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'target_margin_silver', OLD.target_margin_silver, NEW.target_margin_silver, auth.uid());
  END IF;

  IF COALESCE(OLD.target_margin_bronze, 0) <> COALESCE(NEW.target_margin_bronze, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'target_margin_bronze', OLD.target_margin_bronze, NEW.target_margin_bronze, auth.uid());
  END IF;

  IF COALESCE(OLD.target_margin_basic, 0) <> COALESCE(NEW.target_margin_basic, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'target_margin_basic', OLD.target_margin_basic, NEW.target_margin_basic, auth.uid());
  END IF;

  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach the products trigger
DROP TRIGGER IF EXISTS tr_log_product_field_changes ON public.products;
CREATE TRIGGER tr_log_product_field_changes
AFTER UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.log_product_field_changes();

-- 2. Create the trigger for product_price_tiers (Actual RBP values)
CREATE OR REPLACE FUNCTION public.log_tier_price_changes()
RETURNS TRIGGER AS $body$
BEGIN
  IF COALESCE(OLD.price, 0) <> COALESCE(NEW.price, 0) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.product_id, 'rbp_' || NEW.shop_type || '_' || NEW.pack_type, OLD.price, NEW.price, auth.uid());
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_log_tier_price_changes ON public.product_price_tiers;
CREATE TRIGGER tr_log_tier_price_changes
AFTER UPDATE ON public.product_price_tiers
FOR EACH ROW
EXECUTE FUNCTION public.log_tier_price_changes();
