-- Final fix for deletion rights and RLS policies
-- We avoid the 'is_admin_or_owner' function dependency issues by using direct subqueries
-- or defining a new, clean version if possible.

-- 1. Ensure all relevant tables have RLS enabled
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing problematic policies that might depend on the broken function
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Salespeople can manage own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow users to view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can manage all order items" ON public.order_items;
DROP POLICY IF EXISTS "Users can manage own order items" ON public.order_items;
DROP POLICY IF EXISTS "Allow users to view all order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins can manage all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow users to view all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
DROP POLICY IF EXISTS "Allow users to view all payments" ON public.payments;

-- 3. Create fresh, robust policies using direct role checks to bypass function lock
-- ORDERS
CREATE POLICY "admin_all_orders" ON public.orders FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "owner_manage_orders" ON public.orders FOR ALL TO authenticated
  USING (salesperson_id = auth.uid())
  WITH CHECK (salesperson_id = auth.uid());

CREATE POLICY "public_view_orders" ON public.orders FOR SELECT TO authenticated USING (true);

-- ORDER ITEMS
CREATE POLICY "admin_all_order_items" ON public.order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "owner_manage_order_items" ON public.order_items FOR ALL TO authenticated
  USING (order_id IN (SELECT id FROM public.orders WHERE salesperson_id = auth.uid()))
  WITH CHECK (order_id IN (SELECT id FROM public.orders WHERE salesperson_id = auth.uid()));

CREATE POLICY "public_view_order_items" ON public.order_items FOR SELECT TO authenticated USING (true);

-- INVOICES
CREATE POLICY "admin_all_invoices" ON public.invoices FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "public_view_invoices" ON public.invoices FOR SELECT TO authenticated USING (true);

-- PAYMENTS
CREATE POLICY "admin_all_payments" ON public.payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "public_view_payments" ON public.payments FOR SELECT TO authenticated USING (true);

-- INVENTORY BATCHES
DROP POLICY IF EXISTS "Allow admins to manage inventory_batches" ON public.inventory_batches;
CREATE POLICY "admin_all_inventory_batches" ON public.inventory_batches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 4. Re-verify Foreing Key Cascades
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_order_id_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_order_id_fkey 
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey 
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey 
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

-- 5. Finalize Deletion Rights
-- Some environments need explicit grant for DELETE
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.order_items TO authenticated;
GRANT ALL ON public.invoices TO authenticated;
GRANT ALL ON public.payments TO authenticated;
