-- MIGRATION: Fix RLS Recursion on profiles
-- This migration drops old conflicting policies and implements a non-recursive approach.

-- 1. Drop ALL potentially conflicting policies
DO $body$ 
BEGIN
    DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_read_admin" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_read_owner_all" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
EXCEPTION WHEN OTHERS THEN 
    NULL;
END $body$;

-- 2. Recreate helper function with SECURITY DEFINER to bypass RLS internally
-- Using LANGUAGE sql for better inlining and avoiding plpgsql overhead
CREATE OR REPLACE FUNCTION public.check_is_admin_v3()
RETURNS boolean AS $body$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'owner')
  );
$body$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- 3. Implement clean policies
-- SELECT: Users can see their own row OR admins can see any row
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.check_is_admin_v3());

-- INSERT: Standard users can only create their own profile
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- UPDATE: Users can update their own profile
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- DELETE: Only admins/owners can delete profiles
CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.check_is_admin_v3());

-- 4. Final verification of the owner account
INSERT INTO public.profiles (id, email, role, full_name, updated_at)
VALUES ('ba709964-b616-4d1f-ae06-b30a682f6b21', 'dibyaprakashkcd1@gmail.com', 'owner', 'Owner', now())
ON CONFLICT (id) DO UPDATE SET role = 'owner', updated_at = now();

-- Ensure user_roles record also exists
DO $body$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES ('ba709964-b616-4d1f-ae06-b30a682f6b21', 'owner')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $body$;
