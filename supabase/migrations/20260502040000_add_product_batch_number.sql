-- Add batch_number to products table for tracking purposes
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS batch_number text;

-- Update types for applet
COMMENT ON COLUMN public.products.batch_number IS 'Tracking field for default or reference batch number';
