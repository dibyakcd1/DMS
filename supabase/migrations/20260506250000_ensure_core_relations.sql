
-- MIGRATION: Ensure all Order & Inventory tables exist
-- This migration fixes missing relations and ensures schema consistency for the dispatch engine.

DO $body$ 
BEGIN
  -- 1. inventory_batches: Ensure remaining_qty exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_batches' AND column_name = 'remaining_qty') THEN
    ALTER TABLE public.inventory_batches ADD COLUMN remaining_qty NUMERIC(15,2) DEFAULT 0 NOT NULL;
    -- Initialize remaining_qty with received_qty for existing records
    UPDATE public.inventory_batches SET remaining_qty = received_qty WHERE remaining_qty = 0;
  END IF;

  -- 2. stock_ledger: Create if missing
  CREATE TABLE IF NOT EXISTS public.stock_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    qty_transacted NUMERIC(15,2) NOT NULL,
    entry_type TEXT NOT NULL, -- 'purchase', 'dispatch', 'adjustment', 'reversal'
    reference_id UUID,        -- order_id, purchase_invoice_id, adjustment_id
    reason TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
  );

  -- Ensure all required columns exist in stock_ledger
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'batch_id') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'qty_transacted') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN qty_transacted NUMERIC(15,2) DEFAULT 0 NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'entry_type') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN entry_type TEXT DEFAULT 'adjustment' NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'reference_id') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN reference_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'reference_type') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN reference_type TEXT DEFAULT 'order' NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'notes') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN notes TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'reason') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_ledger' AND column_name = 'created_by') THEN
    ALTER TABLE public.stock_ledger ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;

  -- 3. order_batch_deductions: Create if missing
  CREATE TABLE IF NOT EXISTS public.order_batch_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE RESTRICT,
    qty_base_units NUMERIC(15,2) NOT NULL CHECK (qty_base_units > 0),
    created_at TIMESTAMPTZ DEFAULT now()
  );

  -- 4. Enable RLS
  ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.order_batch_deductions ENABLE ROW LEVEL SECURITY;

  -- 5. Policies for stock_ledger
  DROP POLICY IF EXISTS "view_all_stock_ledger" ON public.stock_ledger;
  CREATE POLICY "view_all_stock_ledger" ON public.stock_ledger FOR SELECT TO authenticated USING (true);
  
  DROP POLICY IF EXISTS "admin_manage_stock_ledger" ON public.stock_ledger;
  CREATE POLICY "admin_manage_stock_ledger" ON public.stock_ledger FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));

  -- 6. Policies for order_batch_deductions
  DROP POLICY IF EXISTS "view_all_deductions" ON public.order_batch_deductions;
  CREATE POLICY "view_all_deductions" ON public.order_batch_deductions FOR SELECT TO authenticated USING (true);

  DROP POLICY IF EXISTS "admin_manage_deductions" ON public.order_batch_deductions;
  CREATE POLICY "admin_manage_deductions" ON public.order_batch_deductions FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));

END $body$;

-- 7. Grant permissions for RPC to use these tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_batch_deductions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_ledger TO authenticated;
GRANT SELECT, UPDATE ON public.inventory_batches TO authenticated;
GRANT SELECT, UPDATE ON public.inventory TO authenticated;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
