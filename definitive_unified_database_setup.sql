-- ============================================================================
-- BHARAT MASALA — DEFINITIVE UNIFIED DATABASE SETUP SCRIPT
-- ============================================================================
-- This script contains the complete, unified database schema, indices, 
-- constraints, RLS policies, custom helper functions, and database triggers 
-- required to power every screen and workflow in the Bharat Masala ERP app.
--
-- This script is completely safe to run in Supabase on either a blank database 
-- or a database that already has tables (idempotent setup).
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS & PREREQUISITES
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 2. CUSTOM TYPES & ENUMS (Safe creation via DO blocks)
-- ============================================================================
DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE public.order_status AS ENUM ('draft', 'pending_approval', 'approved', 'dispatched', 'delivered');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE public.payment_status AS ENUM ('pending', 'partial', 'paid');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE public.payment_method AS ENUM ('cash', 'cheque', 'bank_transfer', 'upi');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pack_type') THEN
    CREATE TYPE public.pack_type AS ENUM ('unit', 'packet', 'case', 'box', 'bag', 'jar', 'tin', 'bottle', 'pouches', 'cartoon', 'pouch');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_type') THEN
    CREATE TYPE public.unit_type AS ENUM ('pieces', 'weight', 'kg_g');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scheme_type') THEN
    CREATE TYPE public.scheme_type AS ENUM ('buy_x_get_y', 'discount_pct', 'discount_flat');
  END IF;
END;
$body$;

-- ============================================================================
-- 3. CORE SCHEMAS & TABLES
-- ============================================================================

-- 3.1. Warehouses Table
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.1.b. FMCG Companies Table
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_code text UNIQUE NOT NULL,
  accent_hex text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_sort_order ON public.companies(sort_order);

-- 3.2. User Profiles Table (Synchronized with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text,
  phone text,
  role text NOT NULL DEFAULT 'salesperson' CHECK (role IN ('owner', 'admin', 'manager', 'salesperson', 'staff')),
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.3. Shops Table (B2B Outlets / Retail Customers)
CREATE TABLE IF NOT EXISTS public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_name text,
  phone text,
  email text,
  address text,
  credit_limit numeric(12,2) NOT NULL DEFAULT 50000.00,
  balance numeric(12,2) NOT NULL DEFAULT 0.00,
  unpaid_invoices_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.4. Products Table (Master Item Catalog)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text NOT NULL UNIQUE,
  hsn text,
  mrp numeric(10,2) NOT NULL DEFAULT 0.00,
  rbp_unit numeric(10,2) NOT NULL DEFAULT 0.00, -- Retail Buying Price for Unit
  rbp_carton numeric(10,2) NOT NULL DEFAULT 0.00, -- Retail Buying Price for Carton
  units_per_packet integer DEFAULT 1,
  packets_per_case integer DEFAULT 1,
  units_per_case integer DEFAULT 1,
  weight_per_unit_grams numeric(10,2) DEFAULT 0.00,
  selling_price numeric(10,2) NOT NULL DEFAULT 0.00,
  brand text DEFAULT 'Bharat Masala',
  division_category text CHECK (division_category IN ('BASIC SPICES', 'BLENDED SPICES', 'WHOLE SPICES', 'SPECIAL PRODUCTS', 'Uncategorized')),
  pack_category text CHECK (pack_category IN ('BOX', 'POUCH', 'JAR', 'BAG', 'TIN', 'ACB', 'BOTTLE')),
  pack_size_value numeric(10,2) DEFAULT 0.00,
  pack_size_unit text DEFAULT 'gms',
  unit text NOT NULL DEFAULT 'case',
  unit_type public.unit_type NOT NULL DEFAULT 'pieces',
  is_active boolean NOT NULL DEFAULT true,
  min_stock numeric(10,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.5. Five-Tier Price Groups / Product Price Tiers
CREATE TABLE IF NOT EXISTS public.product_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tier_1_distributor numeric(10,2) NOT NULL DEFAULT 0.00, -- Tier 1 MRP Discount
  tier_2_super_stockist numeric(10,2) NOT NULL DEFAULT 0.00, -- Tier 2
  tier_3_sub_stockist numeric(10,2) NOT NULL DEFAULT 0.00, -- Tier 3
  tier_4_wholesale numeric(10,2) NOT NULL DEFAULT 0.00, -- Tier 4
  tier_5_retail numeric(10,2) NOT NULL DEFAULT 0.00, -- Tier 5 Custom Retail Pricing
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_product_price_tier UNIQUE(product_id)
);

-- 3.6. Schemes & Promotions Table
CREATE TABLE IF NOT EXISTS public.schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  category text, -- maps to products.division_category or pack_category
  scheme_type public.scheme_type NOT NULL,
  buy_qty numeric(10,2),
  get_qty numeric(10,2),
  discount_value numeric(10,2),
  min_order_value numeric(10,2),
  min_order_qty numeric(10,2),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schemes_company_id ON public.schemes(company_id);
CREATE INDEX IF NOT EXISTS idx_schemes_product_id ON public.schemes(product_id);

-- 3.7. Purchase Invoices Table (Goods Received Note Header)
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier_name text NOT NULL,
  total_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  is_void boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.8. Inventory Batches Table (Tracks separate production lots with Expiry check - FIFO support)
CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  expiry_date date NOT NULL,
  manufactured_date date,
  initial_qty numeric(12,2) NOT NULL CHECK (initial_qty >= 0),
  remaining_qty numeric(12,2) NOT NULL CHECK (remaining_qty >= 0),
  landed_cost numeric(10,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.9. Inventory Aggregates Table (Synthesized stock cache per product/warehouse)
CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  stock_base_units numeric(12,2) NOT NULL DEFAULT 0.00,
  avg_landed_cost numeric(10,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_product_warehouse UNIQUE (product_id, warehouse_id)
);

-- 3.10. Stock Ledger Table (Audit trail of every single unit added/deducted)
CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  qty_change numeric(12,2) NOT NULL,
  type text NOT NULL CHECK (type IN ('inward', 'sale', 'transfer_in', 'transfer_out', 'audit_reconciliation', 'reversal', 'return')),
  reference_id text NOT NULL,
  reference_type text NOT NULL CHECK (reference_type IN ('grn', 'order', 'stock_transfer', 'audit', 'reversal', 'return', 'manual')),
  performed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.11. Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  salesperson_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  status public.order_status NOT NULL DEFAULT 'draft',
  subtotal numeric(12,2) NOT NULL DEFAULT 0.00,
  gst_total numeric(12,2) NOT NULL DEFAULT 0.00,
  total numeric(12,2) NOT NULL DEFAULT 0.00,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  discount_type text DEFAULT 'flat' CHECK (discount_type IN ('flat', 'percentage')),
  notes text,
  order_date timestamptz NOT NULL DEFAULT now(),
  is_over_limit boolean NOT NULL DEFAULT false,
  is_void boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  delivered_at timestamptz
);

-- Trigger to safely generate order_number (bypassing immutable column constraints)
CREATE OR REPLACE FUNCTION public.fn_generate_order_number()
RETURNS trigger AS $body$
BEGIN
  NEW.id := COALESCE(NEW.id, gen_random_uuid());
  NEW.created_at := COALESCE(NEW.created_at, now());
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'ORD-' || to_char(NEW.created_at, 'YYYYMMDD') || '-' || substring(md5(NEW.id::text) from 1 for 5);
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_order_number ON public.orders;
CREATE TRIGGER tr_generate_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fn_generate_order_number();

-- 3.12. Order Items Table
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL CHECK (unit_price >= 0),
  gst_rate numeric(5,2) NOT NULL DEFAULT 0.00,
  pack_type public.pack_type NOT NULL DEFAULT 'case',
  line_total numeric(12,2) NOT NULL DEFAULT 0.00,
  line_total_tax_exclusive numeric(12,2) NOT NULL DEFAULT 0.00,
  line_tax_amount numeric(12,2) NOT NULL DEFAULT 0.00,
  batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.13. Order Batch Deductions Map (Tracks exactly which lot was consumed per order Dispatch)
CREATE TABLE IF NOT EXISTS public.order_batch_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  qty_base_units numeric(12,2) NOT NULL CHECK (qty_base_units > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.14. Invoices Table (Handles Billing - Cash and Credit lines)
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.payment_status NOT NULL DEFAULT 'pending',
  total numeric(12,2) NOT NULL DEFAULT 0.00,
  amount_paid numeric(12,2) NOT NULL DEFAULT 0.00,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  is_void boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to safely generate invoice_number (bypassing immutable column constraints)
CREATE OR REPLACE FUNCTION public.fn_generate_invoice_number()
RETURNS trigger AS $body$
BEGIN
  NEW.id := COALESCE(NEW.id, gen_random_uuid());
  NEW.created_at := COALESCE(NEW.created_at, now());
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || to_char(NEW.created_at, 'YYYYMMDD') || '-' || substring(md5(NEW.id::text) from 1 for 5);
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_invoice_number ON public.invoices;
CREATE TRIGGER tr_generate_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_generate_invoice_number();

-- 3.15. Direct Settlements / Shared Collections Table (Aesthetic multi-invoice payments)
CREATE TABLE IF NOT EXISTS public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  salesperson_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  collected_at timestamptz NOT NULL DEFAULT now(),
  is_void boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger to safely generate collection_code (bypassing immutable column constraints)
CREATE OR REPLACE FUNCTION public.fn_generate_collection_code()
RETURNS trigger AS $body$
BEGIN
  NEW.id := COALESCE(NEW.id, gen_random_uuid());
  NEW.created_at := COALESCE(NEW.created_at, now());
  IF NEW.code IS NULL THEN
    NEW.code := 'COL-' || to_char(NEW.created_at, 'YYYYMMDD') || '-' || substring(md5(NEW.id::text) from 1 for 4);
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_collection_code ON public.collections;
CREATE TRIGGER tr_generate_collection_code
BEFORE INSERT ON public.collections
FOR EACH ROW EXECUTE FUNCTION public.fn_generate_collection_code();

-- 3.16. Payments Table (Binds receipts to invoices)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  collection_id uuid REFERENCES public.collections(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  notes text,
  is_void boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.17. Security Pins Table (Secure staff logins using pgcrypt hashes)
CREATE TABLE IF NOT EXISTS public.salesperson_pins (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  failed_attempts integer NOT NULL DEFAULT 0,
  lockout_until timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.18. Salesperson Active Sessions Table
CREATE TABLE IF NOT EXISTS public.salesperson_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.19. Audited Order Reversals Table
CREATE TABLE IF NOT EXISTS public.order_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  reverted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  previous_status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.20. Warehouses stock Audits Table
CREATE TABLE IF NOT EXISTS public.stock_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  auditor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'cancelled')),
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 3.21. stock Audit Lines
CREATE TABLE IF NOT EXISTS public.stock_audit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid NOT NULL REFERENCES public.stock_audits(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  expected_qty numeric(12,2) NOT NULL DEFAULT 0.00,
  actual_qty numeric(12,2) NOT NULL DEFAULT 0.00,
  reconciliation_qty numeric(12,2) NOT NULL DEFAULT 0.00,
  notes text
);

-- 3.22. Warehouse stock Transfers Table
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  target_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  transfer_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'shipped', 'received', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  shipped_at timestamptz,
  received_at timestamptz
);

-- Trigger to safely generate transfer_number (bypassing immutable column constraints)
CREATE OR REPLACE FUNCTION public.fn_generate_transfer_number()
RETURNS trigger AS $body$
BEGIN
  NEW.id := COALESCE(NEW.id, gen_random_uuid());
  NEW.created_at := COALESCE(NEW.created_at, now());
  IF NEW.transfer_number IS NULL THEN
    NEW.transfer_number := 'XFER-' || to_char(NEW.created_at, 'YYYYMMDD') || '-' || substring(md5(NEW.id::text) from 1 for 4);
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_transfer_number ON public.stock_transfers;
CREATE TRIGGER tr_generate_transfer_number
BEFORE INSERT ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.fn_generate_transfer_number();

-- 3.23. stock Transfer Lines
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  notes text
);

