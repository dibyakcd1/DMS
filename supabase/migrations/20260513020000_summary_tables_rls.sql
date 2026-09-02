-- Migration: Summary Tables RLS
-- Purpose: Enable RLS and add policies for summary tables.

BEGIN;

-- 1. Daily Performance Summary
ALTER TABLE public.summary_daily_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated to view daily performance" ON public.summary_daily_performance;
CREATE POLICY "Allow authenticated to view daily performance"
ON public.summary_daily_performance FOR SELECT
TO authenticated
USING (true);

-- 2. Product Stock Summary
ALTER TABLE public.summary_product_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated to view product stock summary" ON public.summary_product_stock;
CREATE POLICY "Allow authenticated to view product stock summary"
ON public.summary_product_stock FOR SELECT
TO authenticated
USING (true);

-- 3. Global Stats Summary
ALTER TABLE public.summary_global_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated to view global stats" ON public.summary_global_stats;
CREATE POLICY "Allow authenticated to view global stats"
ON public.summary_global_stats FOR SELECT
TO authenticated
USING (true);

COMMIT;
