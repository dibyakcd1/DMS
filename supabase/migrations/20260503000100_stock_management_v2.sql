
-- Add status to purchase_invoices
DO $body$ BEGIN
  ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'posted'));
EXCEPTION WHEN OTHERS THEN NULL; END $body$;

-- Table for manual stock adjustments
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_id        UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  adjustment_qty  NUMERIC(10,2) NOT NULL, -- negative for deduction, positive for addition
  reason          TEXT NOT NULL CHECK (reason IN ('damage', 'wastage', 'sample', 'variance', 'return_to_supplier')),
  notes           TEXT,
  performed_by    UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Table for inter-batch transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  from_batch_id   UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  to_batch_id     UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  quantity        NUMERIC(10,2) NOT NULL,
  notes           TEXT,
  performed_by    UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "read_adjustments" ON stock_adjustments;
CREATE POLICY "read_adjustments" ON stock_adjustments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "write_adjustments" ON stock_adjustments;
CREATE POLICY "write_adjustments" ON stock_adjustments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner')));

DROP POLICY IF EXISTS "read_transfers" ON stock_transfers;
CREATE POLICY "read_transfers" ON stock_transfers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "write_transfers" ON stock_transfers;
CREATE POLICY "write_transfers" ON stock_transfers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner')));

-- Update inventory_batches to allow linking to a purchase_invoice_id if it's not already there
-- (It is already there according to types.ts: purchase_invoice_id: string | null)

-- Update existing table if it exists
DO $body$ BEGIN
  ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS expiry_date DATE;
  ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS mfg_date DATE;
EXCEPTION WHEN OTHERS THEN NULL; END $body$;

-- Function to handle adjustment trigger
CREATE OR REPLACE FUNCTION handle_stock_adjustment()
RETURNS TRIGGER AS $body$
BEGIN
  UPDATE inventory_batches 
  SET remaining_qty = remaining_qty + NEW.adjustment_qty
  WHERE id = NEW.batch_id;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_adjustment ON stock_adjustments;
CREATE TRIGGER trg_stock_adjustment
AFTER INSERT ON stock_adjustments
FOR EACH ROW EXECUTE FUNCTION handle_stock_adjustment();

-- Function to handle transfer trigger
CREATE OR REPLACE FUNCTION handle_stock_transfer()
RETURNS TRIGGER AS $body$
BEGIN
  -- Deduct from source
  UPDATE inventory_batches 
  SET remaining_qty = remaining_qty - NEW.quantity
  WHERE id = NEW.from_batch_id;
  
  -- Add to destination
  UPDATE inventory_batches 
  SET remaining_qty = remaining_qty + NEW.quantity
  WHERE id = NEW.to_batch_id;
  
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_transfer ON stock_transfers;
CREATE TRIGGER trg_stock_transfer
AFTER INSERT ON stock_transfers
FOR EACH ROW EXECUTE FUNCTION handle_stock_transfer();
