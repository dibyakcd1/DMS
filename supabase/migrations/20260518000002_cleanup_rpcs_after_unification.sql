-- Migration: 20260518000002_cleanup_rpcs_after_unification.sql
-- Goal: Fix setup_first_owner to not reference the dropped profiles.role column.

CREATE OR REPLACE FUNCTION public.setup_first_owner(
  p_uid uuid,
  p_full_name text,
  p_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_count int;
BEGIN
  -- 1. Count existing owners/admins
  SELECT COUNT(*) INTO v_owner_count 
  FROM public.user_roles 
  WHERE role IN ('owner', 'admin');

  -- 2. Only proceed if system has zero admins/owners
  IF v_owner_count = 0 THEN
    -- Insert into profiles (WITHOUT role column)
    INSERT INTO public.profiles (id, full_name, email, updated_at)
    VALUES (p_uid, p_full_name, p_email, now())
    ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, updated_at = now();

    -- Insert into user_roles
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_uid, 'owner')
    ON CONFLICT (user_id, role) DO NOTHING;

    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_first_owner(uuid, text, text) TO authenticated;
