-- MIGRATION: SUMMARY-TABLES-V1
-- Purpose: Implement pre-calculated summary tables for high-performance reporting and dashboard metrics.
-- Requirement C: Add Summary Tables (dashboard metrics, stock totals, daily sales)

BEGIN;

-- 1. Daily Sales & Performance Summary
CREATE TABLE IF NOT EXISTS public.summary_daily_performance (
    date DATE PRIMARY KEY,
    revenue NUMERIC DEFAULT 0,
    profit NUMERIC DEFAULT 0,
    order_count INT DEFAULT 0,
    delivered_count INT DEFAULT 0,
    discounts_given NUMERIC DEFAULT 0,
    cogs NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Product Stock Summary (Materialized view style but in a table for speed)
CREATE TABLE IF NOT EXISTS public.summary_product_stock (
    product_id UUID REFERENCES public.products(id),
    warehouse_id UUID REFERENCES public.warehouses(id),
    total_qty NUMERIC DEFAULT 0,
    valuation NUMERIC DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (product_id, warehouse_id)
);

-- 3. Global Stats Summary (Singleton storage for dashboard cards)
DROP TABLE IF EXISTS public.summary_global_stats CASCADE;
CREATE TABLE public.summary_global_stats (
    key TEXT PRIMARY KEY,
    val_numeric NUMERIC,
    val_json JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Shop Balances View (Required for financial summary)
CREATE OR REPLACE VIEW public.v_shop_balances AS
SELECT 
    s.id as shop_id,
    s.name as shop_name,
    COALESCE(SUM(i.total - i.amount_paid), 0) as total_outstanding_balance
FROM public.shops s
LEFT JOIN public.invoices i ON s.id = i.shop_id AND i.payment_status != 'paid' AND i.is_void = false
GROUP BY s.id, s.name;

-- Trigger Function to Update Daily Performance
CREATE OR REPLACE FUNCTION public.sync_daily_performance()
RETURNS TRIGGER AS $$
BEGIN
    -- This is a simplified version. In production, we'd calculate delta from OLD and NEW.
    -- For now, let's just mark that the date needs refreshing or do an UPSERT.
    
    INSERT INTO public.summary_daily_performance (date, revenue, profit, order_count, delivered_count, discounts_given, cogs)
    SELECT 
        COALESCE(NEW.delivered_at, NEW.created_at)::date,
        SUM(CASE WHEN status IN ('delivered', 'dispatched') AND is_void = false THEN total ELSE 0 END),
        0, -- Profit needs item level calc, usually done via a separate sync
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
$$ LANGUAGE plpgsql;

-- Trigger to Update Stock Summary
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
$$ LANGUAGE plpgsql;

-- Function to Refresh Global Stats
CREATE OR REPLACE FUNCTION public.refresh_global_stats()
RETURNS VOID AS $$
BEGIN
    -- Update financial summary
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
$$ LANGUAGE plpgsql;

-- Trigger Function to Update Global Stats
CREATE OR REPLACE FUNCTION public.sync_global_stats_trigger()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.refresh_global_stats();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply Triggers
DROP TRIGGER IF EXISTS trg_sync_daily_perf ON public.orders;
CREATE TRIGGER trg_sync_daily_perf
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_daily_performance();

-- We can trigger global stats update when orders change (as they affect balance)
-- Or when payments are made.
DROP TRIGGER IF EXISTS trg_sync_global_stats_orders ON public.orders;
CREATE TRIGGER trg_sync_global_stats_orders
AFTER INSERT OR UPDATE ON public.orders
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_global_stats_trigger();

DROP TRIGGER IF EXISTS trg_sync_global_stats_payments ON public.payments;
CREATE TRIGGER trg_sync_global_stats_payments
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_global_stats_trigger();


DROP TRIGGER IF EXISTS trg_sync_stock_summary ON public.inventory;
CREATE TRIGGER trg_sync_stock_summary
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.sync_stock_summary();

-- Initial Seed
INSERT INTO public.summary_daily_performance (date, revenue, order_count, delivered_count, discounts_given)
SELECT 
    COALESCE(delivered_at, created_at)::date as d,
    SUM(CASE WHEN status IN ('delivered', 'dispatched') THEN total ELSE 0 END),
    COUNT(*),
    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END),
    SUM(COALESCE(discount_amount, 0))
FROM public.orders
WHERE is_void = false
GROUP BY 1
ON CONFLICT (date) DO NOTHING;

INSERT INTO public.summary_product_stock (product_id, warehouse_id, total_qty)
SELECT product_id, warehouse_id, SUM(COALESCE(stock_base_units, 0))
FROM public.inventory
GROUP BY 1, 2
ON CONFLICT (product_id, warehouse_id) DO NOTHING;

-- Seed Global Stats
SELECT public.refresh_global_stats();

COMMIT;
