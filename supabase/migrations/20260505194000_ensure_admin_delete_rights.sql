-- Ensure RLS policies for administrative management of orders and payments
-- This migration ensures that admins have full DELETE permissions.

-- 1. Helper function for admin check
-- We use REPLACE without DROP to avoid dependency errors. 
-- The parameter name _user_id matches the existing definition to prevent schema mismatch.
CREATE OR REPLACE FUNCTION public.is_admin_or_owner(_user_id uuid)
RETURNS boolean AS $body$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role IN ('admin', 'owner')
  );
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Orders table
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
CREATE POLICY "Admins can manage all orders" ON public.orders FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Salespeople can manage own orders" ON public.orders;
CREATE POLICY "Salespeople can manage own orders" ON public.orders FOR ALL TO authenticated
  USING (salesperson_id = auth.uid())
  WITH CHECK (salesperson_id = auth.uid());

DROP POLICY IF EXISTS "Allow users to view all orders" ON public.orders;
CREATE POLICY "Allow users to view all orders" ON public.orders FOR SELECT TO authenticated USING (true);

-- 3. Order Items table
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage all order items" ON public.order_items;
CREATE POLICY "Admins can manage all order items" ON public.order_items FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Users can manage own order items" ON public.order_items;
CREATE POLICY "Users can manage own order items" ON public.order_items FOR ALL TO authenticated
  USING (order_id IN (SELECT id FROM public.orders WHERE salesperson_id = auth.uid()))
  WITH CHECK (order_id IN (SELECT id FROM public.orders WHERE salesperson_id = auth.uid()));

DROP POLICY IF EXISTS "Allow users to view all order items" ON public.order_items;
CREATE POLICY "Allow users to view all order items" ON public.order_items FOR SELECT TO authenticated USING (true);

-- 4. Invoices table
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage all invoices" ON public.invoices;
CREATE POLICY "Admins can manage all invoices" ON public.invoices FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Allow users to view all invoices" ON public.invoices;
CREATE POLICY "Allow users to view all invoices" ON public.invoices FOR SELECT TO authenticated USING (true);

-- 5. Payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
CREATE POLICY "Admins can manage all payments" ON public.payments FOR ALL TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Allow users to view all payments" ON public.payments;
CREATE POLICY "Allow users to view all payments" ON public.payments FOR SELECT TO authenticated USING (true);

-- 6. Add CASCADE where missing to facilitate deletion
-- Invoices
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_order_id_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_order_id_fkey 
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

-- Order Items
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey 
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;

-- Payments
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey 
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
