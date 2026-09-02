-- Migration: Add dibyaprakashkcd2 as owner
-- This ensures that the second admin account also has the owner role in the database.

-- Upgrade existing profile if it exists
UPDATE public.profiles 
SET role = 'owner' 
WHERE email = 'dibyaprakashkcd2@gmail.com';

-- Ensure it's in user_roles too
DO $body$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        INSERT INTO public.user_roles (user_id, role)
        SELECT id, 'owner' FROM public.profiles WHERE email = 'dibyaprakashkcd2@gmail.com'
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $body$;
