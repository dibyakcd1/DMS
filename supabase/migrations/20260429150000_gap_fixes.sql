-- BM Gap fixes (2026-04-29)

-- 1. Landed Cost Tracking
ALTER TABLE public.inventory_batches ADD COLUMN IF NOT EXISTS landed_cost numeric(10,2);
-- Initialize landed_cost with cost_price if null
UPDATE public.inventory_batches SET landed_cost = cost_price WHERE landed_cost IS NULL;

-- 2. Preferred Sell Unit and Packaging
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preferred_sell_unit public.pack_type DEFAULT 'case';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rbp_unit numeric(10,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS rbp_carton numeric(10,2) DEFAULT 0;

-- Rename or comment for clarity if needed (done via frontend labeling)
COMMENT ON COLUMN public.products.rbp_unit IS 'Regular Business Price per Unit (e.g., 1Kg bag price when bought as loose unit)';
COMMENT ON COLUMN public.products.rbp_carton IS 'Regular Business Price per Carton (total amount for full carton)';

-- 3. Margin Report View
CREATE OR REPLACE VIEW public.margin_report_view AS
SELECT 
  p.id as product_id,
  p.name as product_name,
  p.sku,
  p.selling_price as standard_selling_price,
  COALESCE(avg_cost.avg_landed_cost, 0) as avg_landed_cost,
  CASE 
    WHEN p.selling_price > 0 THEN 
      ((p.selling_price - COALESCE(avg_cost.avg_landed_cost, 0)) / p.selling_price) * 100 
    ELSE 0 
  END as margin_percent
FROM public.products p
LEFT JOIN (
  SELECT product_id, AVG(landed_cost) as avg_landed_cost
  FROM public.inventory_batches
  WHERE remaining_qty > 0
  GROUP BY product_id
) avg_cost ON p.id = avg_cost.product_id
WHERE p.is_active = true;

-- 4. Shop Credit Balance Check Function
CREATE OR REPLACE FUNCTION public.get_shop_outstanding_balance(target_shop_id uuid)
RETURNS numeric(12,2)
LANGUAGE sql STABLE SECURITY DEFINER
AS $body$
  SELECT COALESCE(SUM(i.total - i.amount_paid), 0)
  FROM public.invoices i
  JOIN public.orders o ON i.order_id = o.id
  WHERE o.shop_id = target_shop_id
  AND i.payment_status <> 'paid';
$body$;
