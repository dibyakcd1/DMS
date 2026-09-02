-- Migration: Add warehouse_id to profiles
-- Purpose: Allow restricting users (admins/salespeople) to a specific warehouse.

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'warehouse_id') THEN
    ALTER TABLE public.profiles ADD COLUMN warehouse_id UUID REFERENCES public.warehouses(id);
  END IF;
END $$;
