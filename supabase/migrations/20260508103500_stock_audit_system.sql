-- Create Stock Audits Table
CREATE TABLE IF NOT EXISTS public.stock_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warehouse_id UUID REFERENCES public.warehouses(id),
    status TEXT NOT NULL CHECK (status IN ('draft', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    finalized_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id)
);

-- Create Stock Audit Items Table
CREATE TABLE IF NOT EXISTS public.stock_audit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES public.stock_audits(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    batch_id UUID REFERENCES public.inventory_batches(id),
    system_qty NUMERIC NOT NULL,
    physical_qty NUMERIC,
    variance NUMERIC GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.stock_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audit_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read audits" ON public.stock_audits;
CREATE POLICY "Allow authenticated users to read audits" ON public.stock_audits FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert audits" ON public.stock_audits;
CREATE POLICY "Allow authenticated users to insert audits" ON public.stock_audits FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update audits" ON public.stock_audits;
CREATE POLICY "Allow authenticated users to update audits" ON public.stock_audits FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to read audit items" ON public.stock_audit_items;
CREATE POLICY "Allow authenticated users to read audit items" ON public.stock_audit_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert audit items" ON public.stock_audit_items;
CREATE POLICY "Allow authenticated users to insert audit items" ON public.stock_audit_items FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update audit items" ON public.stock_audit_items;
CREATE POLICY "Allow authenticated users to update audit items" ON public.stock_audit_items FOR UPDATE TO authenticated USING (true);
