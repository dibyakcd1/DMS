-- FINAL GLOBAL STOCK RECOVERY & FORCE SYNC
-- Purpose: 1. Repair view column mismatch. 2. Manifest missed batches for posted GRNs. 3. Rebuild summary table.

-- DROP VIEW FIRST to avoid column mismatch errors (42P16)
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

DO $body$
BEGIN
  -- 1. Ensure all products are active if they have stock (safety measure)
  UPDATE public.products p
  SET is_active = true
  FROM public.inventory_batches ib
  WHERE p.id = ib.product_id AND ib.remaining_qty > 0 AND p.is_active = false;

  -- 2. Clean up any orphaned inventory summaries
  DELETE FROM public.inventory i
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = i.product_id);

  -- 3. DATA RECOVERY: Manifest batches for GRNs that were posted but missed batch creation
  -- Only runs for items that have NO matches in inventory_batches for that specific invoice.
  INSERT INTO public.inventory_batches (
    product_id,
    purchase_invoice_id,
    batch_number,
    received_qty,
    remaining_qty,
    cost_price,
    landed_cost,
    expiry_date,
    mfg_date,
    received_at
  )
  SELECT 
    pii.product_id,
    pi.id,
    pi.invoice_number || '-RECO-' || substr(md5(random()::text), 1, 4),
    -- Qty Calc:
    CASE 
      WHEN pii.pack_type = 'case' THEN pii.quantity * COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)
      WHEN pii.pack_type = 'packet' THEN pii.quantity * COALESCE(p.units_per_packet, 1)
      ELSE pii.quantity
    END,
    CASE 
      WHEN pii.pack_type = 'case' THEN pii.quantity * COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)
      WHEN pii.pack_type = 'packet' THEN pii.quantity * COALESCE(p.units_per_packet, 1)
      ELSE pii.quantity
    END,
    -- Cost Calc:
    CASE 
      WHEN pii.pack_type = 'case' THEN pii.unit_cost / (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN pii.pack_type = 'packet' THEN pii.unit_cost / COALESCE(p.units_per_packet, 1)
      ELSE pii.unit_cost
    END,
    CASE 
      WHEN pii.pack_type = 'case' THEN pii.unit_cost / (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN pii.pack_type = 'packet' THEN pii.unit_cost / COALESCE(p.units_per_packet, 1)
      ELSE pii.unit_cost
    END,
    COALESCE(pii.expiry_date, (pi.invoice_date + interval '1 year')::date),
    pii.mfg_date,
    pi.invoice_date::timestamptz
  FROM public.purchase_invoices pi
  JOIN public.purchase_invoice_items pii ON pi.id = pii.purchase_invoice_id
  JOIN public.products p ON pii.product_id = p.id
  LEFT JOIN public.inventory_batches ib ON pi.id = ib.purchase_invoice_id AND pii.product_id = ib.product_id
  WHERE pi.status = 'posted'
    AND ib.id IS NULL;

  -- 4. Rebuild inventory table from the absolute truth (batches)
  WITH batch_sums AS (
    SELECT 
      product_id, 
      SUM(remaining_qty) as total_qty,
      MAX(received_at) as last_update
    FROM public.inventory_batches
    GROUP BY product_id
  )
  INSERT INTO public.inventory (product_id, quantity, updated_at)
  SELECT 
    bs.product_id,
    bs.total_qty,
    COALESCE(bs.last_update, now())
  FROM batch_sums bs
  ON CONFLICT (product_id) 
  DO UPDATE SET 
    quantity = EXCLUDED.quantity,
    updated_at = EXCLUDED.updated_at;

END $body$;

-- 5. Fix the search view to be even more resilient
CREATE VIEW public.v_product_stock AS
SELECT 
  p.*,
  COALESCE(i.quantity, 0) as stock_base_units,
  COALESCE(i.quantity, 0) as stock_pcs,
  (
    SELECT AVG(landed_cost) 
    FROM public.inventory_batches ib 
    WHERE ib.product_id = p.id AND ib.remaining_qty > 0
  ) as avg_landed_cost,
  CASE 
    WHEN COALESCE(p.units_per_packet, 1) > 0 THEN floor(COALESCE(i.quantity, 0) / COALESCE(p.units_per_packet, 1))
    ELSE 0 
  END as stock_packets,
  CASE 
    WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 0 
    THEN floor(COALESCE(i.quantity, 0) / (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)))
    ELSE 0 
  END as stock_cases,
  COALESCE(i.quantity, 0) <= COALESCE(p.min_stock, 0) as is_low_stock,
  i.updated_at as last_stock_update
FROM public.products p
LEFT JOIN public.inventory i ON p.id = i.product_id;
