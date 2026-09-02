-- Migration: Allow admins and owners to update other profiles
-- This fixed the issue where the "Identity Control" panel would fail for management actions.

-- First check if the policy exists to be idempotent
DO $body$
BEGIN
    DROP POLICY IF EXISTS "profiles_update_management" ON public.profiles;
    
    CREATE POLICY "profiles_update_management" ON public.profiles
      FOR UPDATE TO authenticated
      USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'owner')
      )
      WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'owner')
      );
END $body$;
