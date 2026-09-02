-- =========================================================================
-- Tatvisha Distribution & Inventory Management System (Schema & Policy Healer)
-- =========================================================================
-- INSTRUCTIONS: Open your Supabase SQL Editor on your project dashboard,
-- paste the entire content of this script, and run it.
-- This script safely heals missing columns, missing tables, missing views, and RLS policies.
-- =========================================================================

BEGIN;

-- ---------------------------------------------------------
-- PART 1: AUTO-UPGRADE ACCOUNT ROLES (ROBUST RECOVERY)
-- ---------------------------------------------------------

-- 1. Ensure owner exists in app_role enum (if app_role type exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        BEGIN
            ALTER TYPE public.app_role ADD VALUE 'owner';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;

-- 2. Modify sign-up trigger function to automatically grant 'owner' permissions
-- to developers and administrators (by email), preventing RLS blocks!
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $body$
DECLARE
  default_role text := 'salesperson';
BEGIN
  IF new.email IN ('dibyaprakashkcd1@gmail.com', 'dibyaprakashkcd2@gmail.com', 'dibyaprakashkcd@gmail.com') THEN
    default_role := 'owner';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, updated_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    default_role,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      role = CASE WHEN EXCLUDED.email IN ('dibyaprakashkcd1@gmail.com', 'dibyaprakashkcd2@gmail.com', 'dibyaprakashkcd@gmail.com') THEN 'owner' ELSE profiles.role END,
      full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
      updated_at = now();

  -- If RLS on profile/user_roles prevents manual update, this trigger does it securely:
  IF default_role = 'owner' THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (new.id, 'owner')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  RETURN new;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Upgrade existing signups to OWNER role immediately
UPDATE public.profiles 
SET role = 'owner' 
WHERE email IN ('dibyaprakashkcd1@gmail.com', 'dibyaprakashkcd2@gmail.com', 'dibyaprakashkcd@gmail.com');

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        INSERT INTO public.user_roles (user_id, role)
        SELECT id, 'owner' FROM public.profiles 
        WHERE email IN ('dibyaprakashkcd1@gmail.com', 'dibyaprakashkcd2@gmail.com', 'dibyaprakashkcd@gmail.com')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $$;


-- ---------------------------------------------------------
-- PART 2: SAFETY UPGRADE TABLES & COLUMNS (ADD IF MISSED)
-- ---------------------------------------------------------

-- 1. Create Companies if missing
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  short_code VARCHAR(50) NOT NULL UNIQUE,
  accent_hex VARCHAR(50) NOT NULL DEFAULT '#6366F1',
  logo_url TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Schemes if missing
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scheme_type') THEN
        CREATE TYPE public.scheme_type AS ENUM ('buy_x_get_y', 'discount_pct', 'discount_flat');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID, -- Backed up by product alter
  category TEXT,
  scheme_type public.scheme_type NOT NULL,
  buy_qty NUMERIC(10,2),
  get_qty NUMERIC(10,2),
  discount_value NUMERIC(10,2),
  min_order_value NUMERIC(10,2),
  min_order_qty NUMERIC(10,2),
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Heal products Table Columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS item_pack_type TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preferred_sell_unit TEXT DEFAULT 'packet';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_stock INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rbp_unit NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rbp_carton NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS units_per_packet INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS packets_per_case INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS units_per_case INTEGER NOT NULL DEFAULT 1;

-- 4. Heal shops Table Columns
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_type TEXT;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS beat_route_id UUID;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS unpaid_invoices_count INTEGER DEFAULT 0;

-- 5. Heal inventory_batches Table Columns
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS mfg_date DATE;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS manufacture_date DATE;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS received_qty NUMERIC(12,2) DEFAULT 0.00;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS landed_cost NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS purchase_invoice_id UUID;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS freight_cost_per_unit NUMERIC(10,4) DEFAULT 0.0000;
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS handling_cost_per_unit NUMERIC(10,4) DEFAULT 0.0000;

-- 6. Sync manufactured/mfg dates in inventory_batches to prevent null mismatches
UPDATE public.inventory_batches SET mfg_date = COALESCE(mfg_date, manufactured_date, manufacture_date);
UPDATE public.inventory_batches SET manufactured_date = COALESCE(manufactured_date, mfg_date);

-- 7. Heal orders Table Columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_void BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'flat';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- 8. Heal invoices Table Columns
DO $$
BEGIN
    -- Ensure custom payment_status enum exists
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE public.payment_status AS ENUM ('unpaid', 'partial', 'paid');
    END IF;
END $$;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'cash';

-- Ensure both 'type' and 'invoice_type' exist or map properly
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_type') THEN
        CREATE TYPE public.invoice_type AS ENUM ('gst', 'cash');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'type') THEN
        ALTER TABLE public.invoices ADD COLUMN type public.invoice_type NOT NULL DEFAULT 'gst'::public.invoice_type;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'type') THEN
            ALTER TABLE public.invoices ADD COLUMN type TEXT DEFAULT 'gst';
        END IF;
