
-- GRN product alias/abbreviation learning table
CREATE TABLE IF NOT EXISTS grn_product_aliases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name        TEXT NOT NULL,
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  supplier_name   TEXT,
  use_count       INTEGER DEFAULT 1,
  last_used_at    TIMESTAMPTZ DEFAULT now(),
  confidence      INTEGER DEFAULT 80,
  confirmed_by    UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Fix for UNIQUE constraint with COALESCE
DO $body$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_grn_aliases_unique_raw_supplier ON grn_product_aliases (raw_name, COALESCE(supplier_name, ''));
EXCEPTION WHEN OTHERS THEN NULL; END $body$;

-- GRN approval/action log
CREATE TABLE IF NOT EXISTS grn_approval_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id          UUID REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  action          TEXT NOT NULL CHECK (action IN ('submitted','approved','rejected','posted','reversed')),
  performed_by    UUID REFERENCES auth.users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes
DO $body$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_grn_aliases_raw_name ON grn_product_aliases(lower(raw_name));
EXCEPTION WHEN OTHERS THEN NULL; END $body$;

DO $body$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_grn_aliases_supplier ON grn_product_aliases(supplier_name);
EXCEPTION WHEN OTHERS THEN NULL; END $body$;

-- Ensure purchase_invoice_items exists (it might have been dropped in cleanup)
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id),
  quantity            NUMERIC(10,2) NOT NULL,
  unit_cost           NUMERIC(10,2) NOT NULL,
  pack_type           TEXT,
  units_per_packet    INTEGER,
  packets_per_case    INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $body$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_grn ON purchase_invoice_items(purchase_invoice_id);
EXCEPTION WHEN OTHERS THEN NULL; END $body$;

-- RLS
ALTER TABLE grn_product_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_approval_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;

-- Policies for purchase_invoice_items
DROP POLICY IF EXISTS "read_pi_items" ON purchase_invoice_items;
CREATE POLICY "read_pi_items" ON purchase_invoice_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "write_pi_items" ON purchase_invoice_items;
CREATE POLICY "write_pi_items" ON purchase_invoice_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner')));

DROP POLICY IF EXISTS "read_grn_aliases" ON grn_product_aliases;
CREATE POLICY "read_grn_aliases" ON grn_product_aliases FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "write_grn_aliases" ON grn_product_aliases;
CREATE POLICY "write_grn_aliases" ON grn_product_aliases FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner')));

DROP POLICY IF EXISTS "read_grn_log" ON grn_approval_log;
CREATE POLICY "read_grn_log" ON grn_approval_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "write_grn_log" ON grn_approval_log;
CREATE POLICY "write_grn_log" ON grn_approval_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin','owner')));
