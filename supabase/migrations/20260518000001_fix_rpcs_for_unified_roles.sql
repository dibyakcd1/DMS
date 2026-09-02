-- Migration: 20260518000001_fix_rpcs_for_unified_roles.sql
-- Goal: Fix RPCs that were still referencing profiles.role after column drop.

DROP FUNCTION IF EXISTS public.get_salesperson_list() CASCADE;

CREATE OR REPLACE FUNCTION public.get_salesperson_list()
RETURNS TABLE(id uuid, full_name text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Use user_roles to identify salespeople
  SELECT p.id, p.full_name, p.phone
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  INNER JOIN public.salesperson_pins sp ON sp.profile_id = p.id
  WHERE (ur.role = 'salesperson' OR ur.role = 'sales')
    AND sp.is_active = true
  ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_salesperson_list TO anon, authenticated;

-- Ensure get_user_auth_data is also hardened and explicit
CREATE OR REPLACE FUNCTION public.get_user_auth_data(p_uid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile json;
  v_roles text[];
BEGIN
  -- Get primary profile data
  SELECT json_build_object(
    'id', id,
    'full_name', full_name,
    'email', email,
    'warehouse_id', warehouse_id
  ) INTO v_profile
  FROM public.profiles
  WHERE id = p_uid;

  -- Get roles from user_roles
  SELECT ARRAY(
    SELECT role FROM public.user_roles
    WHERE user_id = p_uid
  ) INTO v_roles;

  -- Fallback if no roles exist (should not happen for valid users, but good for stability)
  IF v_roles IS NULL THEN
    v_roles := ARRAY[]::text[];
  END IF;

  RETURN json_build_object(
    'profile', v_profile,
    'roles', v_roles
  );
END;
$$;
