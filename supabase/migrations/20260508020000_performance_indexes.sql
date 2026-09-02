
-- PERFORMANCE INDEXES MIGRATION
-- This migration adds indexes to frequently queried columns to improve overall application speed.
-- Corrected for actual schema column names.

BEGIN;

-- 1. Products Indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_division_category ON public.products(division_category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products(brand);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);

-- 2. Orders & Order Items Indexes
CREATE INDEX IF NOT EXISTS idx_orders_shop_id ON public.orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_delivered_at ON public.orders(delivered_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);

-- 3. Inventory & Batches Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_id ON public.inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_warehouse_id ON public.inventory_batches(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_purchase_invoice_id ON public.inventory_batches(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry_date ON public.inventory_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_remaining_qty ON public.inventory_batches(remaining_qty);

-- 4. Stock Ledger Indexes
CREATE INDEX IF NOT EXISTS idx_stock_ledger_product_id ON public.stock_ledger(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_batch_id ON public.stock_ledger(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_reference_id ON public.stock_ledger(reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_created_at ON public.stock_ledger(created_at);

-- 5. Invoices & Payments Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_shop_id ON public.invoices(shop_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_shop_id ON public.payments(shop_id);

-- 6. Shops Indexes
CREATE INDEX IF NOT EXISTS idx_shops_name ON public.shops(name);
CREATE INDEX IF NOT EXISTS idx_shops_route ON public.shops(route);

-- 7. Inventory
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse_id ON public.inventory(warehouse_id);

COMMIT;
