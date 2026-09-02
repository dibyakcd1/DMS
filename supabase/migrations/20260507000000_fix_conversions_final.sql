-- FINAL CONSOLIDATED CONVERSION FIX (V4 - ROBUST + HISTORY FIX)
-- This migration applies the robust packaging conversion logic and fixes existing data.

-- 0. Fix Inventory Table Schema
DO $body$
BEGIN
    -- Ensure stock_base_units exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'stock_base_units') THEN
        -- If quantity exists, rename it. If not, create it.
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'quantity') THEN
            ALTER TABLE public.inventory RENAME COLUMN quantity TO stock_base_units;
        ELSE
            ALTER TABLE public.inventory ADD COLUMN stock_base_units numeric(10,2) DEFAULT 0;
        END IF;
    END IF;
    
    -- Ensure it's numeric(10,2)
    ALTER TABLE public.inventory ALTER COLUMN stock_base_units TYPE numeric(10,2);

    -- Ensure warehouse_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'warehouse_id') THEN
        ALTER TABLE public.inventory ADD COLUMN warehouse_id uuid;
    END IF;

    -- Ensure last_updated_at exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'last_updated_at') THEN
        ALTER TABLE public.inventory ADD COLUMN last_updated_at timestamptz DEFAULT now();
    END IF;
END $body$;

-- 1. Create robust convert_to_base_units
DROP FUNCTION IF EXISTS public.convert_to_base_units(UUID, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID, 
  p_qty NUMERIC, 
  p_unit TEXT
)
RETURNS NUMERIC AS $body$
DECLARE
  v_upp INTEGER;
  v_upc INTEGER;
  v_ppc INTEGER;
  v_psv NUMERIC;
  v_psu TEXT;
  v_cqv NUMERIC;
  v_cqu TEXT;
BEGIN
  SELECT 
    units_per_packet, 
    units_per_case, 
    packets_per_case,
    pack_size_value, 
    pack_size_unit,
    case_qty_value,
    case_qty_unit
  INTO v_upp, v_upc, v_ppc, v_psv, v_psu, v_cqv, v_cqu
  FROM public.products 
  WHERE id = p_product_id;
  
  v_psu := lower(COALESCE(v_psu, 'g'));
  v_cqu := lower(COALESCE(v_cqu, 'kg'));
  
  -- Handle 'kg' sold unit
  IF lower(trim(p_unit)) = 'kg' THEN
    IF v_psu IN ('g', 'gms', 'gm', 'grams') AND COALESCE(v_psv, 0) > 0 THEN
      RETURN (p_qty * 1000.0) / v_psv;
    ELSIF v_psu IN ('kg', 'kgs', 'kilograms') AND COALESCE(v_psv, 0) > 0 THEN
      RETURN p_qty / v_psv;
    ELSE
      RETURN p_qty; -- Fallback
    END IF;
  
  -- Handle 'packet' / 'pkt' sold unit
  ELSIF lower(trim(p_unit)) IN ('packet', 'pkt', 'packets') THEN
    RETURN p_qty * COALESCE(v_upp, 1);
  
  -- Handle 'case' sold unit (ROBUST)
  ELSIF lower(trim(p_unit)) = 'case' THEN
    IF (COALESCE(v_upp, 1) * COALESCE(v_ppc, 1)) > 1 THEN
      RETURN p_qty * (COALESCE(v_upp, 1) * COALESCE(v_ppc, 1));
    ELSIF COALESCE(v_upc, 1) > 1 THEN
      RETURN p_qty * v_upc;
    ELSIF COALESCE(v_cqv, 0) > 0 AND COALESCE(v_psv, 0) > 0 THEN
      IF v_cqu = 'kg' AND v_psu IN ('g', 'gms', 'gm', 'grams') THEN
        RETURN p_qty * ((v_cqv * 1000.0) / v_psv);
      ELSIF v_cqu = v_psu THEN
        RETURN p_qty * (v_cqv / v_psv);
      END IF;
    END IF;
    RETURN p_qty * COALESCE(v_upc, 1);
    
  ELSE -- 'unit', 'pcs', 'pouch'
    RETURN p_qty;
  END IF;
