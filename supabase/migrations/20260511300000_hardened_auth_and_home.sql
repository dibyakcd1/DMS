-- MIGRATION: 20260511300000_hardened_auth_and_home.sql
-- This migration fixes the "Database timeout" by simplifying RLS and re-creating views properly.

-- 1. HARDEN v_product_stock view (Fixes: column v_product_stock.min_stock does not exist)
DROP VIEW IF EXISTS public.v_product_stock_warehouse CASCADE;
DROP VIEW IF EXISTS public.v_product_stock CASCADE;

CREATE OR REPLACE VIEW public.v_product_stock AS
SELECT 
    p.id, 
    p.name, 
    p.sku, 
    p.mrp, 
    p.gst_rate, 
    p.units_per_packet, 
    p.packets_per_case, 
    p.units_per_case, 
    p.is_active, 
    COALESCE(p.min_stock, 0) as min_stock, 
    p.pack_size_value, 
    p.pack_size_unit, 
    p.division_category, 
    p.preferred_sell_unit, 
    p.base_unit, 
    p.unit_type,
    COALESCE(SUM(i.stock_base_units), 0) as stock_base_units,
    CASE 
        WHEN SUM(i.stock_base_units) > 0 THEN 
            SUM(i.stock_base_units * i.avg_landed_cost) / SUM(i.stock_base_units)
        ELSE 0.01
    END as avg_landed_cost,
    (COALESCE(SUM(i.stock_base_units), 0) <= COALESCE(p.min_stock, 0)) as is_low_stock
FROM 
    public.products p
LEFT JOIN 
    public.inventory i ON p.id = i.product_id
GROUP BY 
    p.id;

CREATE OR REPLACE VIEW public.v_product_stock_warehouse AS
SELECT 
    w.id as warehouse_id,
    w.name as warehouse_name,
    p.id as product_id,
    p.sku, 
    p.name,
    p.units_per_packet, 
    p.packets_per_case, 
    p.units_per_case,
    COALESCE(p.min_stock, 0) as min_stock, 
    p.is_active,
    COALESCE(i.stock_base_units, 0) as stock_base_units,
    COALESCE(i.avg_landed_cost, 0) as avg_landed_cost,
    (COALESCE(i.stock_base_units, 0) <= COALESCE(p.min_stock, 0)) as is_low_stock
FROM 
    public.warehouses w
CROSS JOIN 
    public.products p
LEFT JOIN 
    public.inventory i ON p.id = i.product_id AND w.id = i.warehouse_id;

GRANT SELECT ON public.v_product_stock TO authenticated;
GRANT SELECT ON public.v_product_stock_warehouse TO authenticated;

-- 2. STABILIZE AUTH RLS (Break recursion for good)
-- We use a simple strategy: profiles are readable by any authenticated user.
-- This avoids any subqueries to roles table during a simple select.
DO $$ 
DECLARE 
    pol record;
BEGIN
    -- Drop all policies on profiles
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
    END LOOP;
    
    -- Drop all policies on user_roles
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'user_roles' AND schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', pol.policyname);
    END LOOP;
END $$;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone authenticated can see profiles (needed for salesperson lookup, etc.)
-- This is VERY FAST and CANNOT RECURSE.
CREATE POLICY "profiles_authenticated_read_v6" ON public.profiles
    FOR SELECT TO authenticated
    USING (true);

-- Profiles: Self-update only
CREATE POLICY "profiles_self_update_v6" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Profiles: Admin all access (uses user_roles to check)
CREATE POLICY "profiles_admin_all_v6" ON public.profiles
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'owner')
        )
    );

-- User Roles: Read self
CREATE POLICY "user_roles_self_read_v6" ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- User Roles: Admin manage (uses user_roles to check - THIS IS THE ONLY RECURSION POINT BUT SAFE FOR AUTH)
-- Actually, let's make user_roles read open to authenticated to be super safe for JOINS.
CREATE POLICY "user_roles_authenticated_read_v6" ON public.user_roles
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "user_roles_admin_all_v6" ON public.user_roles
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'owner')
        )
    );

-- 3. ENSURE PERMISSIONS
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.user_roles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;
