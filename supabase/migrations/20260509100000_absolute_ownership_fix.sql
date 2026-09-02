-- MIGRATION: Absolute Ownership Fix
-- This ensures the developer's UID has full permissions and handles RLS gaps.

-- 1. Ensure the user is an owner in profiles
INSERT INTO public.profiles (id, email, role, full_name, updated_at)
VALUES ('ba709964-b616-4d1f-ae06-b30a682f6b21', 'dibyaprakashkcd1@gmail.com', 'owner', 'Owner', now())
ON CONFLICT (id) DO UPDATE SET 
    role = 'owner',
    updated_at = now();

-- 2. Ensure the user is an owner in user_roles
DO $body$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES ('ba709964-b616-4d1f-ae06-b30a682f6b21', 'owner')
        ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
END $body$;

-- 3. Fix RLS for Update (Crucial for the "Claim" button)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Fix RLS for user_roles so users can see their own
DROP POLICY IF EXISTS "Allow users to view own roles" ON public.user_roles;
CREATE POLICY "Allow users to view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
