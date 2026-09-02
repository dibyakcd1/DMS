-- MIGRATION: 20260511700000_recursion_killer.sql
-- This migration provides the ultimate fix for RLS recursion by using a SECURITY DEFINER function for all admin checks.

-- 1. HARDENED & NON-RECURSIVE ADMIN CHECK
CREATE OR REPLACE FUNCTION public.is_admin() 
RETURNS boolean AS $$
DECLARE
    is_adm boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('admin', 'owner')
    ) OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
    ) INTO is_adm;
    
    RETURN is_adm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. NUCLEAR POLICY REPLACEMENT
-- This function will drop and recreate policies for a specific table to use is_admin()
CREATE OR REPLACE FUNCTION public.fix_table_rls(t_name text) RETURNS void AS $$
DECLARE
    pol record;
BEGIN
    -- Drop all existing policies on the table
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t_name LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t_name);
    END LOOP;

    -- Basic READ policy for authenticated users (Adjust as needed per table)
    IF t_name IN ('profiles', 'user_roles', 'shops', 'warehouses', 'products', 'product_price_tiers', 'inventory', 'inventory_batches') THEN
        EXECUTE format('CREATE POLICY "read_all_auth_%I" ON public.%I FOR SELECT TO authenticated USING (true)', t_name, t_name);
    ELSE
        -- For sensitive tables, you might want more restrictive read policies, 
        -- but for this app's logic, many need list access.
        EXECUTE format('CREATE POLICY "read_all_auth_%I" ON public.%I FOR SELECT TO authenticated USING (true)', t_name, t_name);
    END IF;

    -- ADMIN/OWNER ALL policy
    EXECUTE format('CREATE POLICY "admin_all_%I" ON public.%I FOR ALL TO authenticated USING (public.is_admin())', t_name, t_name);
    
    -- Specific "Self" policies for profiles
    IF t_name = 'profiles' THEN
        EXECUTE format('CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid())');
        EXECUTE format('CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid())');
    END IF;
    
    -- Ensure RLS is enabled
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. APPLY TO ALL TABLES
SELECT public.fix_table_rls('profiles');
SELECT public.fix_table_rls('user_roles');
SELECT public.fix_table_rls('invoices');
SELECT public.fix_table_rls('payments');
SELECT public.fix_table_rls('orders');
SELECT public.fix_table_rls('order_items');
SELECT public.fix_table_rls('inventory');
SELECT public.fix_table_rls('inventory_batches');
SELECT public.fix_table_rls('stock_ledger');
SELECT public.fix_table_rls('warehouses');
SELECT public.fix_table_rls('shops');
SELECT public.fix_table_rls('products');
SELECT public.fix_table_rls('returns');
SELECT public.fix_table_rls('notifications');
SELECT public.fix_table_rls('grn_approval_log');
SELECT public.fix_table_rls('product_price_history');
SELECT public.fix_table_rls('salesperson_pins');
SELECT public.fix_table_rls('salesperson_sessions');

-- 4. ENSURE CRITICAL USERS EXIST & HAVE CORRECT ROLES
DO $$ 
DECLARE 
    uid_owner1 UUID;
    uid_sales2 UUID;
    uid_dev4 UUID;
BEGIN
    SELECT id INTO uid_owner1 FROM auth.users WHERE email = 'dibyaprakashkcd1@gmail.com';
    SELECT id INTO uid_sales2 FROM auth.users WHERE email = 'dibyaprakashkcd2@gmail.com';
    SELECT id INTO uid_dev4 FROM auth.users WHERE email = 'dibyaprakashkcd4@gmail.com';

    IF uid_owner1 IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (uid_owner1, 'Main Owner', 'owner', 'dibyaprakashkcd1@gmail.com')
        ON CONFLICT (id) DO UPDATE SET role = 'owner', email = EXCLUDED.email;
        INSERT INTO public.user_roles (user_id, role) VALUES (uid_owner1, 'owner') ON CONFLICT DO NOTHING;
    END IF;

    IF uid_sales2 IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (uid_sales2, 'Sales Representative', 'salesperson', 'dibyaprakashkcd2@gmail.com')
        ON CONFLICT (id) DO UPDATE SET role = 'salesperson', email = EXCLUDED.email;
        INSERT INTO public.user_roles (user_id, role) VALUES (uid_sales2, 'salesperson') ON CONFLICT DO NOTHING;
    END IF;

    IF uid_dev4 IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (uid_dev4, 'Developer/Owner', 'owner', 'dibyaprakashkcd4@gmail.com')
        ON CONFLICT (id) DO UPDATE SET role = 'owner', email = EXCLUDED.email;
        INSERT INTO public.user_roles (user_id, role) VALUES (uid_dev4, 'owner') ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 5. GRANTS
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
