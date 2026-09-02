-- Add shop_id to invoices for easier querying and relationship fix
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id);

-- Populate existing shop_id from orders
UPDATE public.invoices i
SET shop_id = o.shop_id
FROM public.orders o
WHERE i.order_id = o.id;

-- Make it required if possible (might have orphaned invoices, so let's check)
-- ALTER TABLE public.invoices ALTER COLUMN shop_id SET NOT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_invoices_shop_id ON public.invoices(shop_id);
