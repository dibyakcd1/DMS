-- Bharat Masala Complete Calculation Audit Fixes

-- CALC-BUG-1: Add discount_type to orders to preserve percentage vs flat state
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'flat';

-- CALC-BUG-3 & BUG-4 Re-fix: Ensure margin_report_view uses 'pcs'
DROP VIEW IF EXISTS public.margin_report_view CASCADE;
CREATE VIEW public.margin_report_view AS
WITH current_cost AS (
  SELECT product_id, AVG(landed_cost) as avg_landed_cost
  FROM public.inventory_batches WHERE remaining_qty > 0
  GROUP BY product_id
),
basic_unit_price AS (
  SELECT product_id, MIN(price) as standard_selling_price
  FROM public.product_price_tiers
  WHERE shop_type = 'basic' AND pack_type = 'pcs'
  GROUP BY product_id
)
SELECT
  p.id as product_id, p.name as product_name, p.sku,
  COALESCE(bup.standard_selling_price, p.mrp) as standard_selling_price,
  COALESCE(cc.avg_landed_cost, 0) as avg_landed_cost,
  CASE WHEN COALESCE(bup.standard_selling_price, p.mrp) > 0 THEN
    ((COALESCE(bup.standard_selling_price, p.mrp) - COALESCE(cc.avg_landed_cost, 0))
      / COALESCE(bup.standard_selling_price, p.mrp)) * 100
  ELSE 0 END as margin_percent
FROM public.products p
LEFT JOIN current_cost cc ON p.id = cc.product_id
LEFT JOIN basic_unit_price bup ON p.id = bup.product_id
WHERE p.is_active = true;

-- CALC-BUG-5 Re-fix: Remove OR true from v_product_stock
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE VIEW public.v_product_stock AS
WITH batch_aggregates AS (
    SELECT 
        product_id,
        SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0) as current_avg,
        (ARRAY_AGG(landed_cost ORDER BY received_at DESC, created_at DESC))[1] as last_landed
    FROM public.inventory_batches
    WHERE remaining_qty > 0 
    GROUP BY product_id
)
SELECT 
    p.*,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
      ELSE 1 
    END as calc_units_per_case,
    (COALESCE(i.stock_base_units, 0) <= p.min_stock) as is_low_stock,
    COALESCE(ba.current_avg, ba.last_landed, 0) as avg_landed_cost
FROM 
    public.products p
LEFT JOIN 
    public.inventory i ON p.id = i.product_id
LEFT JOIN
    batch_aggregates ba ON p.id = ba.product_id;

-- Recreate Warehouse-Specific Stock View
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
CREATE VIEW public.v_product_stock_warehouse AS
WITH batch_aggregates_wh AS (
    SELECT 
        product_id,
        warehouse_id,
        SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0) as current_avg,
        (ARRAY_AGG(landed_cost ORDER BY received_at DESC, created_at DESC))[1] as last_landed
    FROM public.inventory_batches
    WHERE remaining_qty > 0
    GROUP BY product_id, warehouse_id
)
SELECT 
    p.*,
    w.id as warehouse_id,
    w.name as warehouse_name,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
      ELSE 1 
    END as calc_units_per_case,
    (COALESCE(i.stock_base_units, 0) <= p.min_stock) as is_low_stock,
    COALESCE(ba.current_avg, ba.last_landed, (SELECT avg_landed_cost FROM public.v_product_stock WHERE id = p.id)) as avg_landed_cost
FROM 
    public.products p
CROSS JOIN 
    public.warehouses w
LEFT JOIN 
    public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id
LEFT JOIN
    batch_aggregates_wh ba ON p.id = ba.product_id AND w.id = ba.warehouse_id;

-- CALC-GAP-3: Enhance dispatch_order to handle weight/volume units
CREATE OR REPLACE FUNCTION public.dispatch_order(_order_id UUID, _dispatched_by UUID, _tracking_details JSONB DEFAULT NULL)
RETURNS boolean AS $body$
DECLARE
  v_batch RECORD;
  v_item RECORD;
  v_prod RECORD;
  v_needed NUMERIC;
  v_deducted NUMERIC;
  v_order_warehouse_id UUID;
  v_multiplier NUMERIC;
