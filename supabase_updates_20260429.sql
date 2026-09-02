-- Bharat Masala Database Fixes (2026-04-29)

-- 1. Add Shop Types
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shop_type') THEN
        CREATE TYPE public.shop_type AS ENUM ('retailer', 'wholesaler', 'distributor', 'chain');
    END IF;
END $$;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_type public.shop_type NOT NULL DEFAULT 'retailer';

-- 2. Add Pack Types and Price Tiers
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type') THEN
        CREATE TYPE public.pack_type AS ENUM ('unit', 'carton', 'bag');
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.product_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  shop_type public.shop_type NOT NULL DEFAULT 'retailer',
  pack_type public.pack_type NOT NULL DEFAULT 'case',
  price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_price_tiers_unique ON public.product_price_tiers(product_id, shop_type, pack_type);

-- 3. Update Order Items to store pack type
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS pack_type public.pack_type NOT NULL DEFAULT 'case';
COMMENT ON COLUMN public.order_items.line_total IS 'Net total excluding GST (unit_price * quantity)';

-- 10. Add total_amount to purchase_invoices
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) DEFAULT 0;

-- 4. Add Shop Product Price Overrides
CREATE TABLE IF NOT EXISTS public.shop_product_price_overrides (
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_unit numeric(10,2),
  price_carton numeric(10,2),
  price_bag numeric(10,2),
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, product_id)
);
ALTER TABLE public.shop_product_price_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_overrides_select_auth" ON public.shop_product_price_overrides;
CREATE POLICY "shop_overrides_select_auth" ON public.shop_product_price_overrides FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "shop_overrides_admin_write" ON public.shop_product_price_overrides;
CREATE POLICY "shop_overrides_admin_write" ON public.shop_product_price_overrides FOR ALL TO authenticated USING (public.is_admin_or_owner(auth.uid()));

-- 5. Add Product Price History (Audit Trail)
CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  field_changed text NOT NULL,
  old_value numeric(10,2),
  new_value numeric(10,2),
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "price_history_select_admin" ON public.product_price_history;
CREATE POLICY "price_history_select_admin" ON public.product_price_history FOR SELECT TO authenticated USING (public.is_admin_or_owner(auth.uid()));

-- 7. Roles and Profile Updates
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'salesperson');
    END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'salesperson';

