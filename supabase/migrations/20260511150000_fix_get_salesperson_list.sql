-- Migration: Fix and refresh salesperson list RPC
-- This migration ensures salespeople with PINs appear correctly on the sign-in screen.

DROP FUNCTION IF EXISTS public.get_salesperson_list() CASCADE;

CREATE OR REPLACE FUNCTION public.get_salesperson_list()
RETURNS TABLE(id uuid, full_name text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.phone
  FROM profiles p
  INNER JOIN salesperson_pins sp ON sp.profile_id = p.id
  WHERE p.role::text = 'salesperson' AND sp.is_active = true
  ORDER BY p.full_name;
END;
$body$;

GRANT EXECUTE ON FUNCTION public.get_salesperson_list TO anon, authenticated;
