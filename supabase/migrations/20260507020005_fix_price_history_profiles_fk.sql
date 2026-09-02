-- Add missing foreign key from product_price_history to profiles
-- This allows PostgREST to perform joins between these tables

ALTER TABLE IF EXISTS public.product_price_history
DROP CONSTRAINT IF EXISTS product_price_history_changed_by_profiles_fkey;

ALTER TABLE public.product_price_history
ADD CONSTRAINT product_price_history_changed_by_profiles_fkey
FOREIGN KEY (changed_by)
REFERENCES public.profiles(id);
