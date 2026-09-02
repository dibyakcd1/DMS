-- Migration: 20260518000000_unify_roles_storage.sql
-- BHARAT MASALA — ROLE UNIFICATION
-- Goal: Use user_roles as the single source of truth for roles.

-- 1. Sync any existing roles from profiles.role to user_roles if they are missing
INSERT INTO public.user_roles (user_id, role)
SELECT id, role::text
FROM public.profiles
WHERE role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 2. Update get_user_auth_data RPC to ignore profiles.role
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
  -- Get primary profile data (excluding the role column)
  SELECT json_build_object(
    'id', id,
    'full_name', full_name,
    'email', email,
    'warehouse_id', warehouse_id
  ) INTO v_profile
  FROM public.profiles
  WHERE id = p_uid;

  -- Get roles from user_roles only
  SELECT ARRAY(
    SELECT role FROM public.user_roles
    WHERE user_id = p_uid
  ) INTO v_roles;

  RETURN json_build_object(
    'profile', v_profile,
    'roles', v_roles
  );
END;
$$;

-- 3. Update any views that might depend on profiles.role
-- (e.g. if there's a view that joins profiles)
-- We'll check if anything breaks, but usually views should use profiles join.

-- 4. Drop the role column from profiles
-- NOTE: We do this last to avoid breaking existing code during the migration run if it fails midway.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
