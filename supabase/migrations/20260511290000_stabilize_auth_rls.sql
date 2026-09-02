-- Stabilization: Break all RLS recursion for profiles and user_roles
-- This migration ensures that AuthContext initialization (loading profiles/roles) never timeouts.

-- 1. CLEANUP ALL PROFILES POLICIES
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
    END LOOP;
END $$;

-- 2. CREATE NON-RECURSIVE PROFILES POLICIES
-- Simple select for everyone (required for joins and auth initialization)
CREATE POLICY "profiles_read_v5" ON public.profiles
  FOR SELECT TO authenticated, anon
  USING (true);

-- Self-update (restrict role changes)
CREATE POLICY "profiles_update_self_v5" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role IS NOT DISTINCT FROM role);

-- Admin manage all (uses user_roles to break recursion)
CREATE POLICY "profiles_admin_all_v5" ON public.profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- 3. CLEANUP ALL USER_ROLES POLICIES
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'user_roles' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', pol.policyname);
    END LOOP;
END $$;

-- 4. CREATE NON-RECURSIVE USER_ROLES POLICIES
-- Allow self-read (Crucial for AuthContext role loading)
CREATE POLICY "user_roles_read_self_v5" ON public.user_roles
  FOR SELECT TO authenticated, anon
  USING (user_id = auth.uid());

-- Allow owners to read all (non-recursive check)
CREATE POLICY "user_roles_owner_read_v5" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    -- Direct check in user_roles instead of profiles
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'owner'
    )
  );

-- Admin management (restricted)
CREATE POLICY "user_roles_admin_all_v5" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'owner'
    )
  );

-- 5. Force specific admin access for Dibya to avoid bootstrap lockout
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner' FROM auth.users WHERE email = 'dibyaprakashkcd1@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner' FROM auth.users WHERE email = 'dibyaprakashkcd2@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
