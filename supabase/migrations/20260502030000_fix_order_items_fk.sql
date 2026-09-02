-- Ensure foreign key relationship between order_items and products
-- First, clean up any orphan records that would violate the constraint
DELETE FROM public.order_items WHERE product_id NOT IN (SELECT id FROM public.products);
DELETE FROM public.inventory_batches WHERE product_id NOT IN (SELECT id FROM public.products);

ALTER TABLE IF EXISTS public.order_items
DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_product_id_fkey
FOREIGN KEY (product_id)
REFERENCES public.products(id)
ON DELETE CASCADE;

-- Also check for inventory_batches to products if missing
ALTER TABLE IF EXISTS public.inventory_batches
DROP CONSTRAINT IF EXISTS inventory_batches_product_id_fkey;

ALTER TABLE public.inventory_batches
ADD CONSTRAINT inventory_batches_product_id_fkey
FOREIGN KEY (product_id)
REFERENCES public.products(id)
ON DELETE CASCADE;
