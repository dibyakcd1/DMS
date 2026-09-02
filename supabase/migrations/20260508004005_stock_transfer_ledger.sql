
-- Migration: Stock Transfer Ledger Integration
-- This ensures inter-batch transfers are reflected in the stock_ledger for full auditability.

CREATE OR REPLACE FUNCTION public.handle_stock_transfer_ledger()
RETURNS TRIGGER AS $body$
BEGIN
  -- 1. Log Deduction from Source Batch
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
    NEW.from_batch_id,
    -NEW.quantity,
    'adjustment',
    NEW.id,
    'transfer',
    'variance', -- Default reason for stock movement
    'Transfer OUT: ' || COALESCE(NEW.notes, ''),
    NEW.performed_by
  );

  -- 2. Log Addition to Destination Batch
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
    NEW.to_batch_id,
    NEW.quantity,
    'adjustment',
    NEW.id,
    'transfer',
    'variance',
    'Transfer IN: ' || COALESCE(NEW.notes, ''),
    NEW.performed_by
  );

  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_transfer_ledger ON public.stock_transfers;
CREATE TRIGGER trg_log_transfer_ledger
AFTER INSERT ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.handle_stock_transfer_ledger();
