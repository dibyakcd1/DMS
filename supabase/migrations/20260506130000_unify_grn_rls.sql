
-- UNIFIED RLS FOR GRN MANAGEMENT
-- This ensures that users with 'admin' or 'owner' roles in EITHER profiles OR user_roles can manage GRNs.

-- 1. Purchase Invoices
DROP POLICY IF EXISTS "Allow admins to manage purchase_invoices" ON public.purchase_invoices;
CREATE POLICY "Allow admins to manage purchase_invoices"
ON public.purchase_invoices
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
);

-- 2. Purchase Invoice Items
DROP POLICY IF EXISTS "write_pi_items" ON public.purchase_invoice_items;
CREATE POLICY "write_pi_items" ON public.purchase_invoice_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
);

-- 3. GRN Aliases
DROP POLICY IF EXISTS "write_grn_aliases" ON public.grn_product_aliases;
CREATE POLICY "write_grn_aliases" ON public.grn_product_aliases
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'owner')
  )
);
