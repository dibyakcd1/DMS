
-- Add missing 'unit' column to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS unit text;

-- Add missing columns to purchase_invoice_items to support detailed GRN tracking
ALTER TABLE public.purchase_invoice_items
ADD COLUMN IF NOT EXISTS pack_type text,
ADD COLUMN IF NOT EXISTS units_per_packet integer,
ADD COLUMN IF NOT EXISTS packets_per_case integer,
ADD COLUMN IF NOT EXISTS expiry_date date,
ADD COLUMN IF NOT EXISTS mfg_date date;

-- Add missing columns to purchase_invoices
ALTER TABLE public.purchase_invoices
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS total_freight numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_handling numeric DEFAULT 0;

-- Expand pack_type enum for better categorization
-- Note: ALTER TYPE ... ADD VALUE cannot be executed in a transaction block
DO $body$ 
BEGIN
  BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'pouch';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'box';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'jar';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'bottle';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'tin';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'can';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'acb';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
  BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'sachet';
  EXCEPTION WHEN duplicate_object THEN null;
  END;
END $body$;

-- Add missing columns to inventory_batches
ALTER TABLE public.inventory_batches
ADD COLUMN IF NOT EXISTS landed_cost numeric;

-- Create grn_approval_log table
CREATE TABLE IF NOT EXISTS public.grn_approval_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid REFERENCES public.purchase_invoices(id),
  action text NOT NULL,
  performed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Ensure inventory has standard columns if needed later
ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS last_audit_at timestamp with time zone;
