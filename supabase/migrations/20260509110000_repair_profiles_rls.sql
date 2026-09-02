-- MIGRATION: Repair Profiles RLS and Fix Recursion
-- This fixes the infinite recursion caused by substandard RLS policies.

-- 1. Ensure the helper function is robust
CREATE OR REPLACE FUNCTION public.check_is_admin_v2()
RETURNS boolean AS $body$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Drop all conflicting policies on profiles
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_owner_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- 3. Re-create standard policies using the helper
-- READ: Own profile or if Admin/Owner
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.check_is_admin_v2());

-- INSERT: Own profile or if Admin/Owner
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR public.check_is_admin_v2());

-- UPDATE: Own profile or if Admin/Owner
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.check_is_admin_v2())
  WITH CHECK (auth.uid() = id OR public.check_is_admin_v2());

-- DELETE: Only Admin/Owner
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.check_is_admin_v2());
