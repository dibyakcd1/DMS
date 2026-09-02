-- Migration: Profitability View for Orders
-- Purpose: Calculate total landed cost for orders by joining batch deductions.

BEGIN;

CREATE OR REPLACE VIEW public.v_order_batch_costs AS
SELECT 
    obd.order_id,
    obd.order_item_id,
    obd.batch_id,
    obd.qty_base_units,
    ib.landed_cost,
    (obd.qty_base_units * ib.landed_cost) as item_total_cost
FROM 
    public.order_batch_deductions obd
JOIN 
    public.inventory_batches ib ON obd.batch_id = ib.id;

GRANT SELECT ON public.v_order_batch_costs TO authenticated;

COMMIT;
