-- Migration: Correct role for dibyaprakashkcd2
-- This ensures the user is a salesperson as requested, not an owner.

UPDATE public.profiles 
SET role = 'salesperson' 
WHERE email = 'dibyaprakashkcd2@gmail.com';

-- Update user_roles if the table exists
DO $body$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        DELETE FROM public.user_roles 
        WHERE user_id IN (SELECT id FROM public.profiles WHERE email = 'dibyaprakashkcd2@gmail.com');
        
        INSERT INTO public.user_roles (user_id, role)
        SELECT id, 'salesperson' FROM public.profiles WHERE email = 'dibyaprakashkcd2@gmail.com'
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $body$;
