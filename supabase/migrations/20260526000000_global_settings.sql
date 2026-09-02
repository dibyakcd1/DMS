-- Migration: Global Settings Table
CREATE TABLE IF NOT EXISTS public.global_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid REFERENCES public.profiles(id)
);

-- Enable RLS
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow public read access to global settings"
    ON public.global_settings FOR SELECT
    USING (true);

CREATE POLICY "Allow admins to update global settings"
    ON public.global_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'owner')
        )
    );

-- Seed default margins if not exists
INSERT INTO public.global_settings (key, value)
VALUES ('default_margins', '{"premium": 3, "gold": 5, "silver": 7, "bronze": 10, "basic": 15}'::jsonb)
ON CONFLICT (key) DO NOTHING;
