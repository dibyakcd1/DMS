-- Atomic RPC for saving order drafts
CREATE OR REPLACE FUNCTION save_draft_items(
  p_order_id uuid,
  p_order_data jsonb,
  p_items jsonb[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update order header
  -- We use COALESCE and casting to ensure types are correct
  UPDATE orders 
  SET 
    shop_id = (p_order_data->>'shop_id')::uuid,
    salesperson_id = (p_order_data->>'salesperson_id')::uuid,
    status = COALESCE(p_order_data->>'status', 'draft'),
    total = (p_order_data->>'total')::numeric,
    discount_amount = (p_order_data->>'discount_amount')::numeric,
    discount_type = p_order_data->>'discount_type',
    notes = p_order_data->>'notes',
    order_date = (p_order_data->>'order_date')::date
  WHERE id = p_order_id;

  -- Delete existing items
  DELETE FROM order_items WHERE order_id = p_order_id;

  -- Insert new items from the jsonb array
  INSERT INTO order_items (
    order_id, 
    product_id, 
    quantity, 
    unit_price, 
    pack_type, 
    gst_rate, 
    total
  )
  SELECT 
    p_order_id,
    (item->>'product_id')::uuid,
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    (item->>'pack_type'),
    (item->>'gst_rate')::numeric,
    (item->>'total')::numeric
  FROM unnest(p_items) AS item;
END;
$$;
