-- NEW MIGRATION: Fix RLS for purchase_invoices
-- This ensures that admins and owners can manage GRNs (purchase invoices)
-- and authenticated users can view them.

-- Enable RLS
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

-- Drop existing if any
DROP POLICY IF EXISTS "Allow authenticated to view purchase_invoices" ON public.purchase_invoices;
DROP POLICY IF EXISTS "Allow admins to manage purchase_invoices" ON public.purchase_invoices;

-- 1. Policy for viewing (all authenticated users)
CREATE POLICY "Allow authenticated to view purchase_invoices"
ON public.purchase_invoices
FOR SELECT
TO authenticated
USING (true);

-- 2. Policy for managing (admins/owners only)
-- We check profiles.role directly for robustness
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
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
);

-- Optimization: Grant permissions explicitly
GRANT ALL ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoice_items TO authenticated;
