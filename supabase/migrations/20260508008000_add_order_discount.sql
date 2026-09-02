-- Add discount_amount to orders and invoices
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0;

-- Update the total calculation in existing views or logic if necessary
-- Usually total = subtotal + gst - discount
