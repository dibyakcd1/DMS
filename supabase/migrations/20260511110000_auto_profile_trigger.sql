-- Migration: Auto-create profiles on auth signup
-- This ensures that every new user has a profile record with a default 'salesperson' role.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $body$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, updated_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    'salesperson',
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);
  RETURN new;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users who don't have a profile
INSERT INTO public.profiles (id, email, role, full_name, updated_at)
SELECT id, email, 'salesperson', COALESCE(raw_user_meta_data->>'full_name', email), now()
FROM auth.users
ON CONFLICT (id) DO NOTHING;
