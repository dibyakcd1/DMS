
-- AUTO TOGGLE PRODUCT ACTIVE STATUS BASED ON STOCK levels
-- When stock hits 0, set is_active = false
-- When stock becomes > 0, set is_active = true

CREATE OR REPLACE FUNCTION public.fn_auto_toggle_product_active()
RETURNS TRIGGER AS $body$
BEGIN
  -- If stock dropped to 0 or below, deactivate product
  IF NEW.stock_base_units <= 0 THEN
    UPDATE public.products 
    SET is_active = false 
    WHERE id = NEW.product_id AND is_active = true;
  
  -- If stock is now positive, activate product
  ELSIF NEW.stock_base_units > 0 THEN
    UPDATE public.products 
    SET is_active = true 
    WHERE id = NEW.product_id AND is_active = false;
  END IF;
  
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists and recreate
DROP TRIGGER IF EXISTS trg_auto_toggle_product_active ON public.inventory;

CREATE TRIGGER trg_auto_toggle_product_active
AFTER INSERT OR UPDATE ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_toggle_product_active();

-- Initial sync: Ensure all products with 0 stock are inactive and those with stock are active
-- We do this carefully to avoid overwriting products the user might have manually deactivated for other reasons,
-- but the request was "when stock 0 product will be inactive", so we'll align the current state.
UPDATE public.products p
SET is_active = (COALESCE(i.stock_base_units, 0) > 0)
FROM public.inventory i
WHERE p.id = i.product_id;
