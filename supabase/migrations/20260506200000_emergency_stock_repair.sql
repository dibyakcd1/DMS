-- RECONSTRUCT MISSING STOCK FROM POSTED GRNS
-- This script ensures all data is consistent and repairs broken stock records.

DO $body$
BEGIN
  -- 1. DATA SANITY: Repair Products Multipliers
  UPDATE public.products
  SET 
    units_per_packet = COALESCE(NULLIF(units_per_packet, 0), 1),
    packets_per_case = COALESCE(NULLIF(packets_per_case, 0), 1)
  WHERE units_per_packet = 0 OR packets_per_case = 0 OR units_per_packet IS NULL OR packets_per_case IS NULL;

  -- 2. REPAIR: Create missing batches for POSTED purchase invoices
  -- We look for purchase invoices marked as 'posted' but that have no batches in inventory_batches.
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
    pi.invoice_number || '-AUTO-' || substr(md5(random()::text), 1, 4),
    -- Calculation:
    CASE 
      WHEN pii.pack_type = 'case' THEN pii.quantity * p.units_per_packet * p.packets_per_case
      WHEN pii.pack_type = 'packet' THEN pii.quantity * p.units_per_packet
      ELSE pii.quantity
    END as base_qty,
    CASE 
      WHEN pii.pack_type = 'case' THEN pii.quantity * p.units_per_packet * p.packets_per_case
      WHEN pii.pack_type = 'packet' THEN pii.quantity * p.units_per_packet
      ELSE pii.quantity
    END as rem_qty,
    -- Unit Cost Calculation:
    CASE 
      WHEN pii.pack_type = 'case' THEN pii.unit_cost / (p.units_per_packet * p.packets_per_case)
      WHEN pii.pack_type = 'packet' THEN pii.unit_cost / p.units_per_packet
      ELSE pii.unit_cost
    END as unit_cost,
    CASE 
      WHEN pii.pack_type = 'case' THEN pii.unit_cost / (p.units_per_packet * p.packets_per_case)
      WHEN pii.pack_type = 'packet' THEN pii.unit_cost / p.units_per_packet
      ELSE pii.unit_cost
    END as unit_landed,
    COALESCE(pii.expiry_date, (pi.invoice_date + interval '1 year')::date),
    pii.mfg_date,
    pi.invoice_date::timestamptz
  FROM public.purchase_invoices pi
  JOIN public.purchase_invoice_items pii ON pi.id = pii.purchase_invoice_id
  JOIN public.products p ON pii.product_id = p.id
  LEFT JOIN public.inventory_batches ib ON pi.id = ib.purchase_invoice_id AND pii.product_id = ib.product_id
  WHERE pi.status = 'posted'
    AND (ib.id IS NULL OR ib.remaining_qty = 0);

  -- 3. GLOBAL RECONCILIATION
  -- This will update the 'inventory' summary table from the repaired/new batches.
  INSERT INTO public.inventory (product_id, quantity, updated_at)
  SELECT product_id, SUM(remaining_qty), now()
  FROM public.inventory_batches
  GROUP BY product_id
  ON CONFLICT (product_id) DO UPDATE SET 
    quantity = EXCLUDED.quantity,
    updated_at = now();

END $body$;
