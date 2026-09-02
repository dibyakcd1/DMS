-- MIGRATION: STOCK-6, CALC-3 - View Optimization & Freight Distribution
-- This migration optimizes the product stock views and updates the GRN posting RPC to handle freight distribution.

-- 1. Optimized Product Stock View (STOCK-6)
DROP VIEW IF EXISTS public.v_product_stock CASCADE;
CREATE VIEW public.v_product_stock AS
WITH batch_aggregates AS (
    SELECT 
        product_id,
        SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0) as current_avg,
        (ARRAY_AGG(landed_cost ORDER BY received_at DESC, created_at DESC))[1] as last_landed
    FROM public.inventory_batches
    WHERE remaining_qty > 0 OR true -- Include all for last_landed fallback
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

-- 2. Optimized Warehouse-Specific Stock View (STOCK-6)
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
CREATE VIEW public.v_product_stock_warehouse AS
WITH batch_aggregates_wh AS (
    SELECT 
        product_id,
        warehouse_id,
        SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0) as current_avg,
        (ARRAY_AGG(landed_cost ORDER BY received_at DESC, created_at DESC))[1] as last_landed
    FROM public.inventory_batches
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

-- 3. Update post_grn to distribute freight (CALC-3)
CREATE OR REPLACE FUNCTION public.post_grn(_grn_id UUID, _performed_by UUID)
RETURNS boolean AS $body$
DECLARE
  v_grn RECORD;
  v_item RECORD;
  v_product RECORD;
  v_base_qty NUMERIC;
  v_unit_landed NUMERIC;
  v_batch_id UUID;
  v_multiplier NUMERIC;
  v_upc NUMERIC;
  v_main_wh_id UUID;
  v_total_weight NUMERIC := 0;
  v_total_units NUMERIC := 0;
  v_item_weight NUMERIC;
  v_freight_portion NUMERIC;
  v_subtotal NUMERIC;
