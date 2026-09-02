-- Restore list access to anon so PIN login can work
GRANT EXECUTE ON FUNCTION public.get_salesperson_list() TO anon;
GRANT EXECUTE ON FUNCTION public.get_staff_list_v1() TO anon;

-- Ensure PIN verification is accessible to anon
GRANT EXECUTE ON FUNCTION public.verify_staff_pin_v2(uuid, text) TO anon;

-- Ensure verify_staff_session_v2 is accessible to anon
GRANT EXECUTE ON FUNCTION public.verify_staff_session_v2(text) TO anon;

-- Ensure order insertion with PIN is accessible to anon
GRANT EXECUTE ON FUNCTION public.insert_order_with_pin_v2(text, jsonb, jsonb) TO anon;

-- Ensure warehouse list is accessible to anon (needed for order creation)
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "warehouses_select_anon" ON public.warehouses;
CREATE POLICY "warehouses_select_anon" ON public.warehouses FOR SELECT TO anon USING (true);
