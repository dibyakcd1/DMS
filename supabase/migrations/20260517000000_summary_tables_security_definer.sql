-- Migration: Summary Tables Security Definer Fix
-- Purpose: Set trigger functions to SECURITY DEFINER so they can update summary tables regardless of user RLS.

BEGIN;

-- 1. Update sync_daily_performance to SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.sync_daily_performance()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.summary_daily_performance (date, revenue, profit, order_count, delivered_count, discounts_given, cogs)
    SELECT 
        COALESCE(NEW.delivered_at, NEW.created_at)::date,
        SUM(CASE WHEN status IN ('delivered', 'dispatched') AND is_void = false THEN total ELSE 0 END),
        0, 
        COUNT(*) FILTER (WHERE is_void = false),
        SUM(CASE WHEN status = 'delivered' AND is_void = false THEN 1 ELSE 0 END),
        SUM(CASE WHEN is_void = false THEN COALESCE(discount_amount, 0) ELSE 0 END),
        0
    FROM public.orders
    WHERE (COALESCE(NEW.delivered_at, NEW.created_at)::date = COALESCE(delivered_at, created_at)::date)
    GROUP BY 1
    ON CONFLICT (date) DO UPDATE SET
        revenue = EXCLUDED.revenue,
        order_count = EXCLUDED.order_count,
        delivered_count = EXCLUDED.delivered_count,
        discounts_given = EXCLUDED.discounts_given,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update sync_stock_summary to SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.sync_stock_summary()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.summary_product_stock (product_id, warehouse_id, total_qty, updated_at)
    SELECT 
        NEW.product_id,
        NEW.warehouse_id,
        SUM(COALESCE(stock_base_units, 0)),
        NOW()
    FROM public.inventory
    WHERE product_id = NEW.product_id AND warehouse_id = NEW.warehouse_id
    GROUP BY 1, 2
    ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
        total_qty = EXCLUDED.total_qty,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update refresh_global_stats to SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.refresh_global_stats()
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.summary_global_stats (key, val_json, updated_at)
    SELECT 
        'financial_summary',
        jsonb_build_object('total_outstanding', SUM(total_outstanding_balance)),
        NOW()
    FROM public.v_shop_balances
    ON CONFLICT (key) DO UPDATE SET
        val_json = EXCLUDED.val_json,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update sync_global_stats_trigger to SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.sync_global_stats_trigger()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.refresh_global_stats();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
