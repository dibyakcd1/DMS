
-- MIGRATION: Fix Payments, Invoices, and Orders RLS
-- Ensures owners and staff have correct permissions.

DO $body$ 
BEGIN
  -- 1. PAYMENTS
  ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "admin_all_payments" ON public.payments;
  DROP POLICY IF EXISTS "public_view_payments" ON public.payments;
  DROP POLICY IF EXISTS "view_all_payments" ON public.payments;
  DROP POLICY IF EXISTS "admin_owner_manage_payments" ON public.payments;
  DROP POLICY IF EXISTS "authenticated_insert_payments" ON public.payments;
  
  CREATE POLICY "view_all_payments" ON public.payments FOR SELECT TO authenticated USING (true);
  CREATE POLICY "manage_all_payments" ON public.payments FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));
  CREATE POLICY "staff_insert_payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);

  -- 2. INVOICES
  ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "admin_all_invoices" ON public.invoices;
  DROP POLICY IF EXISTS "public_view_invoices" ON public.invoices;
  
  CREATE POLICY "view_all_invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
  CREATE POLICY "manage_all_invoices" ON public.invoices FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));
  -- Invoices are usually created by system/admin, but if staff needs to insert:
  CREATE POLICY "staff_insert_invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);

  -- 3. ORDERS
  ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "admin_all_orders" ON public.orders;
  DROP POLICY IF EXISTS "owner_manage_orders" ON public.orders;
  DROP POLICY IF EXISTS "public_view_orders" ON public.orders;
  
  CREATE POLICY "view_all_orders" ON public.orders FOR SELECT TO authenticated USING (true);
  CREATE POLICY "manage_all_orders" ON public.orders FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));
  CREATE POLICY "salesperson_manage_own_orders" ON public.orders FOR ALL TO authenticated
    USING (salesperson_id = auth.uid())
    WITH CHECK (salesperson_id = auth.uid());

  -- 4. ORDER ITEMS
  ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "admin_all_order_items" ON public.order_items;
  DROP POLICY IF EXISTS "owner_manage_order_items" ON public.order_items;
  DROP POLICY IF EXISTS "public_view_order_items" ON public.order_items;
  
  CREATE POLICY "view_all_order_items" ON public.order_items FOR SELECT TO authenticated USING (true);
  CREATE POLICY "manage_all_order_items" ON public.order_items FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));
  CREATE POLICY "staff_manage_own_order_items" ON public.order_items FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.salesperson_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.salesperson_id = auth.uid()));

END $body$;
