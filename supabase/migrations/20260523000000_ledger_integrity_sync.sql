-- Migration: Ledger and Order Data Sync
-- Purpose: Ensure every invoice is strictly linked to a shop, either directly or via its parent order.
-- Adds a trigger to automatically sync shop_id and improves v_invoices_expanded resilience.

BEGIN;

-- 1. Create a function to auto-sync shop_id for invoices
CREATE OR REPLACE FUNCTION public.sync_invoice_shop_from_order()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.shop_id IS NULL AND NEW.order_id IS NOT NULL THEN
        SELECT shop_id INTO NEW.shop_id FROM public.orders WHERE id = NEW.order_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach trigger to invoices
DROP TRIGGER IF EXISTS trg_sync_invoice_shop ON public.invoices;
CREATE TRIGGER trg_sync_invoice_shop
BEFORE INSERT OR UPDATE OF order_id ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_shop_from_order();

-- 3. Immediate Data Repair: Sync existing unlinked invoices
UPDATE public.invoices i
SET shop_id = o.shop_id
FROM public.orders o
WHERE i.order_id = o.id AND i.shop_id IS NULL;

-- 4. Even more robust v_invoices_expanded
-- Includes shop details and falls back more aggressively
DROP VIEW IF EXISTS public.v_invoices_expanded CASCADE;
CREATE OR REPLACE VIEW public.v_invoices_expanded AS
SELECT 
    i.*,
    COALESCE(s.name, s_order.name, 'Unlinked System Client') as shop_name,
    COALESCE(s.shop_type, s_order.shop_type, 'basic') as shop_type,
    o.order_number,
    o.status as order_status,
    o.created_at as order_date
FROM 
    public.invoices i
LEFT JOIN 
    public.orders o ON i.order_id = o.id
LEFT JOIN 
    public.shops s ON i.shop_id = s.id
LEFT JOIN 
    public.shops s_order ON o.shop_id = s_order.id;

GRANT SELECT ON public.v_invoices_expanded TO authenticated;

COMMIT;
