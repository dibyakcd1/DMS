-- In the UPDATE branch of save_draft_order_v3, preserve status if already past pending_approval
CREATE OR REPLACE FUNCTION save_draft_order_v3(
  p_order_id uuid, p_order_data jsonb, p_items jsonb[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id uuid := p_order_id;
  v_salesperson_id uuid;
  v_requested_status text;
  v_current_status text;
  v_final_status text;
BEGIN
  v_salesperson_id := COALESCE((p_order_data->>'salesperson_id')::uuid, auth.uid());
  v_requested_status := COALESCE(p_order_data->>'status', 'draft');

  IF v_order_id IS NULL THEN
    -- NEW order: use requested status as-is
    v_final_status := v_requested_status;
    INSERT INTO public.orders ( shop_id, salesperson_id, warehouse_id, status, total,
      subtotal, gst_total, discount_amount, discount_type, notes, order_date )
    VALUES ( (p_order_data->>'shop_id')::uuid, v_salesperson_id,
      (p_order_data->>'warehouse_id')::uuid, v_final_status::public.order_status,
      (p_order_data->>'total')::numeric, (p_order_data->>'subtotal')::numeric,
      (p_order_data->>'gst_total')::numeric, (p_order_data->>'discount_amount')::numeric,
      p_order_data->>'discount_type', p_order_data->>'notes',
      (p_order_data->>'order_date')::date ) RETURNING id INTO v_order_id;
  ELSE
    -- EXISTING order: protect status if already approved or beyond
    SELECT status::text INTO v_current_status FROM public.orders WHERE id = v_order_id;
    IF v_current_status IN ('approved','dispatched','delivered') THEN
      v_final_status := v_current_status; -- preserve it
    ELSE
      v_final_status := v_requested_status;
    END IF;
    
    UPDATE public.orders SET
      shop_id = (p_order_data->>'shop_id')::uuid,
      salesperson_id = v_salesperson_id,
      status = v_final_status::public.order_status,
      total = (p_order_data->>'total')::numeric,
      subtotal = (p_order_data->>'subtotal')::numeric,
      gst_total = (p_order_data->>'gst_total')::numeric,
      discount_amount = (p_order_data->>'discount_amount')::numeric,
      discount_type = p_order_data->>'discount_type',
      notes = p_order_data->>'notes',
      order_date = (p_order_data->>'order_date')::date,
      warehouse_id = (p_order_data->>'warehouse_id')::uuid,
      updated_at = now()
    WHERE id = v_order_id;

    DELETE FROM public.order_items WHERE order_id = v_order_id;
  END IF;

  INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, pack_type,
    gst_rate, line_total, batch_id)
  SELECT v_order_id, (item->>'product_id')::uuid, (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    CASE WHEN (item->>'pack_type') = 'pcs' THEN 'unit'::public.pack_type
         ELSE (item->>'pack_type')::public.pack_type END,
    (item->>'gst_rate')::numeric, (item->>'line_total')::numeric,
    (item->>'batch_id')::uuid
  FROM unnest(p_items) AS item;

  RETURN v_order_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.save_draft_order_v3(uuid, jsonb, jsonb[]) TO authenticated, service_role;