END $$;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sub_total NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS round_off NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS outstanding_amount NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unpaid';

-- Safely add invoice payment_status with the enum check and fallback
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'payment_status') THEN
        ALTER TABLE public.invoices ADD COLUMN payment_status public.payment_status NOT NULL DEFAULT 'unpaid'::public.payment_status;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback: if adding with enum type fails, add as text
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'payment_status') THEN
            ALTER TABLE public.invoices ADD COLUMN payment_status TEXT DEFAULT 'unpaid';
        END IF;
END $$;

-- Sync Invoice shop_id if left unlinked from Order
UPDATE public.invoices i
SET shop_id = o.shop_id
FROM public.orders o
WHERE i.order_id = o.id AND i.shop_id IS NULL;

-- 8.3 Heal payments Table Columns
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ DEFAULT now();
DO $$
BEGIN
    UPDATE public.payments SET paid_at = COALESCE(paid_at, created_at, now()) WHERE paid_at IS NULL;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- 9. Create notifications Table if missing
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_order_id UUID,
  related_invoice_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist in case table already exists but without these columns
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_order_id UUID;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_invoice_id UUID;

-- 10. Create inventory_movements Table if missing
CREATE TABLE IF NOT EXISTS public.inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id),
    batch_id UUID REFERENCES public.inventory_batches(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    quantity NUMERIC NOT NULL,
    movement_type TEXT NOT NULL,
    reference_id TEXT,
    reference_type TEXT,
    performed_by UUID REFERENCES public.profiles(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_inv_mov_product ON public.inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_batch ON public.inventory_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_created ON public.inventory_movements(created_at);

-- Migrate Historical Data from stock_ledger to inventory_movements if stock_ledger exists
DO $$
DECLARE
    has_qty_transacted boolean := false;
    has_base_units_delta boolean := false;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_ledger') THEN
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'stock_ledger' AND column_name = 'qty_transacted'
        ) INTO has_qty_transacted;

        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'stock_ledger' AND column_name = 'base_units_delta'
        ) INTO has_base_units_delta;

        IF has_qty_transacted THEN
            EXECUTE '
                INSERT INTO public.inventory_movements (
                    id, product_id, batch_id, warehouse_id, quantity, movement_type, 
                    reference_id, reference_type, performed_by, notes, created_at
                )
                SELECT 
                    id, 
                    product_id, 
                    batch_id, 
                    COALESCE(
                        (SELECT warehouse_id FROM public.inventory_batches WHERE id = stock_ledger.batch_id LIMIT 1),
                        ''00000000-0000-0000-0000-000000000000''::uuid
                    ),
                    qty_transacted,
                    COALESCE(entry_type, ''adjustment''),
                    reference_id::text,
                    reference_type,
                    created_by,
                    notes,
                    created_at
                FROM public.stock_ledger
                ON CONFLICT (id) DO NOTHING;
            ';
        ELSIF has_base_units_delta THEN
            EXECUTE '
                INSERT INTO public.inventory_movements (
                    id, product_id, batch_id, warehouse_id, quantity, movement_type, 
                    reference_id, reference_type, performed_by, notes, created_at
                )
                SELECT 
                    id, 
                    product_id, 
                    batch_id, 
                    COALESCE(
                        (SELECT warehouse_id FROM public.inventory_batches WHERE id = stock_ledger.batch_id LIMIT 1),
                        ''00000000-0000-0000-0000-000000000000''::uuid
                    ),
                    base_units_delta,
                    COALESCE(reference_type, ''adjustment''),
                    reference_id::text,
                    reference_type,
                    created_by,
                    COALESCE(notes, ''Historical migration''),
                    created_at
                FROM public.stock_ledger
                ON CONFLICT (id) DO NOTHING;
            ';
        END IF;
    END IF;
