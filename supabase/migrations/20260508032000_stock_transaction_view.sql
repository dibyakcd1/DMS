
-- MIGRATION: ENHANCED INVENTORY TRANSACTION AUDIT VIEW
-- Fixed shops.address column, added purchase details, and optimized join logic.

BEGIN;

DROP VIEW IF EXISTS public.v_stock_ledger_details;

CREATE OR REPLACE VIEW public.v_stock_ledger_details AS
SELECT 
    sl.id,
    sl.created_at,
    sl.qty_transacted,
    sl.entry_type,
    sl.reference_type,
    sl.reference_id,
    sl.notes,
    -- Product Details
    p.id as product_id,
    p.name as product_name,
    p.sku as product_sku,
    p.units_per_packet,
    p.packets_per_case,
    -- Batch Details
    ib.batch_number,
    -- Order/Shop Details (if applicable)
    o.id as order_id,
    o.order_number,
    o.status as order_status,
    s.id as shop_id,
    s.name as shop_name,
    s.address as shop_location,
    -- Purchase Details (if applicable)
    pi.invoice_number as purchase_invoice_number,
    pi.supplier_name,
    -- Transfer Details (if applicable)
    wt.id as transfer_id,
    fwh.name as from_warehouse_name,
    twh.name as to_warehouse_name,
    -- Responsible User
    pr.full_name as created_by_name
FROM 
    public.stock_ledger sl
LEFT JOIN public.products p ON sl.product_id = p.id
LEFT JOIN public.inventory_batches ib ON sl.batch_id = ib.id
LEFT JOIN public.profiles pr ON sl.created_by = pr.id
-- Join for Orders
LEFT JOIN public.orders o ON (
    sl.reference_type = 'order' 
    AND sl.reference_id = o.id::text
)
LEFT JOIN public.shops s ON o.shop_id = s.id
-- Join for Purchase Invoices
LEFT JOIN public.purchase_invoices pi ON (
    (sl.reference_type = 'purchase_invoice' OR sl.reference_type = 'purchase')
    AND sl.reference_id = pi.id::text
)
-- Join for Warehouse Transfers
LEFT JOIN public.warehouse_transfers wt ON (
    sl.reference_type = 'transfer'
    AND sl.reference_id = wt.id::text
)
LEFT JOIN public.warehouses fwh ON wt.from_warehouse_id = fwh.id
LEFT JOIN public.warehouses twh ON wt.to_warehouse_id = twh.id;

-- Grant access
GRANT SELECT ON public.v_stock_ledger_details TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
