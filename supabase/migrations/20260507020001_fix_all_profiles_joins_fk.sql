-- Fix other auditing relationships to allow joining public.profiles

-- 1. Invoices created_by
ALTER TABLE IF EXISTS public.invoices
DROP CONSTRAINT IF EXISTS invoices_created_by_profiles_fkey;

ALTER TABLE public.invoices
ADD CONSTRAINT invoices_created_by_profiles_fkey
FOREIGN KEY (created_by)
REFERENCES public.profiles(id);

-- 2. Payments received_by
ALTER TABLE IF EXISTS public.payments
DROP CONSTRAINT IF EXISTS payments_received_by_profiles_fkey;

ALTER TABLE public.payments
ADD CONSTRAINT payments_received_by_profiles_fkey
FOREIGN KEY (received_by)
REFERENCES public.profiles(id);

-- 3. GRN approval logs performed_by
ALTER TABLE IF EXISTS public.grn_approval_log
DROP CONSTRAINT IF EXISTS grn_approval_log_performed_by_profiles_fkey;

ALTER TABLE public.grn_approval_log
ADD CONSTRAINT grn_approval_log_performed_by_profiles_fkey
FOREIGN KEY (performed_by)
REFERENCES public.profiles(id);

-- 4. Inventory batches received_by
ALTER TABLE IF EXISTS public.inventory_batches
DROP CONSTRAINT IF EXISTS inventory_batches_received_by_profiles_fkey;

ALTER TABLE public.inventory_batches
ADD CONSTRAINT inventory_batches_received_by_profiles_fkey
FOREIGN KEY (received_by)
REFERENCES public.profiles(id);

-- 5. Purchase Invoices created_by
ALTER TABLE IF EXISTS public.purchase_invoices
DROP CONSTRAINT IF EXISTS purchase_invoices_created_by_profiles_fkey;

ALTER TABLE public.purchase_invoices
ADD CONSTRAINT purchase_invoices_created_by_profiles_fkey
FOREIGN KEY (created_by)
REFERENCES public.profiles(id);