BEGIN
  -- 1. Fetch and Lock GRN
  SELECT * INTO v_grn FROM public.purchase_invoices WHERE id = _grn_id FOR UPDATE;
  
  IF v_grn.status = 'posted' THEN
    RAISE EXCEPTION 'GRN already posted';
  END IF;

  v_subtotal := v_grn.total_amount - COALESCE(v_grn.total_freight, 0) - COALESCE(v_grn.total_handling, 0);
  IF v_subtotal <= 0 THEN v_subtotal := 1; END IF; -- Prevent division by zero

  SELECT id INTO v_main_wh_id FROM public.warehouses WHERE name = 'Main Warehouse' LIMIT 1;

  -- 1.1 Calculate distribution metrics
  FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = _grn_id LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
    
    v_upc := (COALESCE(v_item.units_per_packet, 1) * COALESCE(v_item.packets_per_case, 1));
    
    IF v_item.pack_type = 'case' THEN
      v_multiplier := v_upc;
    ELSIF v_item.pack_type = 'packet' THEN
      v_multiplier := COALESCE(v_item.units_per_packet, 1);
    ELSIF v_item.pack_type = 'kg' OR v_item.pack_type = 'ltr' THEN
      IF (v_product.pack_size_unit IN ('g', 'gms', 'gm', 'grams', 'ml')) THEN
          v_multiplier := 1000.0 / COALESCE(v_product.pack_size_value, 1);
      ELSE
          v_multiplier := 1.0 / COALESCE(v_product.pack_size_value, 1);
      END IF;
    ELSIF v_item.pack_type = 'g' OR v_item.pack_type = 'ml' THEN
      IF (v_product.pack_size_unit IN ('g', 'gms', 'gm', 'grams', 'ml')) THEN
          v_multiplier := 1.0 / COALESCE(v_product.pack_size_value, 1);
      ELSE
          v_multiplier := 0.001 / COALESCE(v_product.pack_size_value, 1);
      END IF;
    ELSE
      v_multiplier := 1.0;
    END IF;

    v_base_qty := v_item.quantity * v_multiplier;
    v_total_weight := v_total_weight + (v_base_qty * COALESCE(v_product.weight_per_unit_grams, 0));
    v_total_units := v_total_units + v_base_qty;
  END LOOP;

  -- 2. Iterate items
  FOR v_item IN SELECT * FROM public.purchase_invoice_items WHERE purchase_invoice_id = _grn_id LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
    
    v_upc := (COALESCE(v_item.units_per_packet, 1) * COALESCE(v_item.packets_per_case, 1));
    
    IF v_item.pack_type = 'case' THEN
      v_multiplier := v_upc;
    ELSIF v_item.pack_type = 'packet' THEN
      v_multiplier := COALESCE(v_item.units_per_packet, 1);
    ELSIF v_item.pack_type = 'kg' OR v_item.pack_type = 'ltr' THEN
      IF (v_product.pack_size_unit IN ('g', 'gms', 'gm', 'grams', 'ml')) THEN
          v_multiplier := 1000.0 / COALESCE(v_product.pack_size_value, 1);
      ELSE
          v_multiplier := 1.0 / COALESCE(v_product.pack_size_value, 1);
      END IF;
    ELSIF v_item.pack_type = 'g' OR v_item.pack_type = 'ml' THEN
      IF (v_product.pack_size_unit IN ('g', 'gms', 'gm', 'grams', 'ml')) THEN
          v_multiplier := 1.0 / COALESCE(v_product.pack_size_value, 1);
      ELSE
          v_multiplier := 0.001 / COALESCE(v_product.pack_size_value, 1);
      END IF;
    ELSE
      v_multiplier := 1.0;
    END IF;

    v_base_qty := v_item.quantity * v_multiplier;
    
    -- Distribute Freight (CALC-3)
    -- If total_weight > 0, distribute by weight. OTHERWISE distribute by invoice value.
    IF COALESCE(v_grn.total_freight, 0) > 0 THEN
      IF v_total_weight > 0 AND COALESCE(v_product.weight_per_unit_grams, 0) > 0 THEN
        v_freight_portion := (v_grn.total_freight * (v_base_qty * v_product.weight_per_unit_grams)) / v_total_weight;
      ELSE
        -- Fallback to Value-based allocation if weight is missing
        v_freight_portion := (v_grn.total_freight * v_item.line_total) / v_subtotal;
      END IF;
    ELSE
      v_freight_portion := 0;
    END IF;

    -- Landed cost = (Total cost of line + portion of freight) / total base units
    v_unit_landed := (v_item.line_total + v_freight_portion) / v_base_qty;

    -- 3. Create Batch
    INSERT INTO public.inventory_batches (
      product_id, 
      warehouse_id,
      purchase_invoice_id, 
      batch_number, 
      received_qty, 
      remaining_qty, 
      cost_price, 
      landed_cost, 
      expiry_date, 
      mfg_date, 
      received_at, 
      received_by
    ) VALUES (
      v_item.product_id, 
      v_main_wh_id,
      _grn_id, 
      v_grn.invoice_number || '-' || upper(substring(gen_random_uuid()::text, 1, 4)),
      v_base_qty, 
      v_base_qty, 
      v_item.unit_cost / v_multiplier, -- base unit cost
      v_unit_landed,
      COALESCE(v_item.expiry_date, (now() + interval '1 year')::date),
      v_item.mfg_date,
      v_grn.invoice_date,
      _performed_by
    ) RETURNING id INTO v_batch_id;

    -- 4. Log to Stock Ledger
    INSERT INTO public.stock_ledger (
      product_id, batch_id, qty_transacted, entry_type, 
      reference_id, reference_type, created_by
    ) VALUES (
      v_item.product_id, v_batch_id, v_base_qty, 'purchase', 
      _grn_id, 'grn', _performed_by
    );

    PERFORM public.recompute_inventory(v_item.product_id);
  END LOOP;

  UPDATE public.purchase_invoices SET status = 'posted' WHERE id = _grn_id;
  
  INSERT INTO public.grn_approval_log (grn_id, action, performed_by, notes)
  VALUES (_grn_id, 'posted', _performed_by, 'GRN posted via optimized RPC with freight distribution');

  RETURN true;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;
