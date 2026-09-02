-- Migration: Comprehensive Fix for pack_type Enum, Draft Auto-Save and Order Submission
-- Fixes: ERROR 22P02: invalid input value for enum pack_type: "doz"
-- Fixes: ERROR 0A000: cannot alter type of a column used by a view or rule (realized_margin_view)
--
-- 1. Drops dependent views before column type migration
-- 2. Alters public.order_items.pack_type and public.product_price_tiers.pack_type to TEXT
-- 3. Recreates public.margin_report_view and public.realized_margin_view
-- 4. Updates convert_to_base_units to handle 'doz' with 12x (or units_per_packet) multiplier
-- 5. Updates save_draft_order_v4 and insert_order_with_pin_v2 to accept and persist pack_type seamlessly

BEGIN;

-- 1. Drop dependent views with CASCADE before modifying column types
DROP VIEW IF EXISTS public.realized_margin_view CASCADE;
DROP VIEW IF EXISTS public.margin_report_view CASCADE;

-- 2. Safely convert order_items.pack_type and product_price_tiers.pack_type to TEXT to prevent rigid enum constraint issues
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'order_items' 
      AND column_name = 'pack_type'
  ) THEN
    ALTER TABLE public.order_items ALTER COLUMN pack_type TYPE TEXT USING pack_type::text;
    ALTER TABLE public.order_items ALTER COLUMN pack_type SET DEFAULT 'packet';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'product_price_tiers' 
      AND column_name = 'pack_type'
  ) THEN
    ALTER TABLE public.product_price_tiers ALTER COLUMN pack_type TYPE TEXT USING pack_type::text;
    ALTER TABLE public.product_price_tiers ALTER COLUMN pack_type SET DEFAULT 'pcs';
  END IF;
END $$;

-- 3. Recreate margin_report_view with quantity-weighted WAC and TEXT pack_type support
CREATE OR REPLACE VIEW public.margin_report_view AS
WITH batch_wac AS (
  SELECT 
    product_id, 
    COALESCE(SUM(remaining_qty * landed_cost) / NULLIF(SUM(remaining_qty), 0), 0) as avg_landed_cost
  FROM public.inventory_batches 
  WHERE remaining_qty > 0
  GROUP BY product_id
),
basic_unit_price AS (
  SELECT product_id, MIN(price) as standard_selling_price
  FROM public.product_price_tiers
  WHERE shop_type::text = 'basic' AND pack_type::text IN ('pcs', 'unit')
  GROUP BY product_id
)
SELECT 
  p.id as product_id, 
  p.name as product_name, 
  p.sku,
  COALESCE(bup.standard_selling_price, p.mrp, 0.01) as standard_selling_price,
  COALESCE(NULLIF(bw.avg_landed_cost, 0), p.cost_price, 0) as avg_landed_cost,
  CASE WHEN COALESCE(bup.standard_selling_price, p.mrp, 0) > 0 THEN
    ((COALESCE(bup.standard_selling_price, p.mrp) - COALESCE(NULLIF(bw.avg_landed_cost, 0), p.cost_price, 0))
      / COALESCE(bup.standard_selling_price, p.mrp)) * 100
  ELSE 0 END as margin_percent
FROM public.products p
LEFT JOIN batch_wac bw ON p.id = bw.product_id
LEFT JOIN basic_unit_price bup ON p.id = bup.product_id
WHERE p.is_active = true;

GRANT SELECT ON public.margin_report_view TO authenticated, anon;

