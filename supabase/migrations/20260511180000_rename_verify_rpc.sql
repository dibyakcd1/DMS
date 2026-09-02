-- Migration: Rename verification RPC to bypass cache
-- This migration creates verify_staff_pin_v1 to ensure the system can authenticate salespeople.

DROP FUNCTION IF EXISTS public.verify_staff_pin_v1(uuid, text);

CREATE OR REPLACE FUNCTION public.verify_staff_pin_v1(
  p_profile_id uuid,
  p_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $body$
DECLARE
  v_pin_hash text;
  v_session_token text;
BEGIN
  -- Get the pin hash for this profile
  SELECT pin_hash INTO v_pin_hash
  FROM public.salesperson_pins
  WHERE profile_id = p_profile_id AND is_active = true;

  IF v_pin_hash IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'PIN not set or inactive');
  END IF;

  -- Verify the pin
  IF v_pin_hash = crypt(p_pin, v_pin_hash) THEN
    -- Update last used
    UPDATE public.salesperson_pins SET last_used_at = now() WHERE profile_id = p_profile_id;

    -- Create a session
    v_session_token := encode(gen_random_bytes(32), 'hex');
    
    INSERT INTO public.salesperson_sessions (profile_id, session_token, expires_at)
    VALUES (p_profile_id, v_session_token, now() + interval '12 hours');

    RETURN json_build_object(
      'success', true,
      'session_token', v_session_token,
      'profile', json_build_object(
        'id', p_profile_id,
        'full_name', (SELECT full_name FROM profiles WHERE id = p_profile_id),
        'phone', (SELECT phone FROM profiles WHERE id = p_profile_id),
        'role', (SELECT role FROM profiles WHERE id = p_profile_id)
      )
    );
  ELSE
    RETURN json_build_object('success', false, 'error', 'Invalid PIN');
  END IF;
END;
$body$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin_v1 TO anon, authenticated;

-- Keep old one as proxy
CREATE OR REPLACE FUNCTION public.verify_salesperson_pin(
  p_profile_id uuid,
  p_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
BEGIN
  RETURN public.verify_staff_pin_v1(p_profile_id, p_pin);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.verify_salesperson_pin TO anon, authenticated;
