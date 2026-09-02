-- Fix RPC overloads for PIN authentication
-- This ensures that even if the client sends arguments in a different order, the RPC will match.

-- 1. Overload for verify_salesperson_pin with (text, uuid) order
CREATE OR REPLACE FUNCTION public.verify_salesperson_pin(
  p_pin text,
  p_profile_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  RETURN public.verify_staff_pin_v1(p_profile_id, p_pin);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.verify_salesperson_pin(text, uuid) TO anon, authenticated;

-- 2. Overload for verify_staff_pin_v1 with (text, uuid) order
CREATE OR REPLACE FUNCTION public.verify_staff_pin_v1(
  p_pin text,
  p_profile_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $body$
BEGIN
  RETURN public.verify_staff_pin_v1(p_profile_id, p_pin);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin_v1(text, uuid) TO anon, authenticated;

-- 3. Ensure the original ones still exist and are correct
CREATE OR REPLACE FUNCTION public.verify_salesperson_pin(
  p_profile_id uuid,
  p_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  RETURN public.verify_staff_pin_v1(p_profile_id, p_pin);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.verify_salesperson_pin(uuid, text) TO anon, authenticated;
