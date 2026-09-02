-- Migration: 20260527000001_fix_salesman_permissions.sql
-- Goal: Restore access for salesmen (anon users) and fix missing schema elements.

-- 1. Ensure warehouse_id exists on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id);

-- 2. Restore SELECT permissions for salesmen (anon users)
-- Profiles
DROP POLICY IF EXISTS "profiles_read_all_v8" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all_v9" ON public.profiles;
CREATE POLICY "profiles_select_all_v9" ON public.profiles FOR SELECT TO authenticated, anon USING (true);

-- Shops
DROP POLICY IF EXISTS "shops_select_v2" ON public.shops;
DROP POLICY IF EXISTS "shops_select_v3" ON public.shops;
CREATE POLICY "shops_select_v3" ON public.shops FOR SELECT TO authenticated, anon USING (true);

-- Orders
DROP POLICY IF EXISTS "orders_select_v2" ON public.orders;
DROP POLICY IF EXISTS "orders_select_v3" ON public.orders;
CREATE POLICY "orders_select_v3" ON public.orders FOR SELECT TO authenticated, anon USING (true);

-- 3. Create missing get_product_category_counts function
CREATE OR REPLACE FUNCTION public.get_product_category_counts()
RETURNS TABLE(division_category text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(division_category, 'Uncategorized'), COUNT(*)
  FROM public.products
  WHERE is_active = true
  GROUP BY division_category;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_category_counts() TO authenticated, anon;

-- 4. Fix save_draft_order_v3 to handle Salesmen (anon users) correctly
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

GRANT EXECUTE ON FUNCTION public.save_draft_order_v4(uuid, jsonb, jsonb[]) TO authenticated, anon;
