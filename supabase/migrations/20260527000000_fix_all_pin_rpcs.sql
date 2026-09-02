-- Migration: 20260527000000_fix_all_pin_rpcs.sql
-- Goal: Fix all PIN-related RPCs to avoid profiles.role and ensure consistency.

-- 1. Fix get_salesperson_list
DROP FUNCTION IF EXISTS public.get_salesperson_list() CASCADE;
CREATE OR REPLACE FUNCTION public.get_salesperson_list()
RETURNS TABLE(id uuid, full_name text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.full_name, p.phone
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  INNER JOIN public.salesperson_pins sp ON sp.profile_id = p.id
  WHERE ur.role = 'salesperson'
    AND sp.is_active = true
  ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_salesperson_list() TO anon, authenticated;

-- 2. Fix get_staff_list_v1 (Alias)
DROP FUNCTION IF EXISTS public.get_staff_list_v1() CASCADE;
CREATE OR REPLACE FUNCTION public.get_staff_list_v1()
RETURNS TABLE(id uuid, full_name text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.get_salesperson_list();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_list_v1() TO anon, authenticated;

-- 3. Fix verify_staff_pin_v2 (Ensure it doesn't use profiles.role)
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
  v_full_name      text;
  v_phone          text;
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
    SET failed_attempts = COALESCE(v_failed_attempts, 0) + 1,
        lockout_until = CASE WHEN (COALESCE(v_failed_attempts, 0) + 1) >= 5 THEN now() + interval '15 minutes' ELSE NULL END
    WHERE profile_id = p_profile_id;

    RETURN json_build_object(
      'success', false, 
      'error', CASE WHEN (COALESCE(v_failed_attempts, 0) + 1) >= 5 THEN 'Too many attempts. Locked for 15m.' ELSE 'Incorrect PIN' END,
      'attempts_remaining', CASE WHEN (COALESCE(v_failed_attempts, 0) + 1) < 5 THEN 5 - (COALESCE(v_failed_attempts, 0) + 1) ELSE 0 END
    );
  END IF;

  -- 4. Success - Reset attempts
  UPDATE public.salesperson_pins 
  SET failed_attempts = 0, 
      lockout_until = NULL,
      last_used_at = now()
  WHERE profile_id = p_profile_id;

  SELECT full_name, phone INTO v_full_name, v_phone FROM public.profiles WHERE id = p_profile_id;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.salesperson_sessions (profile_id, session_token, expires_at)
  VALUES (p_profile_id, v_token, now() + interval '12 hours');

  RETURN json_build_object(
    'success', true,
    'session_token', v_token,
    'profile', json_build_object(
      'id',        p_profile_id,
      'full_name', v_full_name,
      'phone',     v_phone,
      'role',      'salesperson'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin_v2(uuid, text) TO anon, authenticated;
