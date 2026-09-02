-- MIGRATION: Assign Initial Owner
-- This assigns the owner role to the specific user mentioned by the developer.

-- 1. Ensure owner exists in app_role enum
-- Note: ALTER TYPE ADD VALUE cannot run inside a multi-statement transaction in some PG versions
-- but in Supabase simple SQL runners it usually works if called separately.
DO $body$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        BEGIN
            ALTER TYPE public.app_role ADD VALUE 'owner';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $body$;

-- 2. Ensure columns exist first
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. Perform the insert/update for BOTH emails mentioned
-- User ID ba709964-b616-4d1f-ae06-b30a682f6b21 for dibyaprakashkcd1@gmail.com
INSERT INTO public.profiles (id, email, role, full_name, updated_at)
VALUES ('ba709964-b616-4d1f-ae06-b30a682f6b21', 'dibyaprakashkcd1@gmail.com', 'owner', 'Owner', now())
ON CONFLICT (id) DO UPDATE SET 
    role = EXCLUDED.role,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = now();

-- Also try to find any profile with these emails and upgrade them
UPDATE public.profiles 
SET role = 'owner' 
WHERE email IN ('dibyaprakashkcd1@gmail.com', 'dibyaprakashkcd@gmail.com');

-- 4. Also insert into user_roles if that table exists and is used
DO $body$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        -- Add for the specific UID
        INSERT INTO public.user_roles (user_id, role)
        VALUES ('ba709964-b616-4d1f-ae06-b30a682f6b21', 'owner')
        ON CONFLICT (user_id, role) DO NOTHING;
        
        -- Add for any profile we just updated
        INSERT INTO public.user_roles (user_id, role)
        SELECT id, 'owner' FROM public.profiles WHERE role = 'owner'
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $body$;