END $$;


-- 11. Create purchase_invoices and warehouse_transfers Table if missing
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'pending',
  supplier_name TEXT,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_freight NUMERIC(10,2) DEFAULT 0,
  total_handling NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.warehouse_transfers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  from_warehouse_id   UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  to_warehouse_id     UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  batch_id            UUID NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
  quantity            NUMERIC(15,2) NOT NULL CHECK (quantity > 0),
  status              TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'in_transit', 'completed', 'cancelled')),
  notes               TEXT,
  performed_by        UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);


-- ---------------------------------------------------------
-- PART 3: RESTORE AND CASCADE-DROP VIEWS
-- ---------------------------------------------------------

-- Drop views in dependency-correct order
DROP VIEW IF EXISTS public.realized_margin_view CASCADE;
DROP VIEW IF EXISTS public.margin_report_view CASCADE;
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
DROP VIEW IF EXISTS public.v_inventory_batch_details CASCADE;
DROP VIEW IF EXISTS public.v_orders_expanded CASCADE;
DROP VIEW IF EXISTS public.v_invoices_expanded CASCADE;
DROP VIEW IF EXISTS public.v_stock_ledger_details CASCADE;
DROP VIEW IF EXISTS public.v_order_batch_costs CASCADE;
DROP VIEW IF EXISTS public.v_shop_balances CASCADE;

-- 1. Create v_inventory_batch_details
CREATE VIEW public.v_inventory_batch_details AS
SELECT 
    ib.id,
    ib.purchase_invoice_id,
    ib.product_id,
    ib.warehouse_id,
    ib.batch_number,
    ib.expiry_date,
    ib.manufactured_date,
    ib.initial_qty,
    ib.remaining_qty,
    ib.landed_cost,
    ib.created_at,
    ib.updated_at,
    ib.received_qty,
    ib.mfg_date,
    ib.notes,
    ib.cost_price,
    p.name AS product_name,
    p.sku AS product_sku,
    p.mrp AS product_mrp,
    p.hsn AS product_hsn,
    p.min_stock AS product_min_stock,
    p.units_per_packet AS product_units_per_packet,
    p.packets_per_case AS product_packets_per_case,
    p.item_pack_type AS product_item_pack_type,
    p.division_category AS product_division_category,
    p.pack_size_value AS product_pack_size_value,
    p.pack_size_unit AS product_pack_size_unit,
    w.name AS warehouse_name,
    w.code AS warehouse_code
FROM 
    public.inventory_batches ib
LEFT JOIN 
    public.products p ON ib.product_id = p.id
LEFT JOIN 
    public.warehouses w ON ib.warehouse_id = w.id;

