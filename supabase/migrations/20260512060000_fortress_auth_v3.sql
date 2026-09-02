-- MIGRATION: 20260512060000_fortress_auth_v3.sql
-- BHARAT MASALA — FORTRESS AUTH HARDENING
-- Addressing Critical Security Gaps from Item 10 & 11

-- 1. Add lock-out capability to pins
ALTER TABLE public.salesperson_pins ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
ALTER TABLE public.salesperson_pins ADD COLUMN IF NOT EXISTS lockout_until TIMESTAMPTZ;

-- 2. Create the setup_first_owner SECURITY DEFINER RPC
-- This prevents any logged-in user from just upserting 'owner' role
DROP FUNCTION IF EXISTS public.setup_first_owner(uuid, text, text);
CREATE OR REPLACE FUNCTION public.setup_first_owner(
  p_uid uuid,
  p_full_name text,
  p_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_count int;
BEGIN
  -- 1. Count existing owners/admins
  SELECT COUNT(*) INTO v_owner_count 
  FROM public.user_roles 
  WHERE role IN ('owner', 'admin');

  -- 2. Only proceed if system has zero admins/owners
  IF v_owner_count = 0 THEN
    -- Insert into profiles
    INSERT INTO public.profiles (id, full_name, email, role, updated_at)
    VALUES (p_uid, p_full_name, p_email, 'owner', now())
    ON CONFLICT (id) DO UPDATE
    SET role = 'owner', updated_at = now();

    -- Insert into user_roles
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_uid, 'owner')
    ON CONFLICT DO NOTHING;

    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_first_owner(uuid, text, text) TO authenticated;


-- 3. Create a lightweight session verification RPC
DROP FUNCTION IF EXISTS public.verify_staff_session_v2(text);
CREATE OR REPLACE FUNCTION public.verify_staff_session_v2(
  p_session_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.salesperson_sessions
    WHERE session_token = p_session_token
      AND expires_at > now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_session_v2(text) TO anon, authenticated;


-- 4. Harden verify_staff_pin_v2 with failed attempt tracking (Item 10)
DROP FUNCTION IF EXISTS public.verify_staff_pin_v2(uuid, text);
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
  v_pin_hash       text;
  v_is_active      boolean;
  v_failed_attempts int;
  v_lockout_until  timestamptz;
  v_profile        public.profiles%ROWTYPE;
  v_token          text;
BEGIN
  -- 1. Get pin data and current lockout state
  SELECT pin_hash, is_active, failed_attempts, lockout_until 
  INTO v_pin_hash, v_is_active, v_failed_attempts, v_lockout_until
  FROM public.salesperson_pins
  WHERE profile_id = p_profile_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No PIN configured');
  END IF;

  IF NOT v_is_active THEN
    RETURN json_build_object('success', false, 'error', 'Account is deactivated');
  END IF;

  -- 2. Check lockout
  IF v_lockout_until IS NOT NULL AND v_lockout_until > now() THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Too many failed attempts.',
      'lockout_remaining_seconds', floor(extract(epoch from (v_lockout_until - now())))
    );
  END IF;

  -- 3. Verify PIN
  IF v_pin_hash != crypt(p_pin, v_pin_hash) THEN
    -- Increment failed attempts
    UPDATE public.salesperson_pins 
    SET failed_attempts = v_failed_attempts + 1,
        lockout_until = CASE WHEN (v_failed_attempts + 1) >= 5 THEN now() + interval '15 minutes' ELSE NULL END
    WHERE profile_id = p_profile_id;

    RETURN json_build_object(
      'success', false, 
      'error', CASE WHEN (v_failed_attempts + 1) >= 5 THEN 'Too many attempts. Locked for 15m.' ELSE 'Incorrect PIN' END,
      'attempts_remaining', CASE WHEN (v_failed_attempts + 1) < 5 THEN 5 - (v_failed_attempts + 1) ELSE 0 END
    );
  END IF;

  -- 4. Success - Reset attempts
  UPDATE public.salesperson_pins 
  SET failed_attempts = 0, 
      lockout_until = NULL,
      last_used_at = now()
  WHERE profile_id = p_profile_id;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.salesperson_sessions (profile_id, session_token, expires_at)
  VALUES (p_profile_id, v_token, now() + interval '12 hours');

  RETURN json_build_object(
    'success', true,
    'session_token', v_token,
    'profile', json_build_object(
      'id',        v_profile.id,
      'full_name', v_profile.full_name,
      'role',      'salesperson'
    )
  );
END;
$$;

-- 5. Secure staff list (Item 10)
-- Remove phone from list and optionally require auth
DROP FUNCTION IF EXISTS public.get_salesperson_list() CASCADE;
CREATE OR REPLACE FUNCTION public.get_salesperson_list()
RETURNS TABLE (
  id uuid,
  full_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  INNER JOIN public.salesperson_pins sp ON sp.profile_id = p.id
  WHERE sp.is_active = true;
$$;

-- Alias for future-proofing
DROP FUNCTION IF EXISTS public.get_staff_list_v1();
CREATE OR REPLACE FUNCTION public.get_staff_list_v1()
RETURNS TABLE (id uuid, full_name text)
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT * FROM public.get_salesperson_list(); $$;

-- Grant to authenticated only to avoid public enumeration
REVOKE ALL ON FUNCTION public.get_salesperson_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_salesperson_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_list_v1() TO authenticated;
