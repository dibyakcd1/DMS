-- Ensure products table has RLS enabled and policies for access
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Policy for viewing products (all authenticated users)
CREATE POLICY "Allow authenticated to view products" 
ON public.products 
FOR SELECT 
TO authenticated 
USING (true);

-- Policy for managing products (admins only)
-- We check profiles.role = 'admin' or 'owner'
CREATE POLICY "Allow admins to manage products" 
ON public.products 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
);

-- Also ensure inventory_batches has RLS if it was recreated
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated to view inventory_batches" 
ON public.inventory_batches 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Allow admins to manage inventory_batches" 
ON public.inventory_batches 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'owner')
  )
);
