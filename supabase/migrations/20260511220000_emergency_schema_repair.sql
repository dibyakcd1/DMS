-- Emergency Schema and Data Repair
-- 1. Ensure is_void exists in orders and invoices
DO $body$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'is_void') THEN
        ALTER TABLE public.orders ADD COLUMN is_void BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'is_void') THEN
        ALTER TABLE public.invoices ADD COLUMN is_void BOOLEAN DEFAULT FALSE;
    END IF;
END $body$;

-- 2. Ensure dibyaprakashkcd2@gmail.com has a profile with salesperson role
-- We attempt to find the user in auth.users to get their ID
DO $body$
DECLARE
    target_id UUID;
BEGIN
    SELECT id INTO target_id FROM auth.users WHERE email = 'dibyaprakashkcd2@gmail.com';
    
    IF target_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, full_name, role, updated_at)
        VALUES (target_id, 'dibyaprakashkcd2@gmail.com', 'Dibya Sales', 'salesperson', now())
        ON CONFLICT (id) DO UPDATE
        SET role = 'salesperson',
            email = 'dibyaprakashkcd2@gmail.com';
            
        -- Also ensure record in user_roles for redundancy
        INSERT INTO public.user_roles (user_id, role)
        VALUES (target_id, 'salesperson')
        ON CONFLICT DO NOTHING;
    END IF;
END $body$;

-- 3. Fix any profile where role is missing
UPDATE public.profiles SET role = 'salesperson' WHERE role IS NULL;
