-- Allow authenticated users to delete stock audits and their items
DROP POLICY IF EXISTS "Allow authenticated users to delete audits" ON public.stock_audits;
CREATE POLICY "Allow authenticated users to delete audits" ON public.stock_audits
  FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete audit items" ON public.stock_audit_items;
CREATE POLICY "Allow authenticated users to delete audit items" ON public.stock_audit_items
  FOR DELETE TO authenticated USING (true);
