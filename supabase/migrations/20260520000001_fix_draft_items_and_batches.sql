-- Migration: Add batch_id to order_items and fix save_draft_items RPC
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.inventory_batches(id);

CREATE OR REPLACE FUNCTION save_draft_order_v2(
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
BEGIN
  v_order_id := p_order_id;
  v_salesperson_id := (p_order_data->>'salesperson_id')::uuid;
  
  -- Use authenticated user ID if salesperson_id is missing
  IF v_salesperson_id IS NULL THEN
    v_salesperson_id := auth.uid();
  END IF;

  IF v_order_id IS NULL THEN
    -- Insert new order
    INSERT INTO orders (
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
      order_date
    ) VALUES (
      (p_order_data->>'shop_id')::uuid,
      v_salesperson_id,
      (p_order_data->>'warehouse_id')::uuid,
      COALESCE(p_order_data->>'status', 'draft')::public.order_status,
      (p_order_data->>'total')::numeric,
      (p_order_data->>'subtotal')::numeric,
      (p_order_data->>'gst_total')::numeric,
      (p_order_data->>'discount_amount')::numeric,
      p_order_data->>'discount_type',
      p_order_data->>'notes',
      (p_order_data->>'order_date')::date
    ) RETURNING id INTO v_order_id;
  ELSE
    -- Update order header
    UPDATE orders 
    SET 
      shop_id = (p_order_data->>'shop_id')::uuid,
      salesperson_id = v_salesperson_id,
      status = COALESCE(p_order_data->>'status', 'draft')::public.order_status,
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

    -- Delete existing items
    DELETE FROM order_items WHERE order_id = v_order_id;
  END IF;

  -- Insert new items from the jsonb array
  INSERT INTO order_items (
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
    (item->>'pack_type')::public.pack_type,
    (item->>'gst_rate')::numeric,
    (item->>'line_total')::numeric,
    (item->>'line_total_tax_exclusive')::numeric,
    (item->>'line_tax_amount')::numeric,
    (item->>'batch_id')::uuid
  FROM unnest(p_items) AS item;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_draft_order_v2(uuid, jsonb, jsonb[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_draft_order_v2(uuid, jsonb, jsonb[]) TO service_role;
