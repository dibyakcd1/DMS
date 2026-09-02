-- Fix salesperson relationship in orders to allow joining public.profiles
ALTER TABLE IF EXISTS public.orders
DROP CONSTRAINT IF EXISTS orders_salesperson_id_fkey;

ALTER TABLE public.orders
ADD CONSTRAINT orders_salesperson_id_fkey
FOREIGN KEY (salesperson_id)
REFERENCES public.profiles(id);

-- Also fix approved_by if needed, but profiles usually doesn't have all users if they aren't salespeople?
-- Actually, all users should have a profile based on the trigger.

ALTER TABLE IF EXISTS public.orders
DROP CONSTRAINT IF EXISTS orders_approved_by_fkey;

ALTER TABLE public.orders
ADD CONSTRAINT orders_approved_by_fkey
FOREIGN KEY (approved_by)
REFERENCES public.profiles(id);

-- Fix invoice_number not-null constraint violation by adding a default
ALTER TABLE IF EXISTS public.invoices ALTER COLUMN invoice_number SET DEFAULT '';
