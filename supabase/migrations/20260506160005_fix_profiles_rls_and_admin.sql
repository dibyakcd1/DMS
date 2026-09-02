-- MIGRATION: Fix Profiles RLS and Ensure Admin Role
-- This migration fixes the recursive RLS on profiles and ensures our main user has admin access.

DO $body$ 
BEGIN
  -- 1. Ensure user_roles table exists as it is referenced in multiple policies
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
    CREATE TABLE public.user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'owner', 'salesperson')),
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, role)
    );
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow admins to manage user_roles" ON public.user_roles FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
    CREATE POLICY "Allow users to view own roles" ON public.user_roles FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  -- 2. Fix Profiles RLS (Breaking Recursion)
  -- We use a helper function with SECURITY DEFINER to check roles without triggering RLS
  CREATE OR REPLACE FUNCTION public.check_is_admin()
  RETURNS boolean AS $inner$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    );
  END;
  $inner$ LANGUAGE plpgsql SECURITY DEFINER;

  -- Update Profiles Policies
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
  
  DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
  CREATE POLICY "profiles_read_own" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

  DROP POLICY IF EXISTS "profiles_read_admin" ON public.profiles;
  CREATE POLICY "profiles_read_admin" ON public.profiles
    FOR SELECT TO authenticated
    USING (public.check_is_admin());

  DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
  CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

  -- 3. Bootstrap Admin Profile for the user
  -- We'll try to find the user by email in auth.users and ensure they have an admin profile
  -- Note: This only works if the user has already signed in at least once.
  DECLARE
    v_user_id UUID;
  BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'mrwater.prov1@gmail.com';
    
    IF v_user_id IS NOT NULL THEN
      -- Ensure profile exists
      INSERT INTO public.profiles (id, full_name, role, updated_at)
      VALUES (v_user_id, 'Admin User', 'admin', now())
      ON CONFLICT (id) DO UPDATE 
      SET role = 'admin', updated_at = now();
      
      -- Also ensure user_roles has it
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END;

END $body$;
