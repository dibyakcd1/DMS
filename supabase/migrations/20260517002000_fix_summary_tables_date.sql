-- Fix: Summary tables trigger uses created_at, not order_date
-- Purpose: Ensure daily performance summary buckets use business date (order_date) when available.

BEGIN;

-- Update the trigger function
CREATE OR REPLACE FUNCTION public.sync_daily_performance()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.summary_daily_performance (date, revenue, profit, order_count, delivered_count, discounts_given, cogs)
    SELECT 
        COALESCE(NEW.delivered_at, NEW.order_date, NEW.created_at)::date,
        SUM(CASE WHEN status IN ('delivered', 'dispatched') AND is_void = false THEN total ELSE 0 END),
        0, 
        COUNT(*) FILTER (WHERE is_void = false),
        SUM(CASE WHEN status = 'delivered' AND is_void = false THEN 1 ELSE 0 END),
        SUM(CASE WHEN is_void = false THEN COALESCE(discount_amount, 0) ELSE 0 END),
        0
    FROM public.orders
    WHERE (COALESCE(NEW.delivered_at, NEW.order_date, NEW.created_at)::date = COALESCE(delivered_at, order_date, created_at)::date)
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

-- Re-sync existing data using correct date logic
INSERT INTO public.summary_daily_performance (date, revenue, order_count, delivered_count, discounts_given)
SELECT 
    COALESCE(delivered_at, order_date, created_at)::date as d,
    SUM(CASE WHEN status IN ('delivered', 'dispatched', 'approved') AND is_void = false THEN total ELSE 0 END),
    COUNT(*) FILTER (WHERE is_void = false),
    SUM(CASE WHEN status = 'delivered' AND is_void = false THEN 1 ELSE 0 END),
    SUM(CASE WHEN is_void = false THEN COALESCE(discount_amount, 0) ELSE 0 END)
FROM public.orders
WHERE is_void = false
GROUP BY 1
ON CONFLICT (date) DO UPDATE SET
    revenue = EXCLUDED.revenue,
    order_count = EXCLUDED.order_count,
    delivered_count = EXCLUDED.delivered_count,
    discounts_given = EXCLUDED.discounts_given,
    updated_at = NOW();

COMMIT;
