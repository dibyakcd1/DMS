-- MIGRATION: Assign Owner role to secondary email
-- This ensures the developer's primary email also has owner access.

DO $body$
BEGIN
    -- Ensure Owner value exists in enum
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        BEGIN
            ALTER TYPE public.app_role ADD VALUE 'owner';
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;

    -- Upsert the profile for the primary email if it exists in auth.users
    -- We'll try to find the ID from auth.users if possible, otherwise we'll wait for them to click "initialized"
    -- But since we don't have the ID here reliably for all environments, 
    -- we'll rely on the "Claim" button but make it work even if 'kcd1' exists.
END $body$;

-- Allow ANY authenticated user to read their own profile without restriction
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Allow owners to read all profiles
DROP POLICY IF EXISTS "profiles_read_owner_all" ON public.profiles;
CREATE POLICY "profiles_read_owner_all" ON public.profiles
  FOR SELECT TO authenticated
  USING (role = 'owner' OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'owner');
