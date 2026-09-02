-- Migration: Expanded Views for Orders and Invoices
-- Purpose: Simplify searching and fetching by providing flat views with shop and salesperson names.

BEGIN;

DROP VIEW IF EXISTS public.v_orders_expanded CASCADE;
CREATE OR REPLACE VIEW public.v_orders_expanded AS
SELECT 
    o.*,
    s.name as shop_name,
    p.full_name as salesperson_name
FROM 
    public.orders o
LEFT JOIN 
    public.shops s ON o.shop_id = s.id
LEFT JOIN 
    public.profiles p ON o.salesperson_id = p.id;

DROP VIEW IF EXISTS public.v_invoices_expanded CASCADE;
CREATE OR REPLACE VIEW public.v_invoices_expanded AS
SELECT 
    i.*,
    s.name as shop_name,
    o.order_number
FROM 
    public.invoices i
LEFT JOIN 
    public.shops s ON i.shop_id = s.id
LEFT JOIN 
    public.orders o ON i.order_id = o.id;

GRANT SELECT ON public.v_orders_expanded TO authenticated;
GRANT SELECT ON public.v_invoices_expanded TO authenticated;

COMMIT;