BEGIN
  -- 1. Get and Lock Order
  SELECT warehouse_id INTO v_order_warehouse_id FROM public.orders WHERE id = _order_id FOR UPDATE;
  
  IF v_order_warehouse_id IS NULL THEN
     SELECT id INTO v_order_warehouse_id FROM public.warehouses WHERE name = 'Main Warehouse' LIMIT 1;
     UPDATE public.orders SET warehouse_id = v_order_warehouse_id WHERE id = _order_id;
  END IF;

  -- 2. Process items
  FOR v_item IN SELECT * FROM public.order_items WHERE order_id = _order_id LOOP
    SELECT * INTO v_prod FROM public.products WHERE id = v_item.product_id;
    
    -- Multiplier logic
    v_multiplier := 1;
    IF v_item.pack_type = 'case' THEN
      v_multiplier := COALESCE(v_prod.units_per_packet, 1) * COALESCE(v_prod.packets_per_case, 1);
      IF v_multiplier = 1 AND COALESCE(v_prod.units_per_case, 0) > 0 THEN
        v_multiplier := v_prod.units_per_case;
      END IF;
    ELSIF v_item.pack_type = 'packet' THEN
      v_multiplier := COALESCE(v_prod.units_per_packet, 1);
    ELSIF v_item.pack_type = 'ltr' THEN
      IF v_prod.pack_size_value > 0 THEN
        IF LOWER(v_prod.pack_size_unit) IN ('ml') THEN
          v_multiplier := 1000.0 / v_prod.pack_size_value;
        ELSIF LOWER(v_prod.pack_size_unit) IN ('ltr', 'l') THEN
          v_multiplier := 1.0 / v_prod.pack_size_value;
        END IF;
      END IF;
    ELSIF v_item.pack_type IN ('g', 'ml') THEN
      IF v_prod.pack_size_value > 0 THEN
        IF LOWER(v_prod.pack_size_unit) IN ('g', 'gms', 'grams', 'gm', 'ml') THEN
          v_multiplier := 1.0 / v_prod.pack_size_value;
        ELSE
          v_multiplier := 0.001 / v_prod.pack_size_value;
        END IF;
      END IF;
    ELSIF v_item.pack_type = 'kg' THEN
       IF v_prod.pack_size_value > 0 THEN
        IF LOWER(v_prod.pack_size_unit) IN ('g', 'gms', 'grams', 'gm', 'ml') THEN
          v_multiplier := 1000.0 / v_prod.pack_size_value;
        ELSE
          v_multiplier := 1.0 / v_prod.pack_size_value;
        END IF;
      END IF;
    END IF;

    v_needed := v_item.quantity * v_multiplier;
    
    -- FIFO Deduction
    FOR v_batch IN 
      SELECT * FROM public.inventory_batches 
      WHERE product_id = v_item.product_id 
      AND warehouse_id = v_order_warehouse_id
      AND remaining_qty > 0 
      ORDER BY expiry_date ASC, created_at ASC 
      FOR UPDATE
    LOOP
      IF v_needed <= 0 THEN EXIT; END IF;
      
      v_deducted := LEAST(v_needed, v_batch.remaining_qty);
      
      UPDATE public.inventory_batches 
      SET remaining_qty = remaining_qty - v_deducted 
      WHERE id = v_batch.id;
      
      v_needed := v_needed - v_deducted;
      
      INSERT INTO public.stock_ledger (
        product_id, batch_id, qty_transacted, entry_type, 
        reference_id, reference_type, created_by
      ) VALUES (
        v_item.product_id, v_batch.id, -v_deducted, 'sale', 
        _order_id, 'order', _dispatched_by
      );
    END LOOP;
    
    IF v_needed > 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product % in warehouse % (Missing % units)', 
        v_prod.name,
        (SELECT name FROM public.warehouses WHERE id = v_order_warehouse_id),
        v_needed;
    END IF;

    PERFORM public.recompute_inventory(v_item.product_id);
  END LOOP;

  UPDATE public.orders SET 
    status = 'dispatched', 
    dispatched_at = now(),
    updated_at = now()
  WHERE id = _order_id;

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- CALC-GAP-4: Fix trg_stock_adjustment schema and recreation
DROP TRIGGER IF EXISTS trg_stock_adjustment ON public.stock_adjustments;
CREATE TRIGGER trg_stock_adjustment
AFTER INSERT ON public.stock_adjustments
FOR EACH ROW EXECUTE FUNCTION public.handle_stock_adjustment();

-- CALC-BUG-4 (Improvement): realized_margin_view with net_margin_percent
DROP VIEW IF EXISTS public.realized_margin_view CASCADE;
CREATE VIEW public.realized_margin_view AS
WITH batch_costs AS (
    SELECT 
        obd.order_item_id,
        SUM(obd.qty_base_units * ib.landed_cost) as total_landed_cost,
        COUNT(obd.id) as batches_involved
    FROM public.order_batch_deductions obd
    JOIN public.inventory_batches ib ON obd.batch_id = ib.id
    GROUP BY obd.order_item_id
),
order_weights AS (
    -- Calculate weight/proportions for discount distribution
    SELECT 
        order_id,
        SUM(line_total_tax_exclusive) as total_revenue
    FROM public.order_items
    GROUP BY order_id
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
    -- Net margin accounting for distributed discount
    CASE
        WHEN ow.total_revenue > 0 THEN
            (COALESCE(oi.line_total_tax_exclusive, oi.line_total) / ow.total_revenue) * COALESCE(o.discount_amount, 0)
        ELSE 0
    END as distributed_discount,
    o.status as order_status
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
JOIN public.shops s ON o.shop_id = s.id
JOIN public.products p ON oi.product_id = p.id
LEFT JOIN batch_costs bc ON oi.id = bc.order_item_id
LEFT JOIN order_weights ow ON o.id = ow.order_id
WHERE o.status IN ('dispatched', 'delivered');

GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;
GRANT SELECT ON public.margin_report_view TO authenticated;
GRANT SELECT ON public.realized_margin_view TO authenticated;
