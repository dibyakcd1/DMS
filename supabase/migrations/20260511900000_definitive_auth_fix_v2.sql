-- MIGRATION: 20260511900000_definitive_auth_fix_v2.sql
-- BHARAT MASALA — DEFINITIVE AUTH FIX (v2, corrected roles)
-- dibyaprakashkcd1@gmail.com = OWNER
-- dibyaprakashkcd2@gmail.com = SALESPERSON

-- 1. Wipe all conflicting RLS policies on both tables
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('profiles', 'user_roles')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;


-- 2. SECURITY DEFINER helper — reads user_roles without triggering RLS
CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'owner')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_owner() TO authenticated;


-- 3. Clean, non-recursive policies for user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ur_self_read"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "ur_admin_all"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin_or_owner())
  WITH CHECK (public.is_admin_or_owner());


-- 4. Clean, non-recursive policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pr_self_read"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "pr_admin_read_all"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin_or_owner());

CREATE POLICY "pr_self_insert"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "pr_self_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "pr_admin_all"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin_or_owner())
  WITH CHECK (public.is_admin_or_owner());


-- 5. Set the correct roles for BOTH users

-- 5a. dibyaprakashkcd1 = OWNER
INSERT INTO public.profiles (id, email, role, full_name, updated_at)
VALUES (
  'ba709964-b616-4d1f-ae06-b30a682f6b21',
  'dibyaprakashkcd1@gmail.com',
  'owner',
  'Owner',
  now()
)
ON CONFLICT (id) DO UPDATE
  SET role = 'owner',
      email = EXCLUDED.email,
      updated_at = now();

INSERT INTO public.user_roles (user_id, role)
VALUES ('ba709964-b616-4d1f-ae06-b30a682f6b21', 'owner')
ON CONFLICT (user_id, role) DO NOTHING;

DELETE FROM public.user_roles
WHERE user_id = 'ba709964-b616-4d1f-ae06-b30a682f6b21'
  AND role != 'owner';


-- 5b. dibyaprakashkcd2 = SALESPERSON
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users
  WHERE email = 'dibyaprakashkcd2@gmail.com';

  IF v_uid IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, role, full_name, updated_at)
    VALUES (v_uid, 'dibyaprakashkcd2@gmail.com', 'salesperson', 'Sales Person', now())
    ON CONFLICT (id) DO UPDATE
      SET role = 'salesperson',
          email = EXCLUDED.email,
          updated_at = now();

    DELETE FROM public.user_roles
    WHERE user_id = v_uid AND role = 'owner';

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'salesperson')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;


-- 6. Create the verify_staff_pin_v2 function
CREATE OR REPLACE FUNCTION public.verify_staff_pin_v2(
  p_profile_id uuid,
  p_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pin_hash  text;
  v_is_active boolean;
  v_profile   public.profiles%ROWTYPE;
  v_token     text;
BEGIN
  SELECT pin_hash, is_active INTO v_pin_hash, v_is_active
  FROM public.salesperson_pins
  WHERE profile_id = p_profile_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No PIN configured for this user');
  END IF;

  IF NOT v_is_active THEN
    RETURN json_build_object('success', false, 'error', 'This account is deactivated');
  END IF;

  IF v_pin_hash != crypt(p_pin, v_pin_hash) THEN
    RETURN json_build_object('success', false, 'error', 'Incorrect PIN');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_profile_id AND role = 'salesperson';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Account not found or not a salesperson');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.salesperson_sessions (profile_id, session_token, expires_at)
  VALUES (p_profile_id, v_token, now() + interval '12 hours');

  UPDATE public.salesperson_pins SET last_used_at = now()
  WHERE profile_id = p_profile_id;

  RETURN json_build_object(
    'success', true,
    'session_token', v_token,
    'profile', json_build_object(
      'id',        v_profile.id,
      'full_name', v_profile.full_name,
      'phone',     v_profile.phone,
      'role',      v_profile.role
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin_v2(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_staff_pin_v1(p_profile_id uuid, p_pin text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$ BEGIN RETURN public.verify_staff_pin_v2(p_profile_id, p_pin); END; $$;

CREATE OR REPLACE FUNCTION public.verify_salesperson_pin(p_profile_id uuid, p_pin text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN RETURN public.verify_staff_pin_v2(p_profile_id, p_pin); END; $$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin_v1(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_salesperson_pin(uuid, text) TO anon, authenticated;
