-- Migration: Ensure salesperson_pins table and dependencies exist
-- This migration force-creates the PIN system tables if they are missing.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create salesperson_pins if missing
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

-- 2. Create salesperson_sessions if missing
CREATE TABLE IF NOT EXISTS public.salesperson_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 hours'),
  device_hint text
);

-- 3. Enable RLS
ALTER TABLE public.salesperson_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesperson_sessions ENABLE ROW LEVEL SECURITY;

-- 4. Re-apply Policies (idempotently)
DROP POLICY IF EXISTS "Admins and owners can manage pins" ON public.salesperson_pins;
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

DROP POLICY IF EXISTS "No direct salesperson pin reads" ON public.salesperson_pins;
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

DROP POLICY IF EXISTS "Admins can view sessions" ON public.salesperson_sessions;
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
