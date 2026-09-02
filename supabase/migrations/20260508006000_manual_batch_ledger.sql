
-- Migration: Manual Batch Ledger Logging
-- Ensures that manually added inventory batches are recorded in the stock_ledger as 'purchase'.

CREATE OR REPLACE FUNCTION public.handle_new_batch_ledger()
RETURNS TRIGGER AS $body$
BEGIN
  INSERT INTO public.stock_ledger (
    product_id,
    batch_id,
    qty_transacted,
    entry_type,
    reference_id,
    reference_type,
    reason,
    notes,
    created_by
  ) VALUES (
    NEW.product_id,
    NEW.id,
    NEW.received_qty,
    'purchase',
    NEW.id,
    'batch',
    'variance', -- Initial/Batch setup
    'Initial Batch Setup: ' || COALESCE(NEW.notes, ''),
    NEW.performed_by
  );
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_new_batch_ledger ON public.inventory_batches;
CREATE TRIGGER trg_new_batch_ledger
AFTER INSERT ON public.inventory_batches
FOR EACH ROW EXECUTE FUNCTION public.handle_new_batch_ledger();
