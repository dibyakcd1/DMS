-- Migration: Rename RPC to bypass potential cache issues
-- This migration creates a new function name to ensure PostgREST sees it.

DROP FUNCTION IF EXISTS public.get_staff_list_v1();

CREATE OR REPLACE FUNCTION public.get_staff_list_v1()
RETURNS TABLE(id uuid, full_name text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.phone
  FROM public.profiles p
  INNER JOIN public.salesperson_pins sp ON sp.profile_id = p.id
  WHERE p.role::text = 'salesperson' AND sp.is_active = true
  ORDER BY p.full_name;
END;
$body$;

GRANT EXECUTE ON FUNCTION public.get_staff_list_v1 TO anon, authenticated;

-- Keep the old one for backward compatibility if it starts working
DROP FUNCTION IF EXISTS public.get_salesperson_list() CASCADE;
CREATE OR REPLACE FUNCTION public.get_salesperson_list()
RETURNS TABLE(id uuid, full_name text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  RETURN QUERY
  SELECT * FROM public.get_staff_list_v1();
END;
$body$;

GRANT EXECUTE ON FUNCTION public.get_salesperson_list TO anon, authenticated;
