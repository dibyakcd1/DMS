-- Fix PIN verification logic to use crypt() and include phone in result
-- This migration fixes the "plain text vs hash" comparison bug.

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
  v_stored_hash text;
  v_session_token text;
  v_profile record;
BEGIN
  -- Get the stored PIN hash for this profile
  SELECT pin_hash INTO v_stored_hash
  FROM public.salesperson_pins
  WHERE profile_id = p_profile_id AND is_active = true;

  -- Verify PIN using crypt
  IF v_stored_hash IS NULL OR crypt(p_pin, v_stored_hash) != v_stored_hash THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid PIN'
    );
  END IF;

  -- Get profile details, including phone
  SELECT id, full_name, role, phone
  INTO v_profile
  FROM public.profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Profile not found'
    );
  END IF;

  -- Create a new session token
  v_session_token := encode(gen_random_bytes(32), 'hex');

  -- Store session
  INSERT INTO public.salesperson_sessions (
    profile_id,
    session_token,
    expires_at
  ) VALUES (
    p_profile_id,
    v_session_token,
    now() + interval '12 hours'
  );

  -- Update last_used_at
  UPDATE public.salesperson_pins 
  SET last_used_at = now() 
  WHERE profile_id = p_profile_id;

  RETURN json_build_object(
    'success', true,
    'session_token', v_session_token,
    'profile', json_build_object(
      'id', v_profile.id,
      'full_name', v_profile.full_name,
      'role', v_profile.role,
      'phone', v_profile.phone
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin_v2(uuid, text) TO anon, authenticated;