END;
$body$ LANGUAGE plpgsql;

-- 2. Update Historical Data in stock_ledger
DO $body$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='stock_ledger') THEN
        UPDATE public.stock_ledger sl
        SET base_units_delta = CASE 
            WHEN qty_transacted < 0 THEN -public.convert_to_base_units(sl.product_id, ABS(sl.qty_transacted), sl.sell_unit_used::text)
            ELSE public.convert_to_base_units(sl.product_id, ABS(sl.qty_transacted), sl.sell_unit_used::text)
        END
        WHERE sell_unit_used IS NOT NULL;
    END IF;
END $body$;

-- 3. Fix deduct_stock
DROP FUNCTION IF EXISTS public.deduct_stock(uuid, numeric, public.sell_unit, text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.deduct_stock(
  p_product_id uuid,
  p_qty_sold numeric,
  p_sell_unit_used public.sell_unit,
  p_reference_type text,
  p_reference_id uuid DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  v_base_units_to_deduct numeric;
  v_stock_before numeric;
  v_stock_after numeric;
BEGIN
  -- Calculate using the robust converter
  v_base_units_to_deduct := public.convert_to_base_units(p_product_id, p_qty_sold, p_sell_unit_used::text);

  -- Get current stock
  SELECT COALESCE(stock_base_units, 0) INTO v_stock_before
  FROM public.inventory
  WHERE product_id = p_product_id AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL));

  IF v_stock_before IS NULL THEN 
    v_stock_before := 0;
    -- Ensure row exists
    INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units)
    VALUES (p_product_id, p_warehouse_id, 0)
    ON CONFLICT DO NOTHING;
  END IF;

  v_stock_after := v_stock_before - v_base_units_to_deduct;

  UPDATE public.inventory 
  SET stock_base_units = v_stock_after, last_updated_at = now()
  WHERE product_id = p_product_id AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL));

  INSERT INTO public.stock_ledger (
    product_id, reference_type, reference_id, sell_unit_used, 
    qty_transacted, base_units_delta, stock_before, stock_after, notes
  ) VALUES (
    p_product_id, p_reference_type, p_reference_id, p_sell_unit_used,
    -p_qty_sold, -v_base_units_to_deduct, v_stock_before, v_stock_after,
    'Stock deduction (dispatched)'
  );

  RETURN jsonb_build_object(
    'stock_after', v_stock_after,
    'base_units_deducted', v_base_units_to_deduct
  );
END;
$body$;

-- 4. Fix add_stock
DROP FUNCTION IF EXISTS public.add_stock(uuid, numeric, public.sell_unit, text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.add_stock(
  p_product_id uuid,
  p_qty numeric,
  p_sell_unit_used public.sell_unit,
  p_reference_type text,
  p_reference_id uuid DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $body$
DECLARE
  v_base_units_to_add numeric;
  v_stock_before numeric;
  v_stock_after numeric;
BEGIN
  v_base_units_to_add := public.convert_to_base_units(p_product_id, p_qty, p_sell_unit_used::text);

  SELECT COALESCE(stock_base_units, 0) INTO v_stock_before
  FROM public.inventory
  WHERE product_id = p_product_id AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL));

  IF v_stock_before IS NULL THEN 
    v_stock_before := 0;
    INSERT INTO public.inventory (product_id, warehouse_id, stock_base_units)
    VALUES (p_product_id, p_warehouse_id, 0)
    ON CONFLICT DO NOTHING;
  END IF;

  v_stock_after := v_stock_before + v_base_units_to_add;
  UPDATE public.inventory 
  SET stock_base_units = v_stock_after, last_updated_at = now()
  WHERE product_id = p_product_id AND (warehouse_id = p_warehouse_id OR (warehouse_id IS NULL AND p_warehouse_id IS NULL));

  INSERT INTO public.stock_ledger (
    product_id, reference_type, reference_id, sell_unit_used, 
    qty_transacted, base_units_delta, stock_before, stock_after, notes
  ) VALUES (
    p_product_id, p_reference_type, p_reference_id, p_sell_unit_used,
    p_qty, v_base_units_to_add, v_stock_before, v_stock_after,
    'Stock addition'
  );

  RETURN jsonb_build_object('stock_after', v_stock_after, 'base_units_added', v_base_units_to_add);