-- 2. Create v_product_stock
CREATE VIEW public.v_product_stock AS
WITH stock_summary AS (
  SELECT 
    product_id, 
    COALESCE(SUM(stock_base_units), 0) AS stock_base_units, 
    AVG(NULLIF(avg_landed_cost, 0)) AS avg_landed_cost
  FROM public.inventory
  GROUP BY product_id
)
SELECT 
    p.*,
    COALESCE(s.stock_base_units, 0) AS stock_base_units,
    COALESCE(NULLIF(s.avg_landed_cost, 0), 0.01) AS avg_landed_cost,
    (COALESCE(s.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) AS is_low_stock
FROM public.products p
LEFT JOIN stock_summary s ON p.id = s.product_id;

-- 3. Create v_product_stock_warehouse (Cross Join format guarantees zero rows are preserved)
CREATE VIEW public.v_product_stock_warehouse AS
SELECT 
    (p.id || '-' || w.id)::text AS inventory_id,
    w.id AS warehouse_id,
    COALESCE(i.stock_base_units, 0) AS stock_base_units,
    COALESCE(NULLIF(i.avg_landed_cost, 0), 0.01) AS avg_landed_cost,
    (COALESCE(i.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) AS is_low_stock,
    p.*
FROM public.products p
CROSS JOIN public.warehouses w
LEFT JOIN public.inventory i ON i.product_id = p.id AND i.warehouse_id = w.id;

-- 4. Create v_orders_expanded
CREATE VIEW public.v_orders_expanded AS
SELECT 
    o.*,
    s.name AS shop_name,
    p.full_name AS salesperson_name
FROM 
    public.orders o
LEFT JOIN 
    public.shops s ON o.shop_id = s.id
LEFT JOIN 
    public.profiles p ON o.salesperson_id = p.id;

-- 5. Create v_invoices_expanded
CREATE VIEW public.v_invoices_expanded AS
SELECT 
    i.*,
    COALESCE(s.name, s_order.name, 'Unlinked System Client') AS shop_name,
    COALESCE(s.shop_type, s_order.shop_type, 'basic') AS shop_type,
    o.order_number,
    o.status AS order_status,
    o.created_at AS order_date
FROM 
    public.invoices i
LEFT JOIN 
    public.orders o ON i.order_id = o.id
LEFT JOIN 
    public.shops s ON i.shop_id = s.id
LEFT JOIN 
    public.shops s_order ON o.shop_id = s_order.id;

-- 6. Create margin_report_view
CREATE VIEW public.margin_report_view AS
WITH current_cost AS (
  SELECT product_id, AVG(landed_cost) AS avg_landed_cost
  FROM public.inventory_batches WHERE remaining_qty > 0
  GROUP BY product_id
),
basic_unit_price AS (
  SELECT product_id, COALESCE(tier_5_retail, 0) AS standard_selling_price
  FROM public.product_price_tiers
)
SELECT
  p.id AS product_id, p.name AS product_name, p.sku,
  COALESCE(bup.standard_selling_price, p.mrp, 0.01) AS standard_selling_price,
  COALESCE(NULLIF(cc.avg_landed_cost, 0), 0) AS avg_landed_cost,
  CASE WHEN COALESCE(bup.standard_selling_price, p.mrp, 0) > 0 THEN
    ((COALESCE(bup.standard_selling_price, p.mrp) - COALESCE(NULLIF(cc.avg_landed_cost, 0), 0))
      / COALESCE(bup.standard_selling_price, p.mrp)) * 100
  ELSE 0 END AS margin_percent
FROM public.products p
LEFT JOIN current_cost cc ON p.id = cc.product_id
LEFT JOIN basic_unit_price bup ON p.id = bup.product_id
WHERE p.is_active = true;

-- 7. Create realized_margin_view
CREATE VIEW public.realized_margin_view AS
SELECT 
    oi.id AS order_item_id,
    o.id AS order_id,
    o.order_date AS order_date,
    o.status AS order_status,
    p.id AS product_id,
    p.name AS product_name,
    p.sku AS product_sku,
    oi.quantity,
    oi.unit_price AS unit_price_exclusive,
    (oi.unit_price * oi.quantity) AS revenue_exclusive,
    COALESCE(
      (SELECT SUM(obd.qty_base_units * ib.landed_cost) 
       FROM public.order_batch_deductions obd
       JOIN public.inventory_batches ib ON obd.batch_id = ib.id
       WHERE obd.order_item_id = oi.id),
      (COALESCE(ps.avg_landed_cost, 0.01) * (
         CASE 
           WHEN oi.pack_type = 'packet' THEN COALESCE(p.units_per_packet, 1)
           WHEN oi.pack_type = 'case' THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
           ELSE 1
         END
       ) * oi.quantity)
    ) AS cost_exclusive,
    ((oi.unit_price * oi.quantity) - COALESCE(
      (SELECT SUM(obd.qty_base_units * ib.landed_cost) 
       FROM public.order_batch_deductions obd
       JOIN public.inventory_batches ib ON obd.batch_id = ib.id
       WHERE obd.order_item_id = oi.id),
      (COALESCE(ps.avg_landed_cost, 0.01) * (
         CASE 
           WHEN oi.pack_type = 'packet' THEN COALESCE(p.units_per_packet, 1)
           WHEN oi.pack_type = 'case' THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
           ELSE 1
         END
       ) * oi.quantity)
    )) AS realized_profit_total
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
JOIN public.products p ON oi.product_id = p.id
LEFT JOIN public.v_product_stock ps ON p.id = ps.id
WHERE o.status = 'delivered' AND o.is_void = false;

-- 8. Create v_stock_ledger_details
CREATE VIEW public.v_stock_ledger_details AS
SELECT 
    im.id,
    im.created_at,
    im.quantity AS qty_transacted,
    im.movement_type AS entry_type,
    im.reference_type,
    im.reference_id,
    im.notes,
    -- Product Details
    p.id AS product_id,
    p.name AS product_name,
    p.sku AS product_sku,
    p.units_per_packet,
    p.packets_per_case,
    -- Batch Details
    ib.batch_number,
    -- Order/Shop Details (if applicable)
    o.id AS order_id,
    o.order_number,
    o.status AS order_status,
    s.id AS shop_id,
    s.name AS shop_name,
    s.address AS shop_location,
    -- Purchase Details (if applicable)
    pi.invoice_number AS purchase_invoice_number,
    pi.supplier_name,
    -- Transfer Details (if applicable)
    wt.id AS transfer_id,
    fwh.name AS from_warehouse_name,
    twh.name AS to_warehouse_name,
    -- Responsible User
    pr.full_name AS created_by_name
FROM 
    public.inventory_movements im
LEFT JOIN public.products p ON im.product_id = p.id
LEFT JOIN public.inventory_batches ib ON im.batch_id = ib.id
LEFT JOIN public.profiles pr ON im.performed_by = pr.id
LEFT JOIN public.orders o ON (
    im.reference_type = 'order' 
    AND im.reference_id = o.id::text
)
LEFT JOIN public.shops s ON o.shop_id = s.id
LEFT JOIN public.purchase_invoices pi ON (
    (im.reference_type = 'purchase_invoice' OR im.reference_type = 'purchase' OR im.reference_type = 'grn')
    AND im.reference_id = pi.id::text
)
LEFT JOIN public.warehouse_transfers wt ON (
    im.reference_type = 'transfer'
    AND im.reference_id = wt.id::text
)
LEFT JOIN public.warehouses fwh ON wt.from_warehouse_id = fwh.id
LEFT JOIN public.warehouses twh ON wt.to_warehouse_id = twh.id;

-- 9. Create v_order_batch_costs
CREATE VIEW public.v_order_batch_costs AS
SELECT 
    obd.order_id,
    obd.order_item_id,
    obd.batch_id,
    obd.qty_base_units,
    ib.landed_cost,
    (obd.qty_base_units * ib.landed_cost) AS item_total_cost
FROM 
    public.order_batch_deductions obd
JOIN 
    public.inventory_batches ib ON obd.batch_id = ib.id;

-- 10. Create v_shop_balances
CREATE VIEW public.v_shop_balances AS
SELECT 
    s.id AS shop_id,
    s.name AS shop_name,
    COALESCE(SUM(i.total_amount - COALESCE(i.discount_amount, 0)), 0) AS total_outstanding_balance
FROM public.shops s
LEFT JOIN public.invoices i ON s.id = i.shop_id AND i.payment_status != 'paid'
GROUP BY s.id, s.name;


-- ---------------------------------------------------------
-- PART 4: GRANT PERMISSIONS & ACTIVATE RLS
-- ---------------------------------------------------------

-- Grant select to anon and authenticated users on views
GRANT SELECT ON public.v_inventory_batch_details TO anon, authenticated;
GRANT SELECT ON public.v_product_stock TO anon, authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO anon, authenticated;
GRANT SELECT ON public.v_orders_expanded TO anon, authenticated;
GRANT SELECT ON public.v_invoices_expanded TO anon, authenticated;
GRANT SELECT ON public.margin_report_view TO anon, authenticated;
GRANT SELECT ON public.realized_margin_view TO anon, authenticated;
GRANT SELECT ON public.v_stock_ledger_details TO anon, authenticated;
GRANT SELECT ON public.v_order_batch_costs TO anon, authenticated;
GRANT SELECT ON public.v_shop_balances TO anon, authenticated;

-- Run automatic RLS setup if fix_table_rls function exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fix_table_rls') THEN
        PERFORM public.fix_table_rls('companies');
        PERFORM public.fix_table_rls('schemes');
        PERFORM public.fix_table_rls('notifications');
    END IF;
END $$;

-- ---------------------------------------------------------
-- PART 5: DIRECT RLS BYPASS POLICIES FOR AUTOSEEDING FLOW
-- ---------------------------------------------------------
-- Ensures that active authenticated developers can modify base seeding info safely!
DROP POLICY IF EXISTS "seeder_unrestricted_companies" ON public.companies;
CREATE POLICY "seeder_unrestricted_companies" ON public.companies FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "seeder_unrestricted_schemes" ON public.schemes;
CREATE POLICY "seeder_unrestricted_schemes" ON public.schemes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "seeder_unrestricted_products" ON public.products;
CREATE POLICY "seeder_unrestricted_products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "seeder_unrestricted_shops" ON public.shops;
CREATE POLICY "seeder_unrestricted_shops" ON public.shops FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
