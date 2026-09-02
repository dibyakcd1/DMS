-- Item 3: PIN session validation for data writes
-- This RPC allows salespeople to insert orders securely by validating their session token.

CREATE OR REPLACE FUNCTION public.insert_order_with_pin_v1(
  p_session_token text,
  p_order_data jsonb,
  p_items_data jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_profile_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_total_amount numeric;
BEGIN
  -- 1. Validate session token
  SELECT profile_id INTO v_profile_id
  FROM public.salesperson_sessions
  WHERE session_token = p_session_token
  AND expires_at > now();

  IF v_profile_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid or expired session. Please login again.'
    );
  END IF;

  -- 2. Insert the order
  INSERT INTO public.orders (
    shop_id,
    salesperson_id,
    warehouse_id,
    status,
    subtotal,
    gst_total,
    total,
    discount_amount,
    discount_type,
    notes,
    order_date,
    is_void
  ) VALUES (
    (p_order_data->>'shop_id')::uuid,
    v_profile_id,
    (p_order_data->>'warehouse_id')::uuid,
    COALESCE(p_order_data->>'status', 'pending_approval')::order_status,
    (p_order_data->>'subtotal')::numeric,
    COALESCE((p_order_data->>'gst_total')::numeric, 0),
    (p_order_data->>'total')::numeric,
    COALESCE((p_order_data->>'discount_amount')::numeric, 0),
    COALESCE(p_order_data->>'discount_type', 'flat'),
    p_order_data->>'notes',
    COALESCE((p_order_data->>'order_date')::timestamp with time zone, now()),
    COALESCE((p_order_data->>'is_void')::boolean, false)
  ) RETURNING id INTO v_order_id;

  -- 3. Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_data)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      unit_price,
      gst_rate,
      pack_type,
      line_total,
      line_total_tax_exclusive,
      line_tax_amount
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      (v_item->>'gst_rate')::numeric,
      (v_item->>'pack_type')::pack_type,
      (v_item->>'line_total')::numeric,
      (v_item->>'line_total_tax_exclusive')::numeric,
      (v_item->>'line_tax_amount')::numeric
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_order_with_pin_v1(text, jsonb, jsonb) TO anon, authenticated;
