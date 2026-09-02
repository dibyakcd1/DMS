-- MIGRATION: G1 & G6 - GST Refinement & Actual Margin Analysis
-- 1. Add precise GST columns to order_items for better reporting
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS line_total_tax_exclusive NUMERIC(15,2);
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS line_tax_amount NUMERIC(15,2);

-- Update existing data (Assume current line_total is tax exclusive as per G1)
UPDATE public.order_items 
SET line_total_tax_exclusive = line_total,
    line_tax_amount = line_total * (gst_rate / 100.0)
WHERE line_total_tax_exclusive IS NULL;

-- 2. Create the Realized Margin View (Actual Sales Analysis)
-- This view joins sales items with their exact batch deductions to find true profit.
DROP VIEW IF EXISTS public.realized_margin_view;

CREATE OR REPLACE VIEW public.realized_margin_view AS
WITH batch_costs AS (
    SELECT 
        obd.order_item_id,
        SUM(obd.qty_base_units * ib.landed_cost) as total_landed_cost,
        COUNT(obd.id) as batches_involved
    FROM public.order_batch_deductions obd
    JOIN public.inventory_batches ib ON obd.batch_id = ib.id
    GROUP BY obd.order_item_id
)
SELECT 
    oi.id as order_item_id,
    o.id as order_id,
    o.order_number,
    o.order_date,
    s.name as shop_name,
    p.name as product_name,
    p.sku,
    oi.quantity,
    oi.pack_type,
    oi.unit_price as sale_price_per_unit,
    COALESCE(oi.line_total_tax_exclusive, oi.line_total) as revenue_exclusive,
    COALESCE(bc.total_landed_cost, 0) as cost_exclusive,
    COALESCE(bc.total_landed_cost, 0) / NULLIF(oi.quantity, 0) as avg_landed_cost,
    (COALESCE(oi.line_total_tax_exclusive, oi.line_total) - COALESCE(bc.total_landed_cost, 0)) as realized_profit_total,
    CASE 
        WHEN COALESCE(oi.line_total_tax_exclusive, oi.line_total) > 0 THEN 
            ((COALESCE(oi.line_total_tax_exclusive, oi.line_total) - COALESCE(bc.total_landed_cost, 0)) / COALESCE(oi.line_total_tax_exclusive, oi.line_total)) * 100 
        ELSE 0 
    END as realized_margin_percent,
    o.status as order_status
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
JOIN public.shops s ON o.shop_id = s.id
JOIN public.products p ON oi.product_id = p.id
LEFT JOIN batch_costs bc ON oi.id = bc.order_item_id
WHERE o.status IN ('dispatched', 'delivered');
