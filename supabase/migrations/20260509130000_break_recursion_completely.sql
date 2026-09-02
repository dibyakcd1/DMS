-- MIGRATION: Break RLS Recursion (Nuclear Fix)
-- This migration removes recursive calls from the profiles table to stop the 429 errors.

-- 1. Drop ALL existing policies on profiles to start fresh
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

-- 2. Implement NON-RECURSIVE policies
-- SELECT: Allow all authenticated users to see names/roles (Safe and stops recursion)
CREATE POLICY "profiles_select_v4" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: Only allow users to create their own record
CREATE POLICY "profiles_insert_v4" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- UPDATE: Only allow users to update their own record
CREATE POLICY "profiles_update_v4" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- DELETE: Temporarily allow owner by UID directly to avoid function call
CREATE POLICY "profiles_delete_v4" ON public.profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = 'ba709964-b616-4d1f-ae06-b30a682f6b21');

-- 3. Force the Owner role for your UID one last time
INSERT INTO public.profiles (id, email, role, full_name, updated_at)
VALUES ('ba709964-b616-4d1f-ae06-b30a682f6b21', 'dibyaprakashkcd1@gmail.com', 'owner', 'Owner', now())
ON CONFLICT (id) DO UPDATE SET role = 'owner', updated_at = now();
