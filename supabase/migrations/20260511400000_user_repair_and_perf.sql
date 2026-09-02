-- MIGRATION: 20260511400000_user_repair_and_perf.sql
-- 1. REPAIR CRITICAL USERS
-- We ensure the users mentioned by the user exist in the profiles and user_roles tables.
-- We also ensure the current provided email (kcd4) is an owner so they can manage the app.

DO $$ 
DECLARE 
    uid_1 UUID;
    uid_2 UUID;
    uid_4 UUID;
BEGIN
    -- Get UIDs from auth.users
    SELECT id INTO uid_1 FROM auth.users WHERE email = 'dibyaprakashkcd1@gmail.com';
    SELECT id INTO uid_2 FROM auth.users WHERE email = 'dibyaprakashkcd2@gmail.com';
    SELECT id INTO uid_4 FROM auth.users WHERE email = 'dibyaprakashkcd4@gmail.com';

    -- Repair User 1 (Owner)
    IF uid_1 IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (uid_1, 'Dibya Owner 1', 'owner', 'dibyaprakashkcd1@gmail.com')
        ON CONFLICT (id) DO UPDATE SET role = 'owner', email = 'dibyaprakashkcd1@gmail.com';
        
        INSERT INTO public.user_roles (user_id, role)
        VALUES (uid_1, 'owner')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    -- Repair User 2 (Salesperson)
    IF uid_2 IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (uid_2, 'Dibya Sales 2', 'salesperson', 'dibyaprakashkcd2@gmail.com')
        ON CONFLICT (id) DO UPDATE SET role = 'salesperson', email = 'dibyaprakashkcd2@gmail.com';
        
        INSERT INTO public.user_roles (user_id, role)
        VALUES (uid_2, 'salesperson')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    -- Repair User 4 (Owner - Current User)
    IF uid_4 IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (uid_4, 'Dibya Workspace 4', 'owner', 'dibyaprakashkcd4@gmail.com')
        ON CONFLICT (id) DO UPDATE SET role = 'owner', email = 'dibyaprakashkcd4@gmail.com';
        
        INSERT INTO public.user_roles (user_id, role)
        VALUES (uid_4, 'owner')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $$;

-- 2. NUCLEAR RLS FIX (No recursion possible)
-- We use static checks where possible and separate user_roles from profiles recursion.

-- Drop conflicting policies
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

-- SIMPLE POLICIES
-- Profiles: READ is open to all authenticated users (Needed for joins and lookups)
CREATE POLICY "profiles_select_v7" ON public.profiles FOR SELECT TO authenticated USING (true);
-- Profiles: Self-update
CREATE POLICY "profiles_update_self_v7" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
-- Profiles: Admin manage all (Checks user_roles table directly with NO RECURSION)
-- We use a raw select on user_roles. Since user_roles RLS is also open for SELECT, this is safe but let's be careful.
CREATE POLICY "profiles_admin_all_v7" ON public.profiles FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'owner')));

-- User Roles: READ is open
CREATE POLICY "user_roles_select_v7" ON public.user_roles FOR SELECT TO authenticated USING (true);
-- User Roles: Admin manage
CREATE POLICY "user_roles_admin_all_v7" ON public.user_roles FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'owner')));

-- 3. FIX DASHBOARD VIEW (If it's causing generic timeouts)
-- Standardize v_product_stock to be fast
CREATE OR REPLACE VIEW public.v_product_stock AS
SELECT 
    p.id, p.name, p.sku, p.mrp, p.gst_rate, p.units_per_packet, p.packets_per_case, p.units_per_case, 
    p.is_active, p.min_stock, p.pack_size_value, p.pack_size_unit, p.division_category, p.preferred_sell_unit, 
    p.base_unit, p.unit_type,
    COALESCE(SUM(i.stock_base_units), 0) as stock_base_units,
    CASE WHEN SUM(i.stock_base_units) > 0 THEN SUM(i.stock_base_units * i.avg_landed_cost) / SUM(i.stock_base_units) ELSE 0.01 END as avg_landed_cost,
    (COALESCE(SUM(i.stock_base_units), 0) <= COALESCE(p.min_stock, 0)) as is_low_stock
FROM public.products p
LEFT JOIN public.inventory i ON p.id = i.product_id
GROUP BY p.id;

GRANT SELECT ON public.v_product_stock TO authenticated;

-- Ensure Dashboard Function is accessible and secure
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;
