-- MIGRATION: DB3, DB4, G5 - Invoice Voiding, REAL-TIME Notifications, & Return Workflow Scaffolding

-- 1. Invoice Status & Voiding
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_void BOOLEAN DEFAULT false;

-- Update balance function to ignore voided invoices
CREATE OR REPLACE FUNCTION public.get_shop_outstanding_balance(target_shop_id uuid)
RETURNS numeric(12,2)
LANGUAGE sql STABLE SECURITY DEFINER
AS $body$
  SELECT COALESCE(SUM(i.total - i.amount_paid), 0)
  FROM public.invoices i
  JOIN public.orders o ON i.order_id = o.id
  WHERE o.shop_id = target_shop_id
  AND (i.payment_status IS DISTINCT FROM 'paid')
  AND (i.is_void = false);
$body$;

-- 2. Enhanced Revert Order RPC with Invoice Voiding
CREATE OR REPLACE FUNCTION public.revert_order_to_approved(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_deduction RECORD;
  v_order_status TEXT;
  v_product_id UUID;
BEGIN
  -- Lock the order
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order_status IN ('draft', 'pending_approval', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is already in a pre-dispatch state.');
  END IF;

  IF v_order_status = 'cancelled' THEN
     RETURN jsonb_build_object('success', false, 'error', 'Cannot revert a cancelled order.');
  END IF;

  -- 2.1 Void the associated invoice
  UPDATE public.invoices SET is_void = true WHERE order_id = p_order_id;

  -- Restore batch stock if it was dispatched or delivered
  FOR v_deduction IN 
    SELECT d.*, i.product_id 
    FROM public.order_batch_deductions d 
    JOIN public.order_items i ON d.order_item_id = i.id
    WHERE d.order_id = p_order_id 
    FOR UPDATE 
  LOOP
    v_product_id := v_deduction.product_id;

    UPDATE inventory_batches 
    SET remaining_qty = remaining_qty + v_deduction.qty_base_units 
    WHERE id = v_deduction.batch_id;

    INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, reference_type, created_by, notes)
    VALUES (v_product_id, v_deduction.batch_id, v_deduction.qty_base_units, 'reversal', p_order_id, 'order', auth.uid(), 'Order Reverted to Approved (Edit Mode)');
    
    PERFORM public.recompute_inventory(v_product_id);
  END LOOP;
  
  DELETE FROM public.order_batch_deductions WHERE order_id = p_order_id;

  UPDATE orders 
  SET status = 'approved',
      dispatched_at = NULL,
      delivered_at = NULL,
      delivery_note = NULL
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$body$;

-- 3. Notification Engine (DB4)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT,
    is_read BOOLEAN DEFAULT false,
    related_order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    related_invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
    link TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can see their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;

CREATE POLICY "Users can see their own notifications" ON public.notifications
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System can create notifications" ON public.notifications
    FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update their own notifications" ON public.notifications
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Trigger to automatically notify salespeople when order status changes
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS TRIGGER AS $body$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
    VALUES (
      NEW.salesperson_id,
      'Order Update: ' || NEW.order_number,
      'Your order has been moved to ' || NEW.status || '.',
      'order_status',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_order_status ON public.orders;
CREATE TRIGGER trg_notify_order_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_status_change();

-- 4. Return Workflow Scaffolding (G5)
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id),
    shop_id UUID REFERENCES public.shops(id) NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
    reason TEXT,
    items JSONB, -- Draft list for UI
    total_credit_amount NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "returns_read" ON public.returns;
DROP POLICY IF EXISTS "returns_insert" ON public.returns;
DROP POLICY IF EXISTS "returns_admin" ON public.returns;

CREATE POLICY "returns_read" ON public.returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "returns_insert" ON public.returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "returns_admin" ON public.returns FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));

-- 5. Cancel Order Fix: Also void invoice
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_deduction RECORD;
  v_order_status TEXT;
  v_product_id UUID;
BEGIN
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is already cancelled.');
  END IF;

  -- Void Invoice
  UPDATE public.invoices SET is_void = true WHERE order_id = p_order_id;

  IF v_order_status IN ('dispatched', 'delivered') THEN
    FOR v_deduction IN 
      SELECT d.*, i.product_id 
      FROM public.order_batch_deductions d 
      JOIN public.order_items i ON d.order_item_id = i.id
      WHERE d.order_id = p_order_id 
      FOR UPDATE 
    LOOP
       -- Restore Stock
      v_product_id := v_deduction.product_id;

      UPDATE inventory_batches 
      SET remaining_qty = remaining_qty + v_deduction.qty_base_units 
      WHERE id = v_deduction.batch_id;

      INSERT INTO stock_ledger (product_id, batch_id, qty_transacted, entry_type, reference_id, reference_type, created_by, notes)
      VALUES (v_product_id, v_deduction.batch_id, v_deduction.qty_base_units, 'reversal', p_order_id, 'order', auth.uid(), 'Order Cancelled');
      
      PERFORM public.recompute_inventory(v_product_id);
    END LOOP;
    DELETE FROM public.order_batch_deductions WHERE order_id = p_order_id;
  END IF;

  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true);
END;
$body$;

