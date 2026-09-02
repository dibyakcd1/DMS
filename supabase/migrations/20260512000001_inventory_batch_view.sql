-- Migration: Inventory Batch Details View
-- Purpose: Provide a flat view for inventory batches with product and warehouse info for easier searching.

BEGIN;

DROP VIEW IF EXISTS public.v_inventory_batch_details CASCADE;

CREATE OR REPLACE VIEW public.v_inventory_batch_details AS
SELECT 
    ib.id,
    ib.product_id,
    ib.warehouse_id,
    ib.batch_number,
    ib.expiry_date,
    ib.remaining_qty,
    ib.received_qty,
    ib.cost_price,
    ib.landed_cost,
    ib.received_at,
    ib.mfg_date,
    ib.notes,
    ib.created_at,
    -- Product Info
    p.name as product_name,
    p.sku as product_sku,
    p.mrp as product_mrp,
    p.min_stock as product_min_stock,
    p.units_per_packet as product_units_per_packet,
    p.packets_per_case as product_packets_per_case,
    p.item_pack_type as product_item_pack_type,
    p.division_category as product_division_category,
    p.pack_size_value as product_pack_size_value,
    p.pack_size_unit as product_pack_size_unit,
    -- Warehouse Info
    w.name as warehouse_name,
    w.code as warehouse_code
FROM 
    public.inventory_batches ib
LEFT JOIN 
    public.products p ON ib.product_id = p.id
LEFT JOIN 
    public.warehouses w ON ib.warehouse_id = w.id;

GRANT SELECT ON public.v_inventory_batch_details TO authenticated;

COMMIT;
