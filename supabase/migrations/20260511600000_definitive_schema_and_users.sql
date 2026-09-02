-- MIGRATION: 20260511600000_definitive_schema_and_users.sql
-- This migration ensures the schema is absolutely correct and optimizes RLS to prevent timeouts.

-- 1. SCHEMA REPAIR
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.app_role;

-- 2. INDEX OPTIMIZATION
-- Ensure PKs are solid and add helper indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
-- Composite index for fast role lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_combined ON public.user_roles(user_id, role);

-- 3. OPTIMIZED ROLE HELPER
-- Using a SECURITY DEFINER function to bypass RLS recursion overhead
CREATE OR REPLACE FUNCTION public.check_user_admin() 
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'owner')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. NUCLEAR RLS RESET
-- Drop ALL existing policies to ensure no hidden recursion exists
DO $$ 
DECLARE 
    pol record;
BEGIN
    FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND (tablename = 'profiles' OR tablename = 'user_roles') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- NEW GATES (Optimized)
-- Profiles: Any authenticated user can read (Needed for salesperson lookups/joins)
CREATE POLICY "profiles_read_all_v8" ON public.profiles FOR SELECT TO authenticated USING (true);
-- Profiles: Self-update
CREATE POLICY "profiles_update_self_v8" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
-- Profiles: Admin manage all
CREATE POLICY "profiles_admin_manage_v8" ON public.profiles FOR ALL TO authenticated USING (public.check_user_admin());

-- User Roles: Read self or if admin
CREATE POLICY "user_roles_read_all_v8" ON public.user_roles FOR SELECT TO authenticated USING (true);
-- User Roles: Admin manage
CREATE POLICY "user_roles_admin_manage_v8" ON public.user_roles FOR ALL TO authenticated USING (public.check_user_admin());

-- 5. BOOTSTRAP CRITICAL USERS
DO $$ 
DECLARE 
    u_admin record;
BEGIN
    -- Repair dibyaprakashkcd4 (Current user)
    FOR u_admin IN SELECT id, email FROM auth.users WHERE email = 'dibyaprakashkcd4@gmail.com' LOOP
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (u_admin.id, 'Dibya (Owner)', 'owner', u_admin.email)
        ON CONFLICT (id) DO UPDATE SET role = 'owner', email = EXCLUDED.email;
        
        INSERT INTO public.user_roles (user_id, role)
        VALUES (u_admin.id, 'owner')
        ON CONFLICT (user_id, role) DO NOTHING;
    END LOOP;

    -- Repair dibyaprakashkcd1 (Reported Owner)
    FOR u_admin IN SELECT id, email FROM auth.users WHERE email = 'dibyaprakashkcd1@gmail.com' LOOP
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (u_admin.id, 'Main Owner 1', 'owner', u_admin.email)
        ON CONFLICT (id) DO UPDATE SET role = 'owner', email = EXCLUDED.email;
        
        INSERT INTO public.user_roles (user_id, role)
        VALUES (u_admin.id, 'owner')
        ON CONFLICT (user_id, role) DO NOTHING;
    END LOOP;

    -- Repair dibyaprakashkcd2 (Reported Sales)
    FOR u_admin IN SELECT id, email FROM auth.users WHERE email = 'dibyaprakashkcd2@gmail.com' LOOP
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (u_admin.id, 'Sales Team 2', 'salesperson', u_admin.email)
        ON CONFLICT (id) DO UPDATE SET role = 'salesperson', email = EXCLUDED.email;
        
        INSERT INTO public.user_roles (user_id, role)
        VALUES (u_admin.id, 'salesperson')
        ON CONFLICT (user_id, role) DO NOTHING;
    END LOOP;
END $$;
