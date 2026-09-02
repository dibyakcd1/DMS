-- MIGRATION: Force Recompute All Inventory
-- This ensures that the inventory table accurately reflects the sum of all remaining_qty in inventory_batches.
-- It also fixes any discrepancies caused by missing fields in previous GRN posting attempts.

DO $body$ 
BEGIN
  -- 1. Persistent function for RPC calling (returns boolean for compatibility)
  CREATE OR REPLACE FUNCTION public.recompute_all_inventory()
  RETURNS boolean AS $inner$
  BEGIN
    INSERT INTO public.inventory (product_id, quantity, updated_at)
    SELECT 
      p.id,
      COALESCE(SUM(ib.remaining_qty), 0),
      now()
    FROM public.products p
    LEFT JOIN public.inventory_batches ib ON p.id = ib.product_id
    GROUP BY p.id
    ON CONFLICT (product_id) DO UPDATE SET
      quantity = EXCLUDED.quantity,
      updated_at = now();
      
    RETURN true;
  END;
  $inner$ LANGUAGE plpgsql SECURITY DEFINER;

  -- Grant permissions
  GRANT EXECUTE ON FUNCTION public.recompute_all_inventory() TO authenticated;
  GRANT EXECUTE ON FUNCTION public.recompute_all_inventory() TO service_role;

  -- 2. Repair batches with missing fields from previous failed posts
  -- This fixes batches created when the select query was missing fields, causing multiplier to default to 1.
  -- Only affects batches that haven't been sold from yet.
  UPDATE public.inventory_batches ib
  SET 
    received_qty = pii.quantity * (
      CASE 
        WHEN pii.pack_type = 'packet' THEN COALESCE(p.units_per_packet, 1)
        WHEN pii.pack_type = 'case' THEN COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)
        WHEN pii.pack_type = 'kg' THEN 
           CASE 
             WHEN LOWER(p.pack_size_unit) IN ('g', 'gms', 'grams', 'ml') AND p.pack_size_value > 0 THEN 1000.0 / p.pack_size_value
             WHEN LOWER(p.pack_size_unit) IN ('kg', 'kilogram', 'l', 'ltr') AND p.pack_size_value > 0 THEN 1.0 / p.pack_size_value
             ELSE 1
           END
        ELSE 1
      END
    ),
    remaining_qty = pii.quantity * (
      CASE 
        WHEN pii.pack_type = 'packet' THEN COALESCE(p.units_per_packet, 1)
        WHEN pii.pack_type = 'case' THEN COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)
        WHEN pii.pack_type = 'kg' THEN 
           CASE 
             WHEN LOWER(p.pack_size_unit) IN ('g', 'gms', 'grams', 'ml') AND p.pack_size_value > 0 THEN 1000.0 / p.pack_size_value
             WHEN LOWER(p.pack_size_unit) IN ('kg', 'kilogram', 'l', 'ltr') AND p.pack_size_value > 0 THEN 1.0 / p.pack_size_value
             ELSE 1
           END
        ELSE 1
      END
    ),
    landed_cost = pii.unit_cost / (
      CASE 
        WHEN pii.pack_type = 'packet' THEN COALESCE(p.units_per_packet, 1)
        WHEN pii.pack_type = 'case' THEN COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)
        WHEN pii.pack_type = 'kg' THEN 
           CASE 
             WHEN LOWER(p.pack_size_unit) IN ('g', 'gms', 'grams', 'ml') AND p.pack_size_value > 0 THEN 1000.0 / p.pack_size_value
             WHEN LOWER(p.pack_size_unit) IN ('kg', 'kilogram', 'l', 'ltr') AND p.pack_size_value > 0 THEN 1.0 / p.pack_size_value
             ELSE 1
           END
        ELSE 1
      END
    ),
    cost_price = pii.unit_cost / (
      CASE 
        WHEN pii.pack_type = 'packet' THEN COALESCE(p.units_per_packet, 1)
        WHEN pii.pack_type = 'case' THEN COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)
        WHEN pii.pack_type = 'kg' THEN 
           CASE 
             WHEN LOWER(p.pack_size_unit) IN ('g', 'gms', 'grams', 'ml') AND p.pack_size_value > 0 THEN 1000.0 / p.pack_size_value
             WHEN LOWER(p.pack_size_unit) IN ('kg', 'kilogram', 'l', 'ltr') AND p.pack_size_value > 0 THEN 1.0 / p.pack_size_value
             ELSE 1
           END
        ELSE 1
      END
    )
  FROM public.purchase_invoice_items pii
  JOIN public.products p ON pii.product_id = p.id
  WHERE ib.purchase_invoice_id = pii.purchase_invoice_id 
    AND ib.product_id = pii.product_id
    AND ib.received_qty = ib.remaining_qty; -- ONLY fix untouched batches

  -- 3. Execute the recompute
  PERFORM public.recompute_all_inventory();
  
END $body$;
