-- MIGRATION: Allow Initial Profile Creation
-- This allows users to insert their own profile row, which is necessary for the initial setup.

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
