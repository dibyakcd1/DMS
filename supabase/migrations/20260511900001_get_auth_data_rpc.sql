-- Migration: Create get_user_auth_data RPC to bypass RLS for faster login
-- This avoids timeouts caused by recursive RLS on profiles and user_roles tables

CREATE OR REPLACE FUNCTION public.get_user_auth_data(p_uid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile json;
  v_roles text[];
  v_primary_role text;
BEGIN
  -- Get primary profile data
  SELECT json_build_object(
    'id', id,
    'full_name', full_name,
    'role', role,
    'email', email,
    'warehouse_id', warehouse_id
  ), role INTO v_profile, v_primary_role
  FROM public.profiles
  WHERE id = p_uid;

  -- Get secondary roles from user_roles
  SELECT ARRAY(
    SELECT role FROM public.user_roles
    WHERE user_id = p_uid
  ) INTO v_roles;

  -- Merge roles
  IF v_primary_role IS NOT NULL AND NOT (v_primary_role = ANY(v_roles)) THEN
    v_roles := array_append(v_roles, v_primary_role);
  END IF;

  RETURN json_build_object(
    'profile', v_profile,
    'roles', v_roles
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_auth_data(uuid) TO authenticated;