-- 4. Recreate realized_margin_view with canonical quantity-weighted WAC and TEXT pack_type support
CREATE OR REPLACE VIEW public.realized_margin_view AS
SELECT 
    oi.id as order_item_id,
    o.id as order_id,
    o.order_date as order_date,
    o.status as order_status,
    p.id as product_id,
    p.name as product_name,
    p.sku as product_sku,
    oi.quantity,
    oi.unit_price as unit_price_exclusive,
    (oi.unit_price * oi.quantity) as revenue_exclusive,
    COALESCE(
      (SELECT SUM(obd.qty_base_units * ib.landed_cost) 
       FROM public.order_batch_deductions obd
       JOIN public.inventory_batches ib ON obd.batch_id = ib.id
       WHERE obd.order_item_id = oi.id),
      (COALESCE(ps.avg_landed_cost, p.cost_price, 0.01) * (
         CASE 
           WHEN oi.pack_type::text = 'packet' THEN COALESCE(p.units_per_packet, 1)
           WHEN oi.pack_type::text = 'case' THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
           WHEN oi.pack_type::text = 'doz' THEN 12
           ELSE 1
         END
       ) * oi.quantity)
    ) as cost_exclusive,
    ((oi.unit_price * oi.quantity) - COALESCE(
      (SELECT SUM(obd.qty_base_units * ib.landed_cost) 
       FROM public.order_batch_deductions obd
       JOIN public.inventory_batches ib ON obd.batch_id = ib.id
       WHERE obd.order_item_id = oi.id),
      (COALESCE(ps.avg_landed_cost, p.cost_price, 0.01) * (
         CASE 
           WHEN oi.pack_type::text = 'packet' THEN COALESCE(p.units_per_packet, 1)
           WHEN oi.pack_type::text = 'case' THEN (COALESCE(p.units_per_packet, 1) * COALESCE(p.packets_per_case, 1))
           WHEN oi.pack_type::text = 'doz' THEN 12
           ELSE 1
         END
       ) * oi.quantity)
    )) as realized_profit_total
FROM public.order_items oi
JOIN public.orders o ON oi.order_id = o.id
JOIN public.products p ON oi.product_id = p.id
LEFT JOIN public.v_product_stock ps ON p.id = ps.id;

GRANT SELECT ON public.realized_margin_view TO authenticated, anon;