-- 6. Add Purchase Invoice Details
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS total_amount numeric(15,2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric(10,2) NOT NULL,
  unit_cost numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- 8. Fix Inventory Sync (Trigger Approach)
-- Create/Ensure the inventory table exists
CREATE TABLE IF NOT EXISTS public.inventory (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(10,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Function to recompute inventory for a product
CREATE OR REPLACE FUNCTION public.sync_inventory_from_batches()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.inventory (product_id, quantity, updated_at)
    SELECT product_id, SUM(remaining_qty), now()
    FROM public.inventory_batches
    WHERE product_id = OLD.product_id
    GROUP BY product_id
    ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
    RETURN OLD;
  ELSE
    INSERT INTO public.inventory (product_id, quantity, updated_at)
    SELECT product_id, SUM(remaining_qty), now()
    FROM public.inventory_batches
    WHERE product_id = NEW.product_id
    GROUP BY product_id
    ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on inventory_batches
DROP TRIGGER IF EXISTS trg_sync_inventory ON public.inventory_batches;
CREATE TRIGGER trg_sync_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_from_batches();

-- Initialize inventory table from current batches
INSERT INTO public.inventory (product_id, quantity, updated_at)
SELECT product_id, SUM(remaining_qty), now()
FROM public.inventory_batches
GROUP BY product_id
ON CONFLICT (product_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();

-- 13. Default GST to 0
ALTER TABLE public.products ALTER COLUMN gst_rate SET DEFAULT 0;
UPDATE public.products SET gst_rate = 0 WHERE gst_rate IS NULL OR gst_rate <> 0;

-- 9. Narrow Product Write Policy (Admins Only)
DROP POLICY IF EXISTS "products_admin_write" ON public.products;
CREATE POLICY "products_admin_write" ON public.products FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- 10. Order Number Generation
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

-- Ensure order_number has a default value to satisfy PostgREST/Supabase client
ALTER TABLE public.orders ALTER COLUMN order_number SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  year_month text;
  seq_val text;
BEGIN
  year_month := to_char(now(), 'YYYYMM');
  seq_val := lpad(nextval('public.order_number_seq')::text, 6, '0');
  NEW.order_number := 'BM-' || year_month || '-' || seq_val;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_order_number ON public.orders;
CREATE TRIGGER trg_generate_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
EXECUTE FUNCTION public.generate_order_number();

-- 11. Price History Trigger
CREATE OR REPLACE FUNCTION public.log_product_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.selling_price <> NEW.selling_price) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'selling_price', OLD.selling_price, NEW.selling_price, auth.uid());
  END IF;
  IF (OLD.rbp_unit <> NEW.rbp_unit) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'rbp_unit', OLD.rbp_unit, NEW.rbp_unit, auth.uid());
  END IF;
  IF (OLD.rbp_carton <> NEW.rbp_carton) THEN
    INSERT INTO public.product_price_history (product_id, field_changed, old_value, new_value, changed_by)
    VALUES (NEW.id, 'rbp_carton', OLD.rbp_carton, NEW.rbp_carton, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_price_change ON public.products;
CREATE TRIGGER trg_log_price_change
AFTER UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.log_product_price_change();

-- 12. Invoice Number Generation
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;

-- Ensure invoice_number has a default value to satisfy PostgREST/Supabase client
ALTER TABLE public.invoices ALTER COLUMN invoice_number SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  year_month text;
  seq_val text;
  prefix text;
BEGIN
  year_month := to_char(now(), 'YYMM');
  seq_val := lpad(nextval('public.invoice_number_seq')::text, 5, '0');
  prefix := CASE WHEN NEW.type = 'gst' THEN 'GST' ELSE 'CM' END;
  NEW.invoice_number := prefix || '/' || year_month || '/' || seq_val;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_invoice_number ON public.invoices;
CREATE TRIGGER trg_generate_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW
WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
EXECUTE FUNCTION public.generate_invoice_number();

-- 14. Fix orders to profiles relationships
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_salesperson_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_salesperson_id_fkey FOREIGN KEY (salesperson_id) REFERENCES public.profiles(id);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_approved_by_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);

-- 15. Gap Fixes (2026-04-29)
-- Landed Cost
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS landed_cost numeric(10,2);
UPDATE public.inventory_batches SET landed_cost = cost_price WHERE landed_cost IS NULL;

-- Product Pricing Fields
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preferred_sell_unit public.pack_type DEFAULT 'case';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rbp_unit numeric(10,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rbp_carton numeric(10,2) DEFAULT 0;

-- Margin View
CREATE OR REPLACE VIEW public.margin_report_view AS
SELECT 
  p.id as product_id, p.name as product_name, p.sku,
  p.selling_price as standard_selling_price,
  COALESCE(avg_cost.avg_landed_cost, 0) as avg_landed_cost,
  CASE WHEN p.selling_price > 0 THEN ((p.selling_price - COALESCE(avg_cost.avg_landed_cost, 0)) / p.selling_price) * 100 ELSE 0 END as margin_percent
FROM public.products p
LEFT JOIN (
  SELECT product_id, AVG(landed_cost) as avg_landed_cost
  FROM public.inventory_batches WHERE remaining_qty > 0 GROUP BY product_id
) avg_cost ON p.id = avg_cost.product_id
WHERE p.is_active = true;

-- Shop Balance Check
CREATE OR REPLACE FUNCTION public.get_shop_outstanding_balance(target_shop_id uuid)
RETURNS numeric(12,2) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(i.total - i.amount_paid), 0)
  FROM public.invoices i
  JOIN public.orders o ON i.order_id = o.id
  WHERE o.shop_id = target_shop_id AND i.payment_status <> 'paid';
$$;
