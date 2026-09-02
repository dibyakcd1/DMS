-- MIGRATION: Assign 'owner' roles to specified email addresses
-- This replaces the hardcoded logic previously in AuthContext.tsx

DO $body$
DECLARE
    target_emails text[] := ARRAY[
        'mrwater.prov1@gmail.com',
        'dibyaprakashkcd@gmail.com',
        'dibyaprakashkcd1@gmail.com'
    ];
    email_addr text;
    v_user_id uuid;
BEGIN
    FOREACH email_addr IN ARRAY target_emails
    LOOP
        -- Find the user ID in auth.users by email
        SELECT id INTO v_user_id FROM auth.users WHERE email = email_addr;
        
        IF v_user_id IS NOT NULL THEN
            -- Update or insert into public.profiles
            INSERT INTO public.profiles (id, role, updated_at)
            VALUES (v_user_id, 'owner', now())
            ON CONFLICT (id) DO UPDATE
            SET role = 'owner', updated_at = now()
            WHERE public.profiles.role IS DISTINCT FROM 'owner';
            
            -- Also ensure they are in user_roles if that table is used for secondary roles
            INSERT INTO public.user_roles (user_id, role)
            VALUES (v_user_id, 'owner')
            ON CONFLICT (user_id, role) DO NOTHING;
            
            RAISE NOTICE 'Assigned owner role to user: % (%)', email_addr, v_user_id;
        ELSE
            RAISE NOTICE 'User with email % not found in auth.users', email_addr;
        END IF;
    END LOOP;
END $body$;
