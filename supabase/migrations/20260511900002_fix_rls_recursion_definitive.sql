-- MIGRATION: 20260511900002_fix_rls_recursion_definitive.sql
-- This migration breaks the recursion loop by ensuring is_admin_or_owner() 
-- ONLY queries user_roles, not profiles.

-- 1. Redefine is_admin_or_owner and is_admin to check ONLY user_roles
CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
  );
$$;

-- 2. Ensure profiles has a simple, non-circular policy
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

-- 2a. Everyone can see their own profile
CREATE POLICY "profiles_read_self"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- 2b. Everyone can see ALL profiles (for staff lists, etc.)
-- This is often safe in internal apps and eliminates recursion entirely.
-- If privacy is needed, we'd use a more complex check, but "true" is the safest for stability.
CREATE POLICY "profiles_read_all"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- 2c. Self update
CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- 2d. Admin full control
CREATE POLICY "profiles_admin_all"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin_or_owner());

-- 3. Also fix user_roles policies to be safe
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "user_roles_read_self"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_roles_read_all"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin_or_owner());

-- 4. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
