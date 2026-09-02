-- MIGRATION: DASHBOARD-STALENESS-FIX
-- Purpose: Ensure dashboard stats refresh when invoices are voided or modified.

BEGIN;

-- Add trigger for invoices to refresh global stats
DROP TRIGGER IF EXISTS trg_sync_global_stats_invoices ON public.invoices;
CREATE TRIGGER trg_sync_global_stats_invoices
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_global_stats_trigger();

-- Ensure sync_daily_performance also looks at is_void correctly
CREATE OR REPLACE FUNCTION public.sync_daily_performance()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.summary_daily_performance (date, revenue, profit, order_count, delivered_count, discounts_given, cogs)
    SELECT 
        COALESCE(delivered_at, created_at)::date,
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
$$ LANGUAGE plpgsql;

-- Manually refresh stats one time to ensure consistency
SELECT public.refresh_global_stats();

COMMIT;