-- 5. Robust convert_to_base_units function with dozen, case, packet, weight support
CREATE OR REPLACE FUNCTION public.convert_to_base_units(
  p_product_id UUID,
  p_qty NUMERIC,
  p_unit TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_unit_type         TEXT;
  v_units_per_packet  INTEGER;
  v_packets_per_case  INTEGER;
  v_units_per_case    INTEGER;
  v_weight_per_unit_g NUMERIC;
  v_unit              TEXT;
  v_multiplier        INTEGER;
  v_result            NUMERIC;
BEGIN
  SELECT unit_type, units_per_packet, packets_per_case, units_per_case, weight_per_unit_grams
  INTO v_unit_type, v_units_per_packet, v_packets_per_case, v_units_per_case, v_weight_per_unit_g
  FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found: %', p_product_id; END IF;

  v_unit := LOWER(TRIM(COALESCE(p_unit, 'unit')));
  v_units_per_packet := COALESCE(v_units_per_packet, 1);
  v_packets_per_case := COALESCE(v_packets_per_case, 1);
  
  -- Multiplier for full cases
  v_multiplier := CASE 
    WHEN (v_units_per_packet * v_packets_per_case) > 1 THEN (v_units_per_packet * v_packets_per_case)
    ELSE COALESCE(v_units_per_case, 1)
  END;

  IF v_unit IN ('doz', 'dozen', 'dz') THEN
    v_result := p_qty * (CASE WHEN v_units_per_packet > 1 THEN v_units_per_packet ELSE 12 END);
  ELSIF v_unit_type = 'kg_g' THEN
    IF v_weight_per_unit_g IS NOT NULL AND v_weight_per_unit_g > 0 THEN
      CASE v_unit
        WHEN 'pcs', 'unit', 'pc', 'pouch', 'sachet', 'jar', 'bottle', 'tin', 'can', 'acb' THEN v_result := p_qty;
        WHEN 'packet', 'pkt' THEN v_result := p_qty * v_units_per_packet;
        WHEN 'case', 'ctn' THEN v_result := p_qty * v_multiplier;
        WHEN 'g', 'gms'    THEN v_result := p_qty / v_weight_per_unit_g;
        WHEN 'kg'          THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
        WHEN 'ml'          THEN v_result := p_qty / v_weight_per_unit_g;
        WHEN 'ltr', 'l'    THEN v_result := (p_qty * 1000.0) / v_weight_per_unit_g;
        ELSE v_result := p_qty;
      END CASE;
    ELSE
      CASE v_unit
        WHEN 'g', 'gms', 'ml' THEN v_result := p_qty;
        WHEN 'kg', 'ltr', 'l' THEN v_result := p_qty * 1000.0;
        WHEN 'packet', 'pkt' THEN v_result := p_qty * v_units_per_packet;
        WHEN 'case', 'ctn' THEN v_result := p_qty * v_multiplier;
        ELSE v_result := p_qty;
      END CASE;
    END IF;
  ELSE
    CASE v_unit
      WHEN 'pcs', 'unit', 'pc' THEN v_result := p_qty;
      WHEN 'packet', 'pkt'     THEN v_result := p_qty * v_units_per_packet;
      WHEN 'case', 'ctn'       THEN v_result := p_qty * v_multiplier;
      ELSE v_result := p_qty;
    END CASE;
  END IF;

  RETURN ROUND(COALESCE(v_result, p_qty), 4);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. Recreate save_draft_order_v4 without fragile enum casting
CREATE OR REPLACE FUNCTION public.save_draft_order_v4(
  p_order_id uuid,
  p_order_data jsonb,
  p_items jsonb[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_salesperson_id uuid;
  v_status_text text;
BEGIN
  v_order_id := p_order_id;
  v_salesperson_id := (p_order_data->>'salesperson_id')::uuid;
  v_status_text := COALESCE(p_order_data->>'status', 'draft');
  
  -- Validation: Ensure we have a salesperson_id
  IF v_salesperson_id IS NULL THEN
    RAISE EXCEPTION 'salesperson_id is required';
  END IF;

  IF v_order_id IS NULL THEN
    -- Insert new order
    INSERT INTO public.orders (
      shop_id,
      salesperson_id,
      warehouse_id,
      status,
      total,
      subtotal,
      gst_total,
      discount_amount,
      discount_type,
      notes,
      order_date,
      is_over_limit
    ) VALUES (
      (p_order_data->>'shop_id')::uuid,
      v_salesperson_id,
      (p_order_data->>'warehouse_id')::uuid,
      v_status_text::public.order_status,
      COALESCE((p_order_data->>'total')::numeric, 0),
      COALESCE((p_order_data->>'subtotal')::numeric, 0),
      COALESCE((p_order_data->>'gst_total')::numeric, 0),
      COALESCE((p_order_data->>'discount_amount')::numeric, 0),
      p_order_data->>'discount_type',
      p_order_data->>'notes',
      COALESCE((p_order_data->>'order_date')::date, CURRENT_DATE),
      COALESCE((p_order_data->>'is_over_limit')::boolean, false)
    ) RETURNING id INTO v_order_id;
  ELSE
    -- Update order header
    UPDATE public.orders 
    SET 
      shop_id = (p_order_data->>'shop_id')::uuid,
      salesperson_id = v_salesperson_id,
      status = v_status_text::public.order_status,
      total = COALESCE((p_order_data->>'total')::numeric, 0),
      subtotal = COALESCE((p_order_data->>'subtotal')::numeric, 0),
      gst_total = COALESCE((p_order_data->>'gst_total')::numeric, 0),
      discount_amount = COALESCE((p_order_data->>'discount_amount')::numeric, 0),
      discount_type = p_order_data->>'discount_type',
      notes = p_order_data->>'notes',
      order_date = COALESCE((p_order_data->>'order_date')::date, CURRENT_DATE),
      warehouse_id = (p_order_data->>'warehouse_id')::uuid,
      is_over_limit = COALESCE((p_order_data->>'is_over_limit')::boolean, false),
      updated_at = now()
    WHERE id = v_order_id;

    -- Delete existing items
    DELETE FROM public.order_items WHERE order_id = v_order_id;
  END IF;

  -- Insert new items (storing pack_type directly as text without crashing on 'doz')
  INSERT INTO public.order_items (
    order_id, 
    product_id, 
    quantity, 
    unit_price, 
    pack_type, 
    gst_rate, 
    line_total,
    line_total_tax_exclusive,
    line_tax_amount,
    batch_id
  )
  SELECT 
    v_order_id,
    (item->>'product_id')::uuid,
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    COALESCE(item->>'pack_type', 'packet'),
    (item->>'gst_rate')::numeric,
    COALESCE((item->>'line_total')::numeric, (item->>'quantity')::numeric * (item->>'unit_price')::numeric),
    COALESCE((item->>'line_total_tax_exclusive')::numeric, (item->>'quantity')::numeric * (item->>'unit_price')::numeric),
    COALESCE((item->>'line_tax_amount')::numeric, 0),
    (item->>'batch_id')::uuid
  FROM unnest(p_items) AS item;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_draft_order_v4(uuid, jsonb, jsonb[]) TO authenticated, anon;

-- 5. Recreate insert_order_with_pin_v2 without fragile enum casting
CREATE OR REPLACE FUNCTION public.insert_order_with_pin_v2(
  p_session_token text,
  p_order_data jsonb,
  p_items_data jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id uuid;
  v_shop_id uuid;
  v_warehouse_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_credit_limit numeric;
  v_current_balance numeric;
  v_calc_subtotal numeric := 0;
  v_calc_gst numeric := 0;
  v_calc_total numeric := 0;
  v_is_over_limit boolean := false;
BEGIN
  -- Authenticate session
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE pin_session_token = p_session_token
    AND pin_session_expires_at > now();

  IF v_profile_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired session');
  END IF;

  v_shop_id := (p_order_data->>'shop_id')::uuid;
  v_warehouse_id := (p_order_data->>'warehouse_id')::uuid;

  IF v_shop_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Shop ID is required');
  END IF;

  -- Compute totals server-side
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
  LOOP
    v_calc_subtotal := v_calc_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
    v_calc_gst := v_calc_gst + (((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric) * COALESCE((v_item->>'gst_rate')::numeric, 0) / 100);
  END LOOP;

  v_calc_total := v_calc_subtotal + v_calc_gst - COALESCE((p_order_data->>'discount_amount')::numeric, 0);

  SELECT COALESCE(credit_limit, 0), COALESCE(current_balance, 0)
  INTO v_credit_limit, v_current_balance
  FROM public.shops WHERE id = v_shop_id;

  v_is_over_limit := (v_credit_limit > 0 AND (v_current_balance + v_calc_total) > v_credit_limit);

  -- Reject IF NOT DRAFT and exceeds limit
  IF v_is_over_limit AND (COALESCE(p_order_data->>'status', 'pending_approval') != 'draft') THEN
    RETURN json_build_object('success', false, 'error', 'Credit limit exceeded. Shop Limit: ' || v_credit_limit || ', New Balance: ' || (v_current_balance + v_calc_total));
  END IF;

  -- Insert order
  INSERT INTO public.orders (
    shop_id, salesperson_id, warehouse_id, status, 
    subtotal, gst_total, total, 
    discount_amount, discount_type, notes, order_date,
    is_over_limit
  ) VALUES (
    v_shop_id, v_profile_id, v_warehouse_id, COALESCE(p_order_data->>'status', 'pending_approval')::order_status,
    v_calc_subtotal, v_calc_gst, v_calc_total,
    COALESCE((p_order_data->>'discount_amount')::numeric, 0), COALESCE(p_order_data->>'discount_type', 'flat'),
    p_order_data->>'notes', COALESCE((p_order_data->>'order_date')::timestamp with time zone, now()),
    v_is_over_limit
  ) RETURNING id INTO v_order_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, quantity, unit_price, gst_rate, pack_type,
      line_total, line_total_tax_exclusive, line_tax_amount, batch_id
    ) VALUES (
      v_order_id, 
      (v_item->>'product_id')::uuid, 
      (v_item->>'quantity')::numeric, 
      (v_item->>'unit_price')::numeric, 
      (v_item->>'gst_rate')::numeric, 
      COALESCE(v_item->>'pack_type', 'packet'),
      COALESCE((v_item->>'line_total')::numeric, (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric * (1 + COALESCE((v_item->>'gst_rate')::numeric, 0)/100)),
      COALESCE((v_item->>'line_total_tax_exclusive')::numeric, (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric),
      COALESCE((v_item->>'line_tax_amount')::numeric, ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric * (COALESCE((v_item->>'gst_rate')::numeric, 0)/100))),
      (v_item->>'batch_id')::uuid
    );
  END LOOP;

  RETURN json_build_object('success', true, 'order_id', v_order_id);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_order_with_pin_v2(text, jsonb, jsonb) TO anon, authenticated;

COMMIT;
