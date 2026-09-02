-- MIGRATION: Ensure Profiles Security
-- This ensures the profiles table has RLS enabled and users can read their own data.

DO $body$ 
BEGIN
  -- 1. Enable RLS
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  -- 2. Create Policies
  DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
  CREATE POLICY "profiles_read_own" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

  DROP POLICY IF EXISTS "profiles_read_admin" ON public.profiles;
  CREATE POLICY "profiles_read_admin" ON public.profiles
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'owner')
      )
    );

  DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
  CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

END $body$;
