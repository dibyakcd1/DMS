-- MIGRATION: Fix Profiles RLS Recursion (User Suggested Fix)
-- This migration drops all existing profiles policies and creates simple, non-recursive ones.

DO $body$ 
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $body$;

-- 1. Simple non-recursive SELECT policy for all authenticated users
CREATE POLICY "profiles_select_open" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- 2. Allow users to insert their own profile
CREATE POLICY "profiles_insert_own_v2" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- 3. Allow users to update their own profile
CREATE POLICY "profiles_update_own_v2" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Allow specific admin to delete
CREATE POLICY "profiles_delete_admin_v2" ON public.profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = 'ba709964-b616-4d1f-ae06-b30a682f6b21');