END;
$body$;

-- 5. Fix dispatch_order logic
DROP FUNCTION IF EXISTS public.dispatch_order(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.dispatch_order(UUID);
CREATE OR REPLACE FUNCTION public.dispatch_order(p_order_id UUID, p_dispatched_at TIMESTAMPTZ DEFAULT now())
RETURNS JSONB AS $body$
DECLARE
  v_item RECORD;
  v_status TEXT;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id;
  IF v_status IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Order not found'); END IF;
  
  IF v_status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status ' || v_status || ' cannot be dispatched');
  END IF;

  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    PERFORM public.deduct_stock(v_item.product_id, v_item.quantity, v_item.pack_type::public.sell_unit, 'sale', p_order_id);
  END LOOP;

  UPDATE orders SET status = 'dispatched', dispatched_at = p_dispatched_at WHERE id = p_order_id;
  
  RETURN jsonb_build_object('success', true);
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Fix v_product_stock view (ROBUST)
DROP VIEW IF EXISTS public.v_product_stock;
CREATE OR REPLACE VIEW public.v_product_stock AS
WITH product_totals AS (
  SELECT 
    p.id as product_id,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    CASE 
      WHEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1)) > 1 THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
      WHEN COALESCE(p.units_per_case, 1) > 1 THEN p.units_per_case
      WHEN COALESCE(p.case_qty_value, 0) > 0 AND COALESCE(p.pack_size_value, 0) > 0 THEN
        CASE 
          WHEN lower(p.case_qty_unit) = 'kg' AND lower(p.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') THEN (p.case_qty_value * 1000.0) / p.pack_size_value
          WHEN lower(p.case_qty_unit) = lower(p.pack_size_unit) THEN p.case_qty_value / p.pack_size_value
          ELSE 1
        END
      ELSE 1 
    END as calc_units_per_case
  FROM 
    public.products p
  LEFT JOIN (
    SELECT product_id, SUM(stock_base_units) as stock_base_units
    FROM public.inventory
    GROUP BY product_id
  ) i ON p.id = i.product_id
)
SELECT 
  p.*,
  t.stock_base_units as stock_base_units,
  t.stock_base_units as stock_pcs,
  CASE 
    WHEN p.units_per_packet > 1 THEN FLOOR(t.stock_base_units::numeric / p.units_per_packet)
    ELSE t.stock_base_units
  END as stock_packets,
  CASE 
    WHEN t.calc_units_per_case > 0 THEN FLOOR(t.stock_base_units::numeric / t.calc_units_per_case)
    ELSE 0 
  END as stock_cases,
  CASE 
    WHEN lower(p.pack_size_unit) IN ('g', 'gms', 'gm', 'grams') AND p.pack_size_value > 0 THEN ROUND((t.stock_base_units * p.pack_size_value / 1000.0)::numeric, 2)
    WHEN lower(p.pack_size_unit) IN ('kg', 'kgs', 'kilograms') AND p.pack_size_value > 0 THEN ROUND((t.stock_base_units * p.pack_size_value)::numeric, 2)
    ELSE 0
  END as stock_kg,
  (t.stock_base_units <= p.min_stock) as is_low_stock
FROM 
  public.products p
JOIN 
  product_totals t ON p.id = t.product_id;

-- 7. Fix recompute_all_inventory
CREATE OR REPLACE FUNCTION public.recompute_all_inventory()
RETURNS void AS $body$
BEGIN
  -- Recompute inventory table from fixed stock_ledger
  INSERT INTO public.inventory (product_id, stock_base_units, last_updated_at)
  SELECT 
    product_id,
    SUM(base_units_delta),
    now()
  FROM public.stock_ledger
  GROUP BY product_id
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET
    stock_base_units = EXCLUDED.stock_base_units,
    last_updated_at = now();
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Run final reconciliation
SELECT public.recompute_all_inventory();

-- 9. Grants
GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_inventory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_order(UUID, TIMESTAMPTZ) TO authenticated;
