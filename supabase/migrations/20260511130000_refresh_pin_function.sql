-- Migration: Force refresh of set_salesperson_pin function
-- This migration re-defines the function to ensure the schema cache is updated.

CREATE OR REPLACE FUNCTION public.set_salesperson_pin(
  p_profile_id uuid,
  p_pin text,
  p_label text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
    SET pin_hash = EXCLUDED.pin_hash,
        label = COALESCE(p_label, salesperson_pins.label),
        is_active = true,
        created_by = auth.uid(),
        created_at = now();

  RETURN json_build_object('success', true);
END;
$body$;

GRANT EXECUTE ON FUNCTION public.set_salesperson_pin TO authenticated;