-- 3.24. Returns & credit Notes
CREATE TABLE IF NOT EXISTS public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric(10,2) NOT NULL CHECK (quantity > 0),
  refund_amount numeric(12,2) NOT NULL CHECK (refund_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. ANALYTICAL PERFORMANCE CACHES & SUMMARIES (For gorgeous Dashboard charts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.summary_daily_performance (
  date date PRIMARY KEY,
  revenue numeric(12,2) NOT NULL DEFAULT 0.00,
  order_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.summary_stock_summary (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  stock_base_units numeric(12,2) NOT NULL DEFAULT 0.00,
  total_value numeric(12,2) NOT NULL DEFAULT 0.00,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS public.summary_global_stats (
  key text PRIMARY KEY,
  val_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. PERFORMANCE INDEX QUICKENS
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_batches_product_warehouse ON public.inventory_batches(product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON public.inventory_batches(expiry_date ASC);
CREATE INDEX IF NOT EXISTS idx_ledger_product_warehouse ON public.stock_ledger(product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_shop ON public.orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_dispatch ON public.orders(status) WHERE status IN ('approved', 'dispatched');
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_collections_shop ON public.collections(shop_id);

-- ============================================================================
-- 6. SECURITY AUTHENTICATION RPC FUNCTIONS
-- ============================================================================

-- Function: Setup first owner safely
CREATE OR REPLACE FUNCTION public.setup_first_owner(
  p_uid uuid,
  p_email text,
  p_full_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
BEGIN
  -- 1. Insert/Update user profile
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (p_uid, p_email, p_full_name, 'owner', true)
  ON CONFLICT (id) DO UPDATE
  SET role = 'owner', full_name = p_full_name;

  -- 2. Configure default owner PIN as '1234' with crypto hashing
  INSERT INTO public.salesperson_pins (profile_id, pin_hash, is_active)
  VALUES (p_uid, crypt('1234', gen_salt('bf')), true)
  ON CONFLICT (profile_id) DO NOTHING;

  RETURN json_build_object('success', true, 'message', 'Owner configured with PIN: 1234');
END;
$body$;

-- Function: Get user metadata safely in frontend
CREATE OR REPLACE FUNCTION public.get_user_auth_data(p_uid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_uid;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No profile found.');
  END IF;

  RETURN json_build_object(
    'success', true,
    'profile', json_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'role', v_profile.role,
      'is_active', v_profile.is_active,
      'warehouse_id', v_profile.warehouse_id
    )
  );
END;
$body$;

-- Function: Unified PIN Login and verify attempts
CREATE OR REPLACE FUNCTION public.verify_staff_pin_v2(
  p_profile_id uuid,
  p_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $body$
DECLARE
  v_pin_hash       text;
  v_is_active      boolean;
  v_failed_attempts int;
  v_lockout_until  timestamptz;
  v_full_name      text;
  v_phone          text;
  v_token          text;
  v_role           text;
  v_warehouse_id   uuid;
BEGIN
  -- 1. Grab pin hash, activation state and block timers
  SELECT pin_hash, is_active, failed_attempts, lockout_until 
  INTO v_pin_hash, v_is_active, v_failed_attempts, v_lockout_until
  FROM public.salesperson_pins
  WHERE profile_id = p_profile_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No security PIN is configured for this profile.');
  END IF;

  IF NOT v_is_active THEN
    RETURN json_build_object('success', false, 'error', 'This user credentials have been deactivated');
  END IF;

  -- 2. Lockout state validation
  IF v_lockout_until IS NOT NULL AND v_lockout_until > now() THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Too many failed attempts. Device is temporarily locked.',
      'lockout_remaining_seconds', floor(extract(epoch from (v_lockout_until - now())))
    );
  END IF;

  -- 3. Verify PIN match
  IF v_pin_hash != crypt(p_pin, v_pin_hash) THEN
    -- Increment lockout counter
    UPDATE public.salesperson_pins 
    SET failed_attempts = COALESCE(v_failed_attempts, 0) + 1,
        lockout_until = CASE WHEN (COALESCE(v_failed_attempts, 0) + 1) >= 5 THEN now() + interval '15 minutes' ELSE NULL END
    WHERE profile_id = p_profile_id;

    RETURN json_build_object(
      'success', false, 
      'error', CASE WHEN (COALESCE(v_failed_attempts, 0) + 1) >= 5 THEN 'Too many attempts. Blocked for 15 minutes.' ELSE 'Incorrect login PIN.' END,
      'attempts_remaining', CASE WHEN (COALESCE(v_failed_attempts, 0) + 1) < 5 THEN 5 - (COALESCE(v_failed_attempts, 0) + 1) ELSE 0 END
    );
  END IF;

  -- 4. Re-synchronize on successful login
  UPDATE public.salesperson_pins 
  SET failed_attempts = 0, 
      lockout_until = NULL,
      last_used_at = now()
  WHERE profile_id = p_profile_id;

  SELECT full_name, phone, role, warehouse_id 
  INTO v_full_name, v_phone, v_role, v_warehouse_id 
  FROM public.profiles 
  WHERE id = p_profile_id;

  -- Generate randomized hash session token
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.salesperson_sessions (profile_id, session_token, expires_at)
  VALUES (p_profile_id, v_token, now() + interval '12 hours');

  RETURN json_build_object(
    'success', true,
    'session_token', v_token,
    'profile', json_build_object(
      'id',        p_profile_id,
      'full_name', v_full_name,
      'phone',     v_phone,
      'role',      COALESCE(v_role, 'salesperson'),
      'warehouse_id', v_warehouse_id
    )
  );
END;
$body$;

-- Backward compatibility legacy wrappers
CREATE OR REPLACE FUNCTION public.verify_staff_pin_v1(p_profile_id uuid, p_pin text)
RETURNS json LANGUAGE sql SECURITY DEFINER AS $body$
  SELECT public.verify_staff_pin_v2(p_profile_id, p_pin);
$body$;

CREATE OR REPLACE FUNCTION public.verify_salesperson_pin(p_profile_id uuid, p_pin text)
RETURNS json LANGUAGE sql SECURITY DEFINER AS $body$
  SELECT public.verify_staff_pin_v2(p_profile_id, p_pin);
$body$;

-- Session verification RPC
CREATE OR REPLACE FUNCTION public.verify_staff_session_v2(p_session_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $body$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.salesperson_sessions
    WHERE session_token = p_session_token
      AND expires_at > now()
  );
END;
$body$;

-- Set salesperson pin helper
CREATE OR REPLACE FUNCTION public.set_salesperson_pin(p_profile_id uuid, p_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
BEGIN
  INSERT INTO public.salesperson_pins (profile_id, pin_hash, is_active)
  VALUES (p_profile_id, crypt(p_pin, gen_salt('bf')), true)
  ON CONFLICT (profile_id) DO UPDATE
  SET pin_hash = crypt(p_pin, gen_salt('bf')), updated_at = now();

  RETURN json_build_object('success', true, 'message', 'PIN set successfully.');
END;
$body$;

-- ============================================================================
-- 7. PL/PGSQL STAFF & SALESPERSON DIRECTORY RESOLVERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_salesperson_list()
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  role text,
  is_pin_configured boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(p.full_name, p.email) as full_name,
    p.phone,
    p.role,
    EXISTS (SELECT 1 FROM public.salesperson_pins sp WHERE sp.profile_id = p.id) as is_pin_configured
  FROM public.profiles p
  WHERE p.is_active = true
  ORDER BY p.full_name ASC;
END;
$body$;

-- Staff directory wrapper
CREATE OR REPLACE FUNCTION public.get_staff_list_v1()
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  role text,
  is_pin_configured boolean
)
LANGUAGE sql
SECURITY DEFINER
AS $body$
  SELECT * FROM public.get_salesperson_list();
$body$;

-- ============================================================================
-- 8. INVENTORY CALCULATORS & GRN INTAKE ROUTINES
-- ============================================================================

-- Function: Multipurpose Base Unit Quantifier
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID,
  p_qty NUMERIC,
  p_unit TEXT
) RETURNS NUMERIC AS $body$
DECLARE
  v_unit_type         TEXT;
  v_units_per_packet  INTEGER;
  v_packets_per_case  INTEGER;
  v_units_per_case    INTEGER;
  v_weight_per_unit_g NUMERIC;
  v_unit              TEXT;
  v_multiplier        INTEGER;
  v_result            NUMERIC;
BEGIN
  SELECT unit_type, units_per_packet, packets_per_case, units_per_case, weight_per_unit_grams
  INTO v_unit_type, v_units_per_packet, v_packets_per_case, v_units_per_case, v_weight_per_unit_g
  FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found: %', p_product_id; END IF;

  v_unit := LOWER(TRIM(p_unit));
  v_units_per_packet := COALESCE(v_units_per_packet, 1);
  v_packets_per_case := COALESCE(v_packets_per_case, 1);
  
  -- Composite calculation logic
  v_multiplier := CASE 
    WHEN (v_units_per_packet * v_packets_per_case) > 1 THEN (v_units_per_packet * v_packets_per_case)
    ELSE COALESCE(v_units_per_case, 1)
  END;

  IF v_unit_type = 'kg_g' THEN
    IF v_weight_per_unit_g IS NOT NULL AND v_weight_per_unit_g > 0 THEN
      CASE v_unit
        WHEN 'pcs', 'unit', 'pc', 'pouch', 'sachet', 'jar', 'bottle', 'tin', 'can', 'acb' THEN v_result := p_qty;
        WHEN 'packet', 'pkt' THEN v_result := p_qty * v_units_per_packet;
        WHEN 'case', 'ctn' THEN v_result := p_qty * v_multiplier;
        WHEN 'g', 'gms'    THEN v_result := p_qty / v_weight_per_unit_g;
        WHEN 'kg'          THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
        WHEN 'ml'          THEN v_result := p_qty / v_weight_per_unit_g;
        WHEN 'ltr', 'l'    THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
        ELSE v_result := p_qty;
      END CASE;
    ELSE
      CASE v_unit
        WHEN 'g', 'gms', 'ml' THEN v_result := p_qty;
        WHEN 'kg', 'ltr', 'l' THEN v_result := p_qty * 1000.0;
        WHEN 'packet', 'pkt' THEN v_result := p_qty * v_units_per_packet;
        WHEN 'case', 'ctn' THEN v_result := p_qty * v_multiplier;
        ELSE v_result := p_qty;
      END CASE;
    END IF;
  ELSE
    CASE v_unit
      WHEN 'pcs', 'unit', 'pc' THEN v_result := p_qty;
      WHEN 'packet', 'pkt'     THEN v_result := p_qty * v_units_per_packet;
      WHEN 'case', 'ctn'       THEN v_result := p_qty * v_multiplier;
      ELSE v_result := p_qty;
    END CASE;
  END IF;

  RETURN ROUND(v_result, 4);
END;
$body$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function: Recompute single product stock sum and weighted landed cost
CREATE OR REPLACE FUNCTION public.recompute_inventory(
  _product_id UUID, 
  _warehouse_id UUID DEFAULT NULL
)
RETURNS void AS $body$
DECLARE
  v_warehouse RECORD;
  v_total_stock NUMERIC;
  v_avg_cost NUMERIC;
BEGIN
  FOR v_warehouse IN 
    SELECT id FROM public.warehouses 
    WHERE (_warehouse_id IS NULL OR id = _warehouse_id)
  LOOP
    -- Calculate stock aggregates
    SELECT COALESCE(SUM(remaining_qty), 0) INTO v_total_stock
    FROM public.inventory_batches
    WHERE product_id = _product_id AND warehouse_id = v_warehouse.id;

    -- Calculate weighted average landed cost
    SELECT COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 
                    (SELECT COALESCE(rbp_unit, 0.01) FROM public.products WHERE id = _product_id)) INTO v_avg_cost
    FROM public.inventory_batches
    WHERE product_id = _product_id AND warehouse_id = v_warehouse.id AND remaining_qty > 0;

    INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units, avg_landed_cost, updated_at)
    VALUES (_product_id, v_warehouse.id, v_total_stock, v_avg_cost, now())
    ON CONFLICT (product_id, warehouse_id) DO UPDATE
    SET stock_base_units = EXCLUDED.stock_base_units,
        avg_landed_cost = EXCLUDED.avg_landed_cost,
        updated_at = now();
  END LOOP;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Master Recompute Stock Loop
CREATE OR REPLACE FUNCTION public.recompute_all_inventory()
RETURNS void AS $body$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM public.products LOOP
    PERFORM public.recompute_inventory(p.id);
  END LOOP;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Core function: Record stock ledger movement elegantly
CREATE OR REPLACE FUNCTION public.record_inventory_movement(
  p_product_id uuid,
  p_batch_id uuid,
  p_warehouse_id uuid,
  p_qty_change numeric,
  p_type text,
  p_reference_id text,
  p_reference_type text,
  p_performed_by uuid,
  p_notes text
)
RETURNS uuid AS $body$
DECLARE
  v_ledger_id uuid;
BEGIN
  -- 1. Append transactions to history ledger
  INSERT INTO public.stock_ledger (
    product_id, batch_id, warehouse_id, qty_change, 
    type, reference_id, reference_type, performed_by, notes
  ) VALUES (
    p_product_id, p_batch_id, p_warehouse_id, p_qty_change,
    p_type, p_reference_id, p_reference_type, p_performed_by, p_notes
  ) RETURNING id INTO v_ledger_id;

  -- 2. Materialize batch stock update
  IF p_batch_id IS NOT NULL THEN
    UPDATE public.inventory_batches
    SET remaining_qty = remaining_qty + p_qty_change,
        updated_at = now()
    WHERE id = p_batch_id;
  END IF;

  -- 3. Synchronize aggregated cache table
  PERFORM public.recompute_inventory(p_product_id, p_warehouse_id);

  RETURN v_ledger_id;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- GRN Intake: Inward Purchase Invoice with FIFO lot allocation
CREATE OR REPLACE FUNCTION public.inward_purchase_invoice(
  p_invoice_id uuid,
  p_items jsonb, -- array of {product_id, batch_number, expiry_date, quantity, landed_cost}
  p_performed_by uuid
)
RETURNS boolean AS $body$
DECLARE
  v_warehouse_id uuid;
  v_item jsonb;
  v_batch_id uuid;
  v_base_qty numeric;
BEGIN
  SELECT warehouse_id INTO v_warehouse_id FROM public.purchase_invoices WHERE id = p_invoice_id;

  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Purchase Invoice not found or invalid';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_base_qty := (v_item->>'quantity')::numeric;

    -- Create new batch record
    INSERT INTO public.inventory_batches (
      purchase_invoice_id, product_id, warehouse_id, batch_number,
      expiry_date, initial_qty, remaining_qty, landed_cost, created_at, updated_at
    ) VALUES (
      p_invoice_id,
      (v_item->>'product_id')::uuid,
      v_warehouse_id,
      COALESCE(v_item->>'batch_number', 'BM-GEN-LOT'),
      COALESCE((v_item->>'expiry_date')::date, CURRENT_DATE + interval '1 year'),
      v_base_qty,
      v_base_qty,
      COALESCE((v_item->>'landed_cost')::numeric, 0.00),
      now(),
      now()
    ) RETURNING id INTO v_batch_id;

    -- Write to Stock Ledger
    PERFORM public.record_inventory_movement(
      (v_item->>'product_id')::uuid,
      v_batch_id,
      v_warehouse_id,
      v_base_qty,
      'inward',
      p_invoice_id::text,
      'grn',
      p_performed_by,
      'Inward via GRN Intake'
    );
  END LOOP;

  UPDATE public.purchase_invoices SET status = 'completed' WHERE id = p_invoice_id;
  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 9. SHOP CREDIT LINES & OUTSTANDING BALANCES
-- ============================================================================

-- Outstandings calculator
CREATE OR REPLACE FUNCTION public.get_shop_outstanding_balance(target_shop_id uuid)
RETURNS numeric AS $body$
DECLARE
  v_balance numeric;
BEGIN
  SELECT COALESCE(SUM(total - amount_paid), 0) INTO v_balance
  FROM public.invoices
  WHERE order_id IN (SELECT id FROM public.orders WHERE shop_id = target_shop_id AND is_void = false)
    AND is_void = false
    AND status != 'paid';

  -- Sync balance to shops table
  UPDATE public.shops SET balance = v_balance WHERE id = target_shop_id;
  
  RETURN v_balance;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Maintain shops.balance and unpaid_invoices_count on payment changes
CREATE OR REPLACE FUNCTION public.fn_sync_shop_balance_on_invoice_change()
RETURNS trigger AS $body$
DECLARE
  v_shop_id uuid;
BEGIN
  SELECT shop_id INTO v_shop_id FROM public.orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  IF v_shop_id IS NOT NULL THEN
    PERFORM public.get_shop_outstanding_balance(v_shop_id);
    UPDATE public.shops 
    SET unpaid_invoices_count = (
      SELECT COUNT(*) FROM public.invoices i JOIN public.orders o ON i.order_id = o.id
      WHERE o.shop_id = v_shop_id AND i.status != 'paid' AND i.is_void = false AND o.is_void = false
    )
    WHERE id = v_shop_id;
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sync_shop_balance ON public.invoices;
CREATE TRIGGER tr_sync_shop_balance
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_shop_balance_on_invoice_change();

-- ============================================================================
-- 10. SAVING ORDERS & DISPATCH LOT RESOLUTIONS (FIFO DEDUCTION ENGINE)
-- ============================================================================

-- Save draft orders with precise type mappings
CREATE OR REPLACE FUNCTION public.save_draft_order_v4(
  p_order_id uuid,
  p_order_data jsonb,
  p_items jsonb[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  v_order_id uuid;
  v_salesperson_id uuid;
  v_status_text text;
  v_item jsonb;
BEGIN
  v_order_id := p_order_id;
  v_salesperson_id := (p_order_data->>'salesperson_id')::uuid;
  v_status_text := COALESCE(p_order_data->>'status', 'draft');
  
  IF v_salesperson_id IS NULL THEN
    RAISE EXCEPTION 'salesperson_id is required';
  END IF;

  IF v_order_id IS NULL THEN
    INSERT INTO public.orders (
      shop_id, salesperson_id, warehouse_id, status,
      total, subtotal, gst_total, discount_amount, discount_type, notes, order_date
    ) VALUES (
      (p_order_data->>'shop_id')::uuid,
      v_salesperson_id,
      (p_order_data->>'warehouse_id')::uuid,
      v_status_text::public.order_status,
      (p_order_data->>'total')::numeric,
      (p_order_data->>'subtotal')::numeric,
      (p_order_data->>'gst_total')::numeric,
      (p_order_data->>'discount_amount')::numeric,
      p_order_data->>'discount_type',
      p_order_data->>'notes',
      COALESCE((p_order_data->>'order_date')::timestamp with time zone, now())
    ) RETURNING id INTO v_order_id;
  ELSE
    UPDATE public.orders 
    SET 
      shop_id = (p_order_data->>'shop_id')::uuid,
      salesperson_id = v_salesperson_id,
      status = v_status_text::public.order_status,
      total = (p_order_data->>'total')::numeric,
      subtotal = (p_order_data->>'subtotal')::numeric,
      gst_total = (p_order_data->>'gst_total')::numeric,
      discount_amount = (p_order_data->>'discount_amount')::numeric,
      discount_type = p_order_data->>'discount_type',
      notes = p_order_data->>'notes',
      warehouse_id = (p_order_data->>'warehouse_id')::uuid,
      updated_at = now()
    WHERE id = v_order_id;

    DELETE FROM public.order_items WHERE order_id = v_order_id;
  END IF;

  FOREACH v_item IN ARRAY p_items
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, quantity, unit_price, gst_rate, pack_type, line_total, batch_id
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      (v_item->>'gst_rate')::numeric,
      CASE 
        WHEN (v_item->>'pack_type') = 'pcs' THEN 'unit'::public.pack_type
        ELSE (v_item->>'pack_type')::public.pack_type
      END,
      (v_item->>'line_total')::numeric,
      (v_item->>'batch_id')::uuid
    );
  END LOOP;

  RETURN v_order_id;
END;
$body$;

-- Pin logged order submission block
CREATE OR REPLACE FUNCTION public.insert_order_with_pin_v2(
  p_session_token text,
  p_order_data jsonb,
  p_items_data jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $body$
DECLARE
  v_profile_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_calc_subtotal numeric := 0;
  v_calc_gst numeric := 0;
  v_calc_total numeric := 0;
  v_shop_id uuid;
  v_warehouse_id uuid;
  v_credit_limit numeric;
  v_current_balance numeric;
  v_is_over_limit boolean := false;
BEGIN
  -- 1. Session token authorization check
  SELECT profile_id INTO v_profile_id
  FROM public.salesperson_sessions
  WHERE session_token = p_session_token
  AND expires_at > now();

  IF v_profile_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired salesperson session');
  END IF;

  v_shop_id := (p_order_data->>'shop_id')::uuid;
  v_warehouse_id := (p_order_data->>'warehouse_id')::uuid;

  -- 2. Validate credit limit
  SELECT credit_limit, COALESCE(balance, 0) INTO v_credit_limit, v_current_balance
  FROM public.shops
  WHERE id = v_shop_id;

  -- 3. Inline calculation totals verification
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
  LOOP
    v_calc_subtotal := v_calc_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
    v_calc_gst := v_calc_gst + (((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric) * (COALESCE((v_item->>'gst_rate')::numeric, 0) / 100));
  END LOOP;

  v_calc_total := v_calc_subtotal + v_calc_gst;
  IF (p_order_data->>'discount_type' = 'flat') THEN
    v_calc_total := v_calc_total - COALESCE((p_order_data->>'discount_amount')::numeric, 0);
  ELSIF (p_order_data->>'discount_type' = 'percentage') THEN
    v_calc_total := v_calc_total * (1 - (COALESCE((p_order_data->>'discount_amount')::numeric, 0) / 100));
  END IF;

  v_is_over_limit := (v_credit_limit > 0 AND (v_current_balance + v_calc_total) > v_credit_limit);

  IF v_is_over_limit AND (COALESCE(p_order_data->>'status', 'pending_approval') != 'draft') THEN
    -- Accept but flag as is_over_limit, or reject based on business setting. Here we force pending_approval with overlimit flag.
    v_is_over_limit := true;
  END IF;

  -- 4. INSERT Header
  INSERT INTO public.orders (
    shop_id, salesperson_id, warehouse_id, status, 
    subtotal, gst_total, total, 
    discount_amount, discount_type, notes, order_date,
    is_over_limit
  ) VALUES (
    v_shop_id, v_profile_id, v_warehouse_id, COALESCE(p_order_data->>'status', 'pending_approval')::order_status,
    v_calc_subtotal, v_calc_gst, v_calc_total,
    COALESCE((p_order_data->>'discount_amount')::numeric, 0), COALESCE(p_order_data->>'discount_type', 'flat'),
    p_order_data->>'notes', COALESCE((p_order_data->>'order_date')::timestamp with time zone, now()),
    v_is_over_limit
  ) RETURNING id INTO v_order_id;

  -- 5. INSERT Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, quantity, unit_price, gst_rate, pack_type,
      line_total, line_total_tax_exclusive, line_tax_amount, batch_id
    ) VALUES (
      v_order_id, 
      (v_item->>'product_id')::uuid, 
      (v_item->>'quantity')::numeric, 
      (v_item->>'unit_price')::numeric, 
      (v_item->>'gst_rate')::numeric, 
      (v_item->>'pack_type')::pack_type,
      ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric * (1 + COALESCE((v_item->>'gst_rate')::numeric, 0)/100)),
      ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric),
      ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric * (COALESCE((v_item->>'gst_rate')::numeric, 0)/100)),
      (v_item->>'batch_id')::uuid
    );
  END LOOP;

  RETURN json_build_object('success', true, 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$body$;

-- Deducts and registers LOT dispatches (supports FIFO resolution)
CREATE OR REPLACE FUNCTION public.invoice_deduction(
  p_order_id UUID,
  p_performed_by UUID
) RETURNS boolean AS $body$
DECLARE
  v_item            RECORD;
  v_batch           RECORD;
  v_deduction_units NUMERIC;
  v_needed          NUMERIC;
  v_deducted        NUMERIC;
  v_warehouse_id    UUID;
BEGIN
  SELECT warehouse_id INTO v_warehouse_id FROM public.orders WHERE id = p_order_id;

  FOR v_item IN
    SELECT oi.id AS order_item_id, oi.product_id, oi.quantity, oi.pack_type
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    v_deduction_units := public.convert_to_base_units(v_item.product_id, v_item.quantity, v_item.pack_type::TEXT);
    v_needed := v_deduction_units;

    -- FIFO resolve order lines against batches with stock
    FOR v_batch IN
      SELECT id, remaining_qty FROM public.inventory_batches
      WHERE product_id = v_item.product_id
        AND warehouse_id = v_warehouse_id
        AND remaining_qty > 0
      ORDER BY expiry_date ASC, created_at ASC
    LOOP
      IF v_needed <= 0 THEN EXIT; END IF;
      v_deducted := LEAST(v_needed, v_batch.remaining_qty);

      -- Deduct via the general inventory ledger and update aggregate counts
      PERFORM public.record_inventory_movement(
        v_item.product_id, v_batch.id, v_warehouse_id,
        -v_deducted, 'sale', p_order_id::text, 'order',
        p_performed_by, 'Order Dispatch Deduction'
      );

      -- Log mapping resolution
      INSERT INTO public.order_batch_deductions
        (order_id, order_item_id, batch_id, product_id, warehouse_id, qty_base_units)
      VALUES
        (p_order_id, v_item.order_item_id, v_batch.id,
         v_item.product_id, v_warehouse_id, v_deducted)
      ON CONFLICT (id) DO NOTHING;

      v_needed := v_needed - v_deducted;
    END LOOP;

    IF v_needed > 0 THEN
      RAISE EXCEPTION 'Insufficient stock in warehouse for product SKU % during Dispatch', v_item.product_id;
    END IF;
  END LOOP;

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 11. WORKFLOW EVENTS: DELIVER, CANCEL, REVERT TO APPROVED
-- ============================================================================

-- Dispatch & Deliver Transition Trigger Functions
CREATE OR REPLACE FUNCTION public.deliver_order(p_order_id UUID, p_delivered_by UUID)
RETURNS boolean AS $body$
BEGIN
  -- Mark the order status as delivered
  UPDATE public.orders 
  SET status = 'delivered',
      delivered_at = now(),
      updated_at = now()
  WHERE id = p_order_id;

  -- Auto-generate associated Invoice if not already present
  INSERT INTO public.invoices (order_id, status, total, amount_paid, invoice_date)
  SELECT p_order_id, 'pending', total, 0.00, CURRENT_DATE
  FROM public.orders WHERE id = p_order_id
  ON CONFLICT (order_id) DO NOTHING;

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cancel transition
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID)
RETURNS boolean AS $body$
DECLARE
  v_curr_status text;
BEGIN
  SELECT status INTO v_curr_status FROM public.orders WHERE id = p_order_id;
  
  -- Reallocate stock if items had already been deducted (dispatched or delivered)
  IF v_curr_status IN ('dispatched', 'delivered') THEN
    PERFORM public.revert_order_to_approved(p_order_id);
  END IF;

  UPDATE public.orders 
  SET status = 'draft', is_void = true, updated_at = now() 
  WHERE id = p_order_id;

  UPDATE public.invoices SET is_void = true WHERE order_id = p_order_id;

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revert to Approved: Restores deduct logs to batch stocks (Safe transactional loops)
CREATE OR REPLACE FUNCTION public.revert_order_to_approved(p_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_item RECORD;
  v_order_number TEXT;
  v_prev_status TEXT;
  v_user_id UUID;
  v_already_reverting text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
      v_user_id := NULL;
    END IF;
  END IF;

  SELECT order_number, status INTO v_order_number, v_prev_status 
  FROM public.orders 
  WHERE id = p_order_id;
  
  BEGIN
    v_already_reverting := current_setting('app.reverting_order', true);
  EXCEPTION WHEN OTHERS THEN
    v_already_reverting := 'false';
  END;

  -- Set session flag to avoid trigger cascade recursion
  PERFORM set_config('app.reverting_order', 'true', true);

  IF COALESCE(v_already_reverting, 'false') <> 'true' AND v_prev_status IN ('dispatched', 'delivered') THEN
    -- Log audit trail
    INSERT INTO public.order_reversals (order_id, reverted_by, previous_status, reason)
    VALUES (p_order_id, v_user_id, v_prev_status, 'Reversal Restoration to Approved state');
    
    -- FIFO restorer loop
    FOR v_item IN 
      SELECT ib.product_id, ib.warehouse_id, obd.qty_base_units, obd.batch_id
      FROM public.order_batch_deductions obd
      JOIN public.inventory_batches ib ON obd.batch_id = ib.id
      WHERE obd.order_id = p_order_id
    LOOP
      PERFORM public.record_inventory_movement(
        v_item.product_id,
        v_item.batch_id,
        v_item.warehouse_id,
        v_item.qty_base_units,
        'reversal',
        p_order_id::text,
        'order',
        v_user_id,
        'FIFO Restored: Order ' || COALESCE(v_order_number, 'N/A') || ' reverted'
      );
    END LOOP;

    DELETE FROM public.order_batch_deductions WHERE order_id = p_order_id;
    UPDATE public.invoices SET is_void = true WHERE order_id = p_order_id;
  END IF;
  
  -- Restore the order status safely to approved
  UPDATE public.orders 
  SET status = 'approved', 
      dispatched_at = NULL, 
      delivered_at = NULL,
      updated_at = NOW()
  WHERE id = p_order_id;

  -- Reset bypass parameters
  PERFORM set_config('app.reverting_order', 'false', true);

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.reverting_order', 'false', true);
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$body$;

-- Status change trigger to auto handle reversal audits
CREATE OR REPLACE FUNCTION public.trg_handle_order_reversal()
RETURNS TRIGGER AS $body$
DECLARE
  v_reverting text;
BEGIN
  BEGIN
    v_reverting := current_setting('app.reverting_order', true);
  EXCEPTION WHEN OTHERS THEN
    v_reverting := 'false';
  END;

  IF COALESCE(v_reverting, 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF (OLD.status IN ('dispatched', 'delivered')) AND (NEW.status IN ('approved', 'pending_approval', 'draft')) THEN
    PERFORM set_config('app.reverting_order', 'true', true);
    PERFORM public.revert_order_to_approved(NEW.id);
    NEW.dispatched_at = NULL;
    NEW.delivered_at = NULL;
    PERFORM set_config('app.reverting_order', 'false', true);
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_order_reversal ON public.orders;
CREATE TRIGGER tr_order_reversal
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_handle_order_reversal();


-- ============================================================================
-- 12. SPECIALIZED INTERACTIVE OPERATIONS
-- ============================================================================

-- Function: Price-Tiers Margin Sync
CREATE OR REPLACE FUNCTION public.sync_product_margins(
  p_product_id UUID,
  p_mrp NUMERIC,
  p_selling_price NUMERIC
) RETURNS boolean AS $body$
BEGIN
  -- Re-derive 5-Tier default percentages based on selling_price and MRP spread
  INSERT INTO public.product_price_tiers (
    product_id, tier_1_distributor, tier_2_super_stockist, 
    tier_3_sub_stockist, tier_4_wholesale, tier_5_retail, updated_at
  ) VALUES (
    p_product_id,
    p_selling_price * 0.85, -- 15% discount for Distributor
    p_selling_price * 0.90, -- 10% discount for Super Stockist
    p_selling_price * 0.93, -- 7% discount for Sub Stockist
    p_selling_price * 0.96, -- 4% discount for Wholesaler
    selling_price,          -- Standard retailing RBP
    now()
  ) ON CONFLICT (product_id) DO UPDATE SET
    tier_1_distributor = EXCLUDED.tier_1_distributor,
    tier_2_super_stockist = EXCLUDED.tier_2_super_stockist,
    tier_3_sub_stockist = EXCLUDED.tier_3_sub_stockist,
    tier_4_wholesale = EXCLUDED.tier_4_wholesale,
    tier_5_retail = EXCLUDED.tier_5_retail,
    updated_at = now();

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Stock Reconciliation audit closure
CREATE OR REPLACE FUNCTION public.reconcile_stock(
  p_audit_id uuid,
  p_performed_by uuid
)
RETURNS boolean AS $body$
DECLARE
  v_item RECORD;
  v_warehouse_id uuid;
  v_batch_id uuid;
BEGIN
  SELECT warehouse_id INTO v_warehouse_id FROM public.stock_audits WHERE id = p_audit_id;

  FOR v_item IN 
    SELECT product_id, reconciliation_qty, notes 
    FROM public.stock_audit_items 
    WHERE audit_id = p_audit_id AND reconciliation_qty != 0
  LOOP
    -- Grab the latest lot for audit entries adjustment
    SELECT id INTO v_batch_id 
    FROM public.inventory_batches 
    WHERE product_id = v_item.product_id AND warehouse_id = v_warehouse_id
    ORDER BY created_at DESC LIMIT 1;

    PERFORM public.record_inventory_movement(
      v_item.product_id,
      v_batch_id,
      v_warehouse_id,
      v_item.reconciliation_qty,
      'audit_reconciliation',
      p_audit_id::text,
      'audit',
      p_performed_by,
      COALESCE(v_item.notes, 'Stock Audit Adjustment reconcile')
    );
  END LOOP;

  UPDATE public.stock_audits 
  SET status = 'approved', completed_at = now() 
  WHERE id = p_audit_id;

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Warehouse Inter-Transfer
CREATE OR REPLACE FUNCTION public.transfer_stock(
  p_transfer_id uuid,
  p_performed_by uuid
)
RETURNS boolean AS $body$
DECLARE
  v_item RECORD;
  v_src_id uuid;
  v_dst_id uuid;
  v_src_batch RECORD;
  v_needed numeric;
  v_deducted numeric;
  v_new_batch_id uuid;
BEGIN
  SELECT source_warehouse_id, target_warehouse_id 
  INTO v_src_id, v_dst_id 
  FROM public.stock_transfers WHERE id = p_transfer_id;

  FOR v_item IN
    SELECT product_id, quantity FROM public.stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    v_needed := v_item.quantity;

    FOR v_src_batch IN
      SELECT * FROM public.inventory_batches
      WHERE product_id = v_item.product_id AND warehouse_id = v_src_id AND remaining_qty > 0
      ORDER BY expiry_date ASC, created_at ASC
    LOOP
      IF v_needed <= 0 THEN EXIT; END IF;
      v_deducted := LEAST(v_needed, v_src_batch.remaining_qty);

      -- Deduct from source warehouse
      PERFORM public.record_inventory_movement(
        v_item.product_id, v_src_batch.id, v_src_id,
        -v_deducted, 'transfer_out', p_transfer_id::text, 'stock_transfer',
        p_performed_by, 'Inter-warehouse outbound transfer'
      );

      -- Add and create matching lot batch at destination warehouse
      INSERT INTO public.inventory_batches (
        purchase_invoice_id, product_id, warehouse_id, batch_number,
        expiry_date, manufactured_date, initial_qty, remaining_qty, landed_cost
      ) VALUES (
        v_src_batch.purchase_invoice_id, v_item.product_id, v_dst_id, v_src_batch.batch_number,
        v_src_batch.expiry_date, v_src_batch.manufactured_date, v_deducted, v_deducted, v_src_batch.landed_cost
      ) RETURNING id INTO v_new_batch_id;

      PERFORM public.record_inventory_movement(
        v_item.product_id, v_new_batch_id, v_dst_id,
        v_deducted, 'transfer_in', p_transfer_id::text, 'stock_transfer',
        p_performed_by, 'Inter-warehouse inbound transfer receipt'
      );

      v_needed := v_needed - v_deducted;
    END LOOP;

    IF v_needed > 0 THEN
      RAISE EXCEPTION 'Insufficient stock in source warehouse for product SKU %', v_item.product_id;
    END IF;
  END LOOP;

  UPDATE public.stock_transfers 
  SET status = 'received', received_at = now() 
  WHERE id = p_transfer_id;

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Client counts selector
CREATE OR REPLACE FUNCTION public.get_product_category_counts()
RETURNS TABLE(division_category text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT COALESCE(division_category, 'Uncategorized'), COUNT(*)
  FROM public.products
  WHERE is_active = true
  GROUP BY division_category;
$body$;

-- ============================================================================
-- 13. MATERIALIZED/CROSS-JOIN VIEWS & DASHBOARD SUMMARY PROCEDURES
-- ============================================================================

-- Stock Warehouse Cross Join View (Provides complete products list with zero fallback stocks)
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
SELECT 
  (p.id || '-' || w.id)::text as inventory_id,
  w.id as warehouse_id,
  COALESCE(i.stock_base_units, 0) as stock_base_units,
  COALESCE(NULLIF(i.avg_landed_cost, 0), 0.01) as avg_landed_cost,
  (COALESCE(i.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock,
  p.name, p.sku, p.hsn, p.mrp, p.rbp_unit, p.rbp_carton, p.selling_price, p.brand,
  p.division_category, p.pack_category, p.pack_size_value, p.pack_size_unit, p.unit, p.unit_type,
  p.units_per_packet, p.packets_per_case, p.id as id, p.is_active
FROM public.products p
CROSS JOIN public.warehouses w
LEFT JOIN public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id;

-- Core dashboard stats RPC with full collections insight
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_warehouse_id UUID DEFAULT NULL)
RETURNS JSON AS $body$
DECLARE
  result                JSON;
  pending_count         INT;
  approved_count        INT;
  dispatched_count      INT;
  delivered_today_count INT;
  sales_today_val       NUMERIC;
  outstanding_val       NUMERIC;
  low_stock_json        JSON;
  expiring_json         JSON;
  top_shops_json        JSON;
  top_salespeople_json  JSON;
  trend_json            JSON;
  recent_json           JSON;
  pending_queue_json    JSON;
  total_inventory_val   NUMERIC;
  warehouse_split_json  JSON;
  today_collections_val NUMERIC;
BEGIN
  SELECT count(*) INTO pending_count FROM public.orders WHERE status = 'pending_approval' AND is_void = false AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
  SELECT count(*) INTO approved_count FROM public.orders WHERE status = 'approved' AND is_void = false AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
  SELECT count(*) INTO dispatched_count FROM public.orders WHERE status = 'dispatched' AND is_void = false AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
  
  IF p_warehouse_id IS NULL THEN
    SELECT COALESCE(VAL, 0), COALESCE(delivered_count, 0)
    FROM (SELECT revenue as VAL, delivered_count FROM public.summary_daily_performance WHERE date = CURRENT_DATE) x
    INTO sales_today_val, delivered_today_count;
  ELSE
    SELECT COALESCE(SUM(total), 0), COUNT(*) FILTER (WHERE status = 'delivered')
    INTO sales_today_val, delivered_today_count
    FROM public.orders
    WHERE (delivered_at::date = CURRENT_DATE OR dispatched_at::date = CURRENT_DATE)
    AND is_void = false AND warehouse_id = p_warehouse_id;
  END IF;

  IF p_warehouse_id IS NULL THEN
    SELECT COALESCE((val_json->>'total_outstanding')::numeric, 0) INTO outstanding_val FROM public.summary_global_stats WHERE key = 'financial_summary';
  ELSE
    SELECT COALESCE(SUM(i.total - i.amount_paid), 0) INTO outstanding_val
    FROM public.invoices i JOIN public.orders o ON i.order_id = o.id
    WHERE i.payment_status != 'paid' AND i.is_void = false AND o.warehouse_id = p_warehouse_id;
  END IF;

  SELECT json_agg(t) INTO low_stock_json FROM (
    SELECT id, name, min_stock, stock_base_units as quantity, units_per_packet
    FROM public.v_product_stock_warehouse
    WHERE is_active = true AND stock_base_units <= min_stock AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
    ORDER BY (stock_base_units / NULLIF(min_stock, 0)) ASC LIMIT 5
  ) t;

  SELECT json_agg(t) INTO expiring_json FROM (
    SELECT b.id, b.batch_number, b.expiry_date, b.remaining_qty, b.product_id, p.name as product_name
    FROM public.inventory_batches b JOIN public.products p ON b.product_id = p.id
    WHERE b.remaining_qty > 0 AND b.expiry_date <= (CURRENT_DATE + INTERVAL '30 days') AND (p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id)
    ORDER BY b.expiry_date ASC LIMIT 5
  ) t;

  SELECT json_agg(t) INTO top_shops_json FROM (
    SELECT s.id as shop_id, s.name, sum(o.total) as total
    FROM public.orders o JOIN public.shops s ON o.shop_id = s.id
    WHERE o.status IN ('delivered', 'dispatched') AND (o.delivered_at >= date_trunc('month', CURRENT_DATE) OR o.dispatched_at >= date_trunc('month', CURRENT_DATE))
    AND o.is_void = false AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
    GROUP BY s.id, s.name ORDER BY total DESC LIMIT 5
  ) t;

  SELECT json_agg(t) INTO top_salespeople_json FROM (
    SELECT pr.full_name as name, sum(o.total) as total
    FROM public.orders o JOIN public.profiles pr ON o.salesperson_id = pr.id
    WHERE o.status IN ('delivered', 'dispatched') AND (o.delivered_at >= date_trunc('month', CURRENT_DATE) OR o.dispatched_at >= date_trunc('month', CURRENT_DATE))
    AND o.is_void = false AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
    GROUP BY pr.id, pr.full_name ORDER BY total DESC LIMIT 5
  ) t;

  IF p_warehouse_id IS NULL THEN
    SELECT json_agg(t) INTO trend_json FROM (
      SELECT d.date::text, COALESCE(s.revenue, 0) as total
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d(date)
      LEFT JOIN public.summary_daily_performance s ON s.date = d.date::date ORDER BY d.date ASC
    ) t;
  ELSE
    SELECT json_agg(t) INTO trend_json FROM (
      SELECT d.date::text, COALESCE(SUM(o.total), 0) as total
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d(date)
      LEFT JOIN public.orders o ON (o.delivered_at::date = d.date::date OR o.dispatched_at::date = d.date::date) AND o.is_void = false AND o.warehouse_id = p_warehouse_id
      GROUP BY d.date ORDER BY d.date ASC
    ) t;
  END IF;

  SELECT json_agg(t) INTO pending_queue_json FROM (
    SELECT o.id, o.order_number, o.total, o.created_at, o.salesperson_id, s.name as shop_name, pr.full_name as salesperson_name
    FROM public.orders o JOIN public.shops s ON o.shop_id = s.id LEFT JOIN public.profiles pr ON o.salesperson_id = pr.id
    WHERE o.status = 'pending_approval' AND o.is_void = false AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
    ORDER BY o.created_at ASC LIMIT 5
  ) t;

  SELECT json_agg(t) INTO recent_json FROM (
    SELECT o.id, o.order_number, o.status, o.total, o.created_at, s.name as shop_name, i.status as payment_status
    FROM public.orders o 
    LEFT JOIN public.shops s ON o.shop_id = s.id
    LEFT JOIN public.invoices i ON i.order_id = o.id AND i.is_void = false
    WHERE o.is_void = false AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
    ORDER BY o.created_at DESC LIMIT 5
  ) t;

  -- Performance valuations
  SELECT COALESCE(SUM(remaining_qty * landed_cost), 0) INTO total_inventory_val
  FROM public.inventory_batches WHERE remaining_qty > 0 AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  IF p_warehouse_id IS NULL THEN
    SELECT json_agg(t) INTO warehouse_split_json FROM (
      SELECT w.name, w.code, COALESCE(SUM(ib.remaining_qty * ib.landed_cost), 0) as total_value, COUNT(DISTINCT ib.product_id) as item_count
      FROM public.warehouses w LEFT JOIN public.inventory_batches ib ON w.id = ib.warehouse_id AND ib.remaining_qty > 0
      WHERE w.is_active = true GROUP BY w.id, w.name, w.code ORDER BY total_value DESC
    ) t;
  ELSE
    warehouse_split_json := '[]'::json;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO today_collections_val
  FROM public.payments WHERE created_at::date = CURRENT_DATE AND is_void = false;

  result := json_build_object(
    'pending', pending_count,
    'approved', approved_count,
    'dispatched', dispatched_count,
    'deliveredToday', COALESCE(delivered_today_count, 0),
    'salesToday', COALESCE(sales_today_val, 0),
    'outstanding', COALESCE(outstanding_val, 0),
    'lowStock', COALESCE(low_stock_json, '[]'::json),
    'expiring', COALESCE(expiring_json, '[]'::json),
    'topShops', COALESCE(top_shops_json, '[]'::json),
    'topSalespeople', COALESCE(top_salespeople_json, '[]'::json),
    'trend', COALESCE(trend_json, '[]'::json),
    'pendingQueue', COALESCE(pending_queue_json, '[]'::json),
    'recent', COALESCE(recent_json, '[]'::json),
    'totalInventoryValue', total_inventory_val,
    'warehouseSplit', COALESCE(warehouse_split_json, '[]'::json),
    'todayCollections', today_collections_val
  );

  RETURN result;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger logic for summary statistics recalculation
CREATE OR REPLACE FUNCTION public.sync_daily_performance()
RETURNS trigger AS $body$
BEGIN
  INSERT INTO public.summary_daily_performance (date, revenue, order_count, delivered_count, updated_at)
  SELECT 
    CURRENT_DATE,
    COALESCE(SUM(total), 0) as revenue,
    COUNT(*) as order_count,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
    now()
  FROM public.orders
  WHERE created_at::date = CURRENT_DATE AND is_void = false
  ON CONFLICT (date) DO UPDATE SET
    revenue = EXCLUDED.revenue,
    order_count = EXCLUDED.order_count,
    delivered_count = EXCLUDED.delivered_count,
    updated_at = now();
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_orders_performance ON public.orders;
CREATE TRIGGER tr_orders_performance
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_daily_performance();

-- Trigger update global statistical metrics
CREATE OR REPLACE FUNCTION public.refresh_global_stats()
RETURNS void AS $body$
DECLARE
  v_outstanding numeric;
BEGIN
  SELECT COALESCE(SUM(total - amount_paid), 0) INTO v_outstanding FROM public.invoices WHERE status != 'paid' AND is_void = false;
  
  INSERT INTO public.summary_global_stats (key, val_json, updated_at)
  VALUES (
    'financial_summary', 
    json_build_object('total_outstanding', v_outstanding), 
    now()
  ) ON CONFLICT (key) DO UPDATE SET
    val_json = EXCLUDED.val_json,
    updated_at = now();
END;
$body$ LANGUAGE plpgsql;

-- Apply RPC permissions execute grants on anonymous/authenticated
GRANT EXECUTE ON FUNCTION public.setup_first_owner(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_auth_data(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin_v2(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_pin_v1(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_salesperson_pin(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_staff_session_v2(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_salesperson_pin(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_salesperson_list() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_list_v1() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_to_base_units(uuid, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_inventory(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_inventory() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement(uuid, uuid, uuid, numeric, text, text, text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inward_purchase_invoice(uuid, jsonb, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shop_outstanding_balance(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_draft_order_v4(uuid, jsonb, jsonb[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_order_with_pin_v2(text, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_deduction(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_order(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_order_to_approved(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_product_margins(uuid, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stock(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_stock(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_category_counts() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO anon, authenticated;

-- ============================================================================
-- 14. ROW LEVEL SECURITY (RLS) & ACCESS CONTROL POLICIES
-- ============================================================================
-- Fully configure Row Level Security on core application tables.
-- To ensure a smooth development and testing flow, we apply highly permissive 
-- policy blocks on the physical tables while preserving analytical safety.

-- Turn on row level security across all models
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_batch_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesperson_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesperson_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

-- Setup Permissive RLS Policy Handlers
DO $body$
DECLARE
  t_name text;
  tables_list text[] := ARRAY[
    'warehouses', 'profiles', 'shops', 'products', 'product_price_tiers', 
    'schemes', 'purchase_invoices', 'inventory_batches', 'inventory', 
    'stock_ledger', 'orders', 'order_items', 'order_batch_deductions', 
    'invoices', 'collections', 'payments', 'salesperson_pins', 
    'salesperson_sessions', 'stock_audits', 'stock_audit_items', 
    'stock_transfers', 'stock_transfer_items', 'returns'
  ];
BEGIN
  FOREACH t_name IN ARRAY tables_list
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "permissive_access_policy" ON public.%I', t_name);
    EXECUTE format('CREATE POLICY "permissive_access_policy" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t_name);
  END LOOP;
END;
$body$;


-- ============================================================================
-- 15. COMPREHENSIVE SEED DATA
-- ============================================================================

-- Seed Warehouses
INSERT INTO public.warehouses (name, code, address, is_active)
VALUES 
  ('Central Warehouse', 'CWH-01', 'Sector 5, Industrial Area, Bhubaneswar', true),
  ('North Regional Depot', 'NRD-02', 'Depot Lane, Cuttack', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- Seed Shops
INSERT INTO public.shops (name, owner_name, phone, email, address, credit_limit, balance)
VALUES 
  ('Kalinga Grocery Mart', 'Subhash Chandra', '9876543210', 'kalinga@gmail.com', 'Janpath, Bhubaneswar', 100000.00, 0.00),
  ('Monalisa Supermarket', 'Debashish Mohanty', '9876543211', 'monalisa@yahoo.com', 'Link Road, Cuttack', 75000.00, 0.00),
  ('Priyanka Retailers', 'Satyabrata Sahoo', '9876543212', 'priyanka@gmail.com', 'Main Bazaar, Puri', 50000.00, 0.00),
  ('Satyabhama Store', 'Pradip Das', '9876543213', 'pradip@gmail.com', 'High School Road, Khurda', 30000.00, 0.00)
ON CONFLICT DO NOTHING;

-- Seed Products
INSERT INTO public.products (
  name, sku, hsn, mrp, rbp_unit, rbp_carton, units_per_packet, packets_per_case, units_per_case, 
  weight_per_unit_grams, selling_price, brand, division_category, pack_category, 
  pack_size_value, pack_size_unit, unit, unit_type, is_active, min_stock
) VALUES
  ('Turmeric Powder (Haldi) [5kg]', 'BM-TURMERIC-5KG-BAG', '09103030', 2060, 196, 4116, 1, 4, 4, 5000.0, 196, 'Bharat Masala', 'BASIC SPICES', 'BAG', 5.0, 'kg', 'BAG', 'kg_g', true, 10.0),
  ('Turmeric Powder (Haldi) [1 Kg]', 'BM-TURMERIC-1KG-BAG', '09103030', 416, 198, 3326, 1, 16, 16, 1000.0, 198, 'Bharat Masala', 'BASIC SPICES', 'BAG', 1.0, 'kg', 'BAG', 'kg_g', true, 20.0),
  ('Turmeric Powder (Haldi) [500 gms]', 'BM-TURMERIC-500GM-BAG', '09103030', 210, 200, 3360, 1, 32, 32, 500.0, 200, 'Bharat Masala', 'BASIC SPICES', 'BAG', 500.0, 'gms', 'BAG', 'kg_g', true, 30.0),
  ('Turmeric Powder Jar (Haldi) [1 Kg]', 'BM-TURMERIC-1KG-JAR', '09103030', 488, 232, 2923, 1, 12, 12, 1000.0, 232, 'Bharat Masala', 'BASIC SPICES', 'JAR', 1.0, 'kg', 'BAG', 'kg_g', true, 15.0),
  ('Chilli Powder [5kg]', 'BM-CHILLIPO-5KG-BAG', '09042211', 2540, 242, 5082, 1, 4, 4, 5000.0, 242, 'Bharat Masala', 'BASIC SPICES', 'BAG', 5.0, 'kg', 'BAG', 'kg_g', true, 10.0),
  ('Chilli Powder [1 kg]', 'BM-CHILLIPO-1KG-BAG', '09042211', 512, 244, 4099, 1, 16, 16, 1000.0, 244, 'Bharat Masala', 'BASIC SPICES', 'BAG', 1.0, 'kg', 'BAG', 'kg_g', true, 20.0),
  ('Coriander Powder (Dhania) [1 kg]', 'BM-CORIANDE-1KG-BAG', '09092200', 386, 184, 3091, 1, 16, 16, 1000.0, 184, 'Bharat Masala', 'BASIC SPICES', 'BAG', 1.0, 'kg', 'BAG', 'kg_g', true, 20.0),
  ('Cumin Powder (Jeera) [500 gms]', 'BM-CUMINPOW-500GM-BAG', '09093200', 384, 366, 6149, 1, 32, 32, 500.0, 366, 'Bharat Masala', 'BASIC SPICES', 'BAG', 500.0, 'gms', 'BAG', 'kg_g', true, 15.0),
  ('Meat Masala [100 gms]', 'BM-MEATMASA-100GM-POU', '09109100', 115, 549, 6917, 1, 120, 120, 100.0, 549, 'Bharat Masala', 'BLENDED SPICES', 'POUCH', 100.0, 'gms', 'case', 'pieces', true, 50.0),
  ('Chicken Masala [100 gms]', 'BM-CHICKENM-100GM-POU', '09109100', 115, 549, 6917, 1, 120, 120, 100.0, 549, 'Bharat Masala', 'BLENDED SPICES', 'POUCH', 100.0, 'gms', 'case', 'pieces', true, 50.0),
  ('Garam Masala Super (ACB) [50 gms]', 'BM-GARAMMAS-50GMS-ACB', '09109100', 51, 481, 4040, 1, 160, 160, 50.0, 481, 'Bharat Masala', 'BLENDED SPICES', 'ACB', 50.0, 'gms', 'case', 'pieces', true, 100.0)
ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, selling_price = EXCLUDED.selling_price;

-- Seed Default 5-Tier pricing groups for existing products
INSERT INTO public.product_price_tiers (
  product_id, tier_1_distributor, tier_2_super_stockist, tier_3_sub_stockist, tier_4_wholesale, tier_5_retail
)
SELECT 
  id,
  selling_price * 0.85, 
  selling_price * 0.90, 
  selling_price * 0.93, 
  selling_price * 0.96, 
  selling_price
FROM public.products
ON CONFLICT (product_id) DO NOTHING;

-- Complete analytical setups triggers activation
SELECT public.refresh_global_stats();

-- ============================================================================
-- SETUP COMPLETED SUCCESSFULLY
-- ============================================================================
