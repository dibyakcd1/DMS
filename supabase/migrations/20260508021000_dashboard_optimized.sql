
-- Migration: Optimized Product Stock View & Dashboard RPC
-- Aims to improve performance for Catalog and Home pages.

BEGIN;

-- 1. Optimized v_product_stock View
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

CREATE VIEW public.v_product_stock AS
WITH stock_agg AS (
    SELECT 
        product_id, 
        SUM(COALESCE(stock_base_units, 0)) as total_stock
    FROM public.inventory
    GROUP BY product_id
)
SELECT 
  p.*,
  COALESCE(s.total_stock, 0) as stock_base_units,
  COALESCE(s.total_stock, 0) as stock_pcs,
  -- Calculate units per case using standardized logic
  CASE 
    WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
    WHEN COALESCE(p.units_per_case, 0) > 0 THEN p.units_per_case
    WHEN COALESCE(p.case_qty_value, 0) > 0 AND COALESCE(p.pack_size_value, 0) > 0 THEN
      CASE 
        WHEN lower(p.case_qty_unit) = 'kg' AND lower(p.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') THEN (p.case_qty_value * 1000.0) / p.pack_size_value
        WHEN lower(p.case_qty_unit) = lower(p.pack_size_unit) THEN p.case_qty_value / p.pack_size_value
        ELSE 1
      END
    ELSE 1 
  END as calc_units_per_case,
  CASE 
    WHEN COALESCE(p.units_per_packet, 1) > 1 THEN FLOOR(COALESCE(s.total_stock, 0)::numeric / p.units_per_packet)
    ELSE COALESCE(s.total_stock, 0)
  END as stock_packets,
  (COALESCE(s.total_stock, 0) <= p.min_stock) as is_low_stock
FROM 
  public.products p
LEFT JOIN 
  stock_agg s ON p.id = s.product_id;

-- 2. Dashboard Stats RPC
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON AS $body$
DECLARE
    result JSON;
    pending_count INT;
    approved_count INT;
    dispatched_count INT;
    delivered_today_count INT;
    sales_today_val NUMERIC;
    outstanding_val NUMERIC;
    low_stock_json JSON;
    expiring_json JSON;
    top_shops_json JSON;
    trend_json JSON;
    recent_json JSON;
    pending_queue_json JSON;
BEGIN
    -- Basic counts
    SELECT count(*) INTO pending_count FROM public.orders WHERE status = 'pending_approval';
    SELECT count(*) INTO approved_count FROM public.orders WHERE status = 'approved';
    SELECT count(*) INTO dispatched_count FROM public.orders WHERE status = 'dispatched';
    
    -- Delivered Today metrics
    SELECT COALESCE(sum(total), 0), count(*) INTO sales_today_val, delivered_today_count 
    FROM public.orders 
    WHERE status = 'delivered' AND delivered_at >= CURRENT_DATE;

    -- Financial Outstanding
    SELECT COALESCE(sum(total - amount_paid), 0) INTO outstanding_val 
    FROM public.invoices 
    WHERE payment_status != 'paid';

    -- Low Stock Items (Top 5 critical)
    SELECT json_agg(t) INTO low_stock_json FROM (
        SELECT id, name, min_stock, stock_base_units as quantity, units_per_packet, pack_size_value, pack_size_unit
        FROM public.v_product_stock
        WHERE is_active = true AND is_low_stock = true
        ORDER BY (stock_base_units / NULLIF(min_stock, 0)) ASC
        LIMIT 5
    ) t;

    -- Expiring Batches (Next 30 days)
    SELECT json_agg(t) INTO expiring_json FROM (
        SELECT b.id, b.batch_number, b.expiry_date, b.remaining_qty, b.product_id, p.name as product_name
        FROM public.inventory_batches b
        JOIN public.products p ON b.product_id = p.id
        WHERE b.remaining_qty > 0 AND b.expiry_date <= (CURRENT_DATE + INTERVAL '30 days')
        ORDER BY b.expiry_date ASC
        LIMIT 5
    ) t;

    -- Top Shops Performance (Rolling Month)
    SELECT json_agg(t) INTO top_shops_json FROM (
        SELECT s.id as shop_id, s.name, sum(o.total) as total
        FROM public.orders o
        JOIN public.shops s ON o.shop_id = s.id
        WHERE o.status = 'delivered' AND o.delivered_at >= date_trunc('month', CURRENT_DATE)
        GROUP BY s.id, s.name
        ORDER BY total DESC
        LIMIT 5
    ) t;

    -- 7 Day Revenue Trend
    SELECT json_agg(t) INTO trend_json FROM (
        SELECT d.date::text, COALESCE(sum(o.total), 0) as total
        FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d(date)
        LEFT JOIN public.orders o ON date_trunc('day', o.delivered_at) = d.date AND o.status = 'delivered'
        GROUP BY d.date
        ORDER BY d.date ASC
    ) t;

    -- Pending Approval Queue Details (Full objects for immediate action)
    SELECT json_agg(t) INTO pending_queue_json FROM (
        SELECT 
            o.id, 
            o.order_number, 
            o.total, 
            o.created_at, 
            o.salesperson_id,
            s.name as shop_name,
            pr.full_name as salesperson_name
        FROM public.orders o
        JOIN public.shops s ON o.shop_id = s.id
        LEFT JOIN public.profiles pr ON o.salesperson_id = pr.id
        WHERE o.status = 'pending_approval'
        ORDER BY o.created_at ASC
        LIMIT 5
    ) t;

    -- Recent Activity Loop (Top 5 overall)
    SELECT json_agg(t) INTO recent_json FROM (
        SELECT o.id, o.order_number, o.status, o.total, o.created_at, s.name as shop_name
        FROM public.orders o
        LEFT JOIN public.shops s ON o.shop_id = s.id
        ORDER BY o.created_at DESC
        LIMIT 5
    ) t;

    -- Aggregate into final object
    result := json_build_object(
        'pending', pending_count,
        'approved', approved_count,
        'dispatched', dispatched_count,
        'deliveredToday', delivered_today_count,
        'salesToday', COALESCE(sales_today_val, 0),
        'outstanding', COALESCE(outstanding_val, 0),
        'lowStock', COALESCE(low_stock_json, '[]'::json),
        'expiring', COALESCE(expiring_json, '[]'::json),
        'topShops', COALESCE(top_shops_json, '[]'::json),
        'trend', COALESCE(trend_json, '[]'::json),
        'pendingQueue', COALESCE(pending_queue_json, '[]'::json),
        'recent', COALESCE(recent_json, '[]'::json)
    );

    RETURN result;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grants
GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

COMMIT;
