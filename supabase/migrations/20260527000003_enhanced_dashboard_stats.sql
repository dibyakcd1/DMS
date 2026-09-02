
-- MIGRATION: ENHANCED-DASHBOARD-STATS
-- Purpose: Add inventory valuation, warehouse split and today's collections to existing dashboard stats.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_warehouse_id UUID DEFAULT NULL)
RETURNS JSON AS $$
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
    top_salespeople_json JSON;
    trend_json JSON;
    recent_json JSON;
    pending_queue_json JSON;
    
    -- New Fields
    total_inventory_val NUMERIC;
    warehouse_split_json JSON;
    today_collections_val NUMERIC;
BEGIN
    -- 1. Original Stats Logic
    SELECT count(*) INTO pending_count FROM public.orders WHERE status = 'pending_approval' AND is_void = false AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
    SELECT count(*) INTO approved_count FROM public.orders WHERE status = 'approved' AND is_void = false AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
    SELECT count(*) INTO dispatched_count FROM public.orders WHERE status = 'dispatched' AND is_void = false AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);
    
    IF p_warehouse_id IS NULL THEN
        SELECT COALESCE(VAL, 0), COALESCE(delivered_count, 0)
        FROM (SELECT revenue as VAL, delivered_count FROM public.summary_daily_performance WHERE date = CURRENT_DATE) x
        INTO sales_today_val, delivered_today_count;
    ELSE
        SELECT COALESCE(SUM(total), 0), COUNT(*) FILTER (WHERE status = 'delivered')
        INTO sales_today_val, delivered_today_count
        FROM public.orders
        WHERE (delivered_at::date = CURRENT_DATE OR dispatched_at::date = CURRENT_DATE)
        AND is_void = false AND warehouse_id = p_warehouse_id;
    END IF;

    IF p_warehouse_id IS NULL THEN
        SELECT COALESCE((val_json->>'total_outstanding')::numeric, 0) INTO outstanding_val FROM public.summary_global_stats WHERE key = 'financial_summary';
    ELSE
        SELECT COALESCE(SUM(i.total - i.amount_paid), 0) INTO outstanding_val
        FROM public.invoices i JOIN public.orders o ON i.order_id = o.id
        WHERE i.payment_status != 'paid' AND i.is_void = false AND o.warehouse_id = p_warehouse_id;
    END IF;

    SELECT json_agg(t) INTO low_stock_json FROM (
        SELECT id, name, min_stock, stock_base_units as quantity, units_per_packet, pack_size_value, pack_size_unit
        FROM public.v_product_stock_warehouse
        WHERE is_active = true AND stock_base_units <= min_stock AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
        ORDER BY (stock_base_units / NULLIF(min_stock, 0)) ASC LIMIT 5
    ) t;

    SELECT json_agg(t) INTO expiring_json FROM (
        SELECT b.id, b.batch_number, b.expiry_date, b.remaining_qty, b.product_id, p.name as product_name
        FROM public.inventory_batches b JOIN public.products p ON b.product_id = p.id
        WHERE b.remaining_qty > 0 AND b.expiry_date <= (CURRENT_DATE + INTERVAL '30 days') AND (p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id)
        ORDER BY b.expiry_date ASC LIMIT 5
    ) t;

    SELECT json_agg(t) INTO top_shops_json FROM (
        SELECT s.id as shop_id, s.name, sum(o.total) as total
        FROM public.orders o JOIN public.shops s ON o.shop_id = s.id
        WHERE o.status IN ('delivered', 'dispatched') AND (o.delivered_at >= date_trunc('month', CURRENT_DATE) OR o.dispatched_at >= date_trunc('month', CURRENT_DATE))
        AND o.is_void = false AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        GROUP BY s.id, s.name ORDER BY total DESC LIMIT 5
    ) t;

    SELECT json_agg(t) INTO top_salespeople_json FROM (
        SELECT pr.full_name as name, sum(o.total) as total
        FROM public.orders o JOIN public.profiles pr ON o.salesperson_id = pr.id
        WHERE o.status IN ('delivered', 'dispatched') AND (o.delivered_at >= date_trunc('month', CURRENT_DATE) OR o.dispatched_at >= date_trunc('month', CURRENT_DATE))
        AND o.is_void = false AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        GROUP BY pr.id, pr.full_name ORDER BY total DESC LIMIT 5
    ) t;

    IF p_warehouse_id IS NULL THEN
        SELECT json_agg(t) INTO trend_json FROM (
            SELECT d.date::text, COALESCE(s.revenue, 0) as total
            FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d(date)
            LEFT JOIN public.summary_daily_performance s ON s.date = d.date::date ORDER BY d.date ASC
        ) t;
    ELSE
        SELECT json_agg(t) INTO trend_json FROM (
            SELECT d.date::text, COALESCE(SUM(o.total), 0) as total
            FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d(date)
            LEFT JOIN public.orders o ON (o.delivered_at::date = d.date::date OR o.dispatched_at::date = d.date::date) AND o.is_void = false AND o.warehouse_id = p_warehouse_id
            GROUP BY d.date ORDER BY d.date ASC
        ) t;
    END IF;

    SELECT json_agg(t) INTO pending_queue_json FROM (
        SELECT o.id, o.order_number, o.total, o.created_at, o.salesperson_id, s.name as shop_name, pr.full_name as salesperson_name
        FROM public.orders o JOIN public.shops s ON o.shop_id = s.id LEFT JOIN public.profiles pr ON o.salesperson_id = pr.id
        WHERE o.status = 'pending_approval' AND o.is_void = false AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        ORDER BY o.created_at ASC LIMIT 5
    ) t;

    SELECT json_agg(t) INTO recent_json FROM (
        SELECT o.id, o.order_number, o.status, o.total, o.created_at, s.name as shop_name, i.payment_status
        FROM public.orders o 
        LEFT JOIN public.shops s ON o.shop_id = s.id
        LEFT JOIN public.invoices i ON i.order_id = o.id AND i.is_void = false
        WHERE o.is_void = false AND (p_warehouse_id IS NULL OR o.warehouse_id = p_warehouse_id)
        ORDER BY o.created_at DESC LIMIT 5
    ) t;

    -- 2. New Stats Logic
    -- Inventory Valuation
    SELECT COALESCE(SUM(remaining_qty * landed_cost), 0) INTO total_inventory_val
    FROM public.inventory_batches WHERE remaining_qty > 0 AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

    -- Warehouse Split
    IF p_warehouse_id IS NULL THEN
        SELECT json_agg(t) INTO warehouse_split_json FROM (
            SELECT w.name, w.code, COALESCE(SUM(ib.remaining_qty * ib.landed_cost), 0) as total_value, COUNT(DISTINCT ib.product_id) as item_count
            FROM public.warehouses w LEFT JOIN public.inventory_batches ib ON w.id = ib.warehouse_id AND ib.remaining_qty > 0
            WHERE w.is_active = true GROUP BY w.id, w.name, w.code ORDER BY total_value DESC
        ) t;
    ELSE
        warehouse_split_json := '[]'::json;
    END IF;

    -- Today's Collections
    SELECT COALESCE(SUM(amount), 0) INTO today_collections_val
    FROM public.payments WHERE created_at::date = CURRENT_DATE;

    -- 3. Final Result
    result := json_build_object(
        'pending', pending_count,
        'approved', approved_count,
        'dispatched', dispatched_count,
        'deliveredToday', COALESCE(delivered_today_count, 0),
        'salesToday', COALESCE(sales_today_val, 0),
        'outstanding', COALESCE(outstanding_val, 0),
        'lowStock', COALESCE(low_stock_json, '[]'::json),
        'expiring', COALESCE(expiring_json, '[]'::json),
        'topShops', COALESCE(top_shops_json, '[]'::json),
        'topSalespeople', COALESCE(top_salespeople_json, '[]'::json),
        'trend', COALESCE(trend_json, '[]'::json),
        'pendingQueue', COALESCE(pending_queue_json, '[]'::json),
        'recent', COALESCE(recent_json, '[]'::json),
        'totalInventoryValue', total_inventory_val,
        'warehouseSplit', COALESCE(warehouse_split_json, '[]'::json),
        'todayCollections', today_collections_val
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID) TO anon;

COMMIT;
