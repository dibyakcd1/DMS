-- PIN-Based Salesperson Access System
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- New table for salesperson pins
CREATE TABLE IF NOT EXISTS public.salesperson_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  label text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  CONSTRAINT salesperson_pins_profile_id_unique UNIQUE (profile_id)
);

ALTER TABLE public.salesperson_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and owners can manage pins"
  ON public.salesperson_pins
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

CREATE POLICY "No direct salesperson pin reads"
  ON public.salesperson_pins
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

-- New table for salesperson sessions (tracked in localStorage but verified server-side)
CREATE TABLE IF NOT EXISTS public.salesperson_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  device_hint text
);

ALTER TABLE public.salesperson_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sessions"
  ON public.salesperson_sessions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );

-- RPC to verify PIN
CREATE OR REPLACE FUNCTION public.verify_salesperson_pin(
  p_profile_id uuid,
  p_pin text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_pin_hash text;
  v_is_active boolean;
  v_profile public.profiles%ROWTYPE;
  v_session_token text;
BEGIN
  SELECT pin_hash, is_active INTO v_pin_hash, v_is_active
  FROM salesperson_pins
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

  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id AND role = 'salesperson';
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Account not found or not a salesperson');
  END IF;

  v_session_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO salesperson_sessions (profile_id, session_token, expires_at, device_hint)
  VALUES (p_profile_id, v_session_token, now() + interval '12 hours', NULL);

  UPDATE salesperson_pins SET last_used_at = now() WHERE profile_id = p_profile_id;

  RETURN json_build_object(
    'success', true,
    'session_token', v_session_token,
    'profile', json_build_object(
      'id', v_profile.id,
      'full_name', v_profile.full_name,
      'phone', v_profile.phone,
      'role', v_profile.role
    )
  );
END;
$body$;

GRANT EXECUTE ON FUNCTION public.verify_salesperson_pin TO anon, authenticated;

-- RPC to set salesperson PIN
CREATE OR REPLACE FUNCTION public.set_salesperson_pin(
  p_profile_id uuid,
  p_pin text,
  p_label text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_caller_role app_role;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'owner') THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF length(p_pin) != 4 OR p_pin !~ '^[0-9]{4}$' THEN
    RETURN json_build_object('success', false, 'error', 'PIN must be exactly 4 digits');
  END IF;

  INSERT INTO salesperson_pins (profile_id, pin_hash, label, created_by, is_active)
  VALUES (p_profile_id, crypt(p_pin, gen_salt('bf')), p_label, auth.uid(), true)
  ON CONFLICT (profile_id) DO UPDATE
    SET pin_hash = crypt(p_pin, gen_salt('bf')),
        label = COALESCE(p_label, salesperson_pins.label),
        is_active = true,
        created_by = auth.uid(),
        created_at = now();

  RETURN json_build_object('success', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.set_salesperson_pin TO authenticated;

-- RPC to get salesperson list for anon
DROP FUNCTION IF EXISTS public.get_salesperson_list() CASCADE;
CREATE OR REPLACE FUNCTION public.get_salesperson_list()
RETURNS TABLE(id uuid, full_name text, phone text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $body$
  SELECT p.id, p.full_name, p.phone
  FROM profiles p
  INNER JOIN salesperson_pins sp ON sp.profile_id = p.id
  WHERE p.role = 'salesperson' AND sp.is_active = true
  ORDER BY p.full_name;
$body$;
GRANT EXECUTE ON FUNCTION public.get_salesperson_list TO anon;
