-- Migration: Fix Anonymous Invoices
-- Purpose: Update v_invoices_expanded to fall back to the shop name from the orders table if the invoice's shop_id is null.

BEGIN;

DROP VIEW IF EXISTS public.v_invoices_expanded CASCADE;
CREATE OR REPLACE VIEW public.v_invoices_expanded AS
SELECT 
    i.*,
    COALESCE(s.name, s_order.name, 'Anonymous') as shop_name,
    o.order_number
FROM 
    public.invoices i
LEFT JOIN 
    public.orders o ON i.order_id = o.id
LEFT JOIN 
    public.shops s ON i.shop_id = s.id
LEFT JOIN 
    public.shops s_order ON o.shop_id = s_order.id;

GRANT SELECT ON public.v_invoices_expanded TO authenticated;

-- Also heal any invoices with missing shop_id if they have an order_id
UPDATE public.invoices i
SET shop_id = o.shop_id
FROM public.orders o
WHERE i.order_id = o.id AND i.shop_id IS NULL;

COMMIT;
