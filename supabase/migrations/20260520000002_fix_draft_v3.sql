-- Migration: Update Enums and Fix save_draft_order_v3
-- Adding missing pack_type values and ensuring status casts

-- 1. Update pack_type enum
DO $$ BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'pcs';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'g';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'ml';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE public.pack_type ADD VALUE 'ltr';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create a revised draft saving function with explicit casts
CREATE OR REPLACE FUNCTION save_draft_order_v3(
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
  
  -- Use authenticated user ID if salesperson_id is missing or invalid
  IF v_salesperson_id IS NULL THEN
    v_salesperson_id := auth.uid();
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
      order_date
    ) VALUES (
      (p_order_data->>'shop_id')::uuid,
      v_salesperson_id,
      (p_order_data->>'warehouse_id')::uuid,
      v_status_text::public.order_status,
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
    UPDATE public.orders 
    SET 
      shop_id = (p_order_data->>'shop_id')::uuid,
      salesperson_id = v_salesperson_id,
      status = v_status_text::public.order_status,
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
    DELETE FROM public.order_items WHERE order_id = v_order_id;
  END IF;

  -- Insert new items with appropriate type mapping
  INSERT INTO public.order_items (
    order_id, 
    product_id, 
    quantity, 
    unit_price, 
    pack_type, 
    gst_rate, 
    line_total,
    batch_id
  )
  SELECT 
    v_order_id,
    (item->>'product_id')::uuid,
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    -- Map common variants if they don't exactly match the enum
    CASE 
      WHEN (item->>'pack_type') = 'pcs' THEN 'unit'::public.pack_type
      ELSE (item->>'pack_type')::public.pack_type
    END,
    (item->>'gst_rate')::numeric,
    (item->>'line_total')::numeric,
    (item->>'batch_id')::uuid
  FROM unnest(p_items) AS item;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_draft_order_v3(uuid, jsonb, jsonb[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_draft_order_v3(uuid, jsonb, jsonb[]) TO service_role;
