-- Product Price History and Audit Trail
CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  price_type text NOT NULL, -- 'selling_price', 'rbp_unit', 'rbp_carton', 'rbp_bag', 'min_selling_price'
  old_value numeric(10,2),
  new_value numeric(10,2),
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now()
);

-- Trigger to log price changes
CREATE OR REPLACE FUNCTION public.log_product_price_changes()
RETURNS TRIGGER AS $body$
BEGIN
  IF COALESCE(OLD.selling_price, 0) <> COALESCE(NEW.selling_price, 0) THEN
    INSERT INTO public.product_price_history (product_id, price_type, old_value, new_value, changed_by)
    VALUES (NEW.id, 'selling_price', OLD.selling_price, NEW.selling_price, auth.uid());
  END IF;
  
  IF COALESCE(OLD.rbp_unit, 0) <> COALESCE(NEW.rbp_unit, 0) THEN
    INSERT INTO public.product_price_history (product_id, price_type, old_value, new_value, changed_by)
    VALUES (NEW.id, 'rbp_unit', OLD.rbp_unit, NEW.rbp_unit, auth.uid());
  END IF;

  IF COALESCE(OLD.rbp_carton, 0) <> COALESCE(NEW.rbp_carton, 0) THEN
    INSERT INTO public.product_price_history (product_id, price_type, old_value, new_value, changed_by)
    VALUES (NEW.id, 'rbp_carton', OLD.rbp_carton, NEW.rbp_carton, auth.uid());
  END IF;

  IF COALESCE(OLD.rbp_bag, 0) <> COALESCE(NEW.rbp_bag, 0) THEN
    INSERT INTO public.product_price_history (product_id, price_type, old_value, new_value, changed_by)
    VALUES (NEW.id, 'rbp_bag', OLD.rbp_bag, NEW.rbp_bag, auth.uid());
  END IF;

  IF COALESCE(OLD.min_selling_price, 0) <> COALESCE(NEW.min_selling_price, 0) THEN
    INSERT INTO public.product_price_history (product_id, price_type, old_value, new_value, changed_by)
    VALUES (NEW.id, 'min_selling_price', OLD.min_selling_price, NEW.min_selling_price, auth.uid());
  END IF;

  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_log_product_price_changes
AFTER UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.log_product_price_changes();
