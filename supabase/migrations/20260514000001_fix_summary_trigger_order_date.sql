-- Fix summary tables trigger to prioritize order_date
CREATE OR REPLACE FUNCTION sync_daily_performance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_date date;
BEGIN
  -- Determine the target date: Delivered first, then Order Date, then Created At
  v_date := COALESCE(NEW.delivered_at, NEW.order_date, NEW.created_at)::date;

  -- Handle status-based metric synchronization
  -- We update the performance table by aggregating for that date
  INSERT INTO summary_daily_performance (date, revenue, profit, order_count, discounts_given)
  SELECT 
    v_date,
    COALESCE(SUM(CASE WHEN status = 'delivered' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'delivered' THEN (total - COALESCE(discount_amount, 0)) ELSE 0 END), 0), -- Placeholder: actual profit logic usually from line items
    COUNT(*),
    COALESCE(SUM(discount_amount), 0)
  FROM orders
  WHERE COALESCE(delivered_at, order_date, created_at)::date = v_date
    AND is_void = false
  ON CONFLICT (date) DO UPDATE
  SET 
    revenue = EXCLUDED.revenue,
    profit = EXCLUDED.profit,
    order_count = EXCLUDED.order_count,
    discounts_given = EXCLUDED.discounts_given,
    updated_at = NOW();

  RETURN NEW;
END;
$$;
