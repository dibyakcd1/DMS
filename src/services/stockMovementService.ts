import { supabase } from "@/integrations/supabase/client";

export type LedgerEntry = {
  id: string;
  product_id: string;
  batch_id?: string | null;
  batch_number: string | null;
  qty_transacted: number;
  entry_type: 'purchase' | 'dispatch' | 'adjustment' | 'reversal' | 'transfer' | string;
  reference_id: string | null;
  reference_type: string | null;
  notes: string | null;
  created_at: string;
  product_name: string;
  product_sku: string;
  units_per_packet: number;
  packets_per_case: number;
  order_number: string | null;
  shop_name: string | null;
  shop_location: string | null;
  purchase_invoice_number: string | null;
  supplier_name: string | null;
  from_warehouse_name: string | null;
  to_warehouse_name: string | null;
  created_by_name: string | null;
  cost_price?: number | null;
  landed_cost?: number | null;
};

export type StockMovementCounts = {
  all: number;
  purchase: number;
  dispatch: number;
  adjustment: number;
  reversal: number;
  transfer: number;
};

export async function fetchUnifiedStockMovements(): Promise<{
  entries: LedgerEntry[];
  counts: StockMovementCounts;
}> {
  const entriesMap = new Map<string, LedgerEntry>();

  // 1. Fetch Inventory Batches (Purchase Inwards)
  try {
    const { data: batches, error: bErr } = await supabase
      .from('inventory_batches')
      .select(`
        id,
        product_id,
        warehouse_id,
        purchase_invoice_id,
        batch_number,
        initial_qty,
        received_qty,
        remaining_qty,
        cost_price,
        landed_cost,
        created_at,
        received_at,
        notes,
        products (
          id,
          name,
          sku,
          units_per_packet,
          packets_per_case
        ),
        purchase_invoices (
          id,
          invoice_number,
          supplier_name,
          invoice_date,
          status
        ),
        warehouses (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (!bErr && batches) {
      for (const b of batches) {
        const prod = Array.isArray(b.products) ? b.products[0] : b.products;
        const pi = Array.isArray(b.purchase_invoices) ? b.purchase_invoices[0] : b.purchase_invoices;
        const wh = Array.isArray(b.warehouses) ? b.warehouses[0] : b.warehouses;
        const qty = Number(b.received_qty || b.initial_qty || b.remaining_qty || 0);

        const key = `batch-${b.id}`;
        entriesMap.set(key, {
          id: key,
          product_id: b.product_id,
          batch_id: b.id,
          batch_number: b.batch_number || null,
          qty_transacted: qty,
          entry_type: 'purchase',
          reference_id: b.purchase_invoice_id || null,
          reference_type: 'purchase_invoice',
          notes: b.notes || (pi ? `Inward GRN: #${pi.invoice_number}` : 'Purchase Inward'),
          created_at: b.received_at || b.created_at,
          product_name: prod?.name || 'Unknown Product',
          product_sku: prod?.sku || 'UNKNOWN',
          units_per_packet: prod?.units_per_packet || 1,
          packets_per_case: prod?.packets_per_case || 1,
          order_number: null,
          shop_name: null,
          shop_location: null,
          purchase_invoice_number: pi?.invoice_number || null,
          supplier_name: pi?.supplier_name || 'General Supplier',
          from_warehouse_name: null,
          to_warehouse_name: wh?.name || 'Central Warehouse',
          created_by_name: 'PURCHASE / GRN',
          cost_price: b.cost_price,
          landed_cost: b.landed_cost
        });
      }
    }
  } catch (err) {
    console.warn("Could not fetch inventory_batches for stock movements:", err);
  }

  // 2. Fetch Stock Ledger (Sales, Reversals, Adjustments)
  try {
    const { data: ledger, error: lErr } = await supabase
      .from('stock_ledger')
      .select(`
        id,
        product_id,
        batch_id,
        warehouse_id,
        qty_change,
        type,
        reference_id,
        reference_type,
        notes,
        created_at,
        performed_by,
        products (
          id,
          name,
          sku,
          units_per_packet,
          packets_per_case
        ),
        profiles (
          id,
          full_name
        ),
        warehouses (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (!lErr && ledger && ledger.length > 0) {
      // Resolve referenced orders for shops and order numbers
      const orderIds = ledger
        .filter(l => l.reference_type === 'order' && l.reference_id)
        .map(l => l.reference_id as string);

      type OrderLookup = {
        id: string;
        order_number: string;
        status: string;
        shops: { id: string; name: string; address?: string | null } | { id: string; name: string; address?: string | null }[] | null;
      };

      const orderMap = new Map<string, OrderLookup>();
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            status,
            shops (
              id,
              name,
              address
            )
          `)
          .in('id', Array.from(new Set(orderIds)));

        orders?.forEach(o => {
          orderMap.set(o.id, o as unknown as OrderLookup);
        });
      }

      // Resolve referenced purchase invoices if any in stock_ledger
      const piIds = ledger
        .filter(l => (l.reference_type === 'purchase_invoice' || l.reference_type === 'purchase') && l.reference_id)
        .map(l => l.reference_id as string);

      type PurchaseInvoiceLookup = {
        id: string;
        invoice_number: string;
        supplier_name: string | null;
      };

      const piMap = new Map<string, PurchaseInvoiceLookup>();
      if (piIds.length > 0) {
        const { data: pis } = await supabase
          .from('purchase_invoices')
          .select('id, invoice_number, supplier_name')
          .in('id', Array.from(new Set(piIds)));

        pis?.forEach(p => {
          piMap.set(p.id, p as PurchaseInvoiceLookup);
        });
      }

      for (const l of ledger) {
        const prod = Array.isArray(l.products) ? l.products[0] : l.products;
        const profile = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles;
        const wh = Array.isArray(l.warehouses) ? l.warehouses[0] : l.warehouses;
        const order = l.reference_type === 'order' && l.reference_id ? orderMap.get(l.reference_id) : null;
        const shop = order ? (Array.isArray(order.shops) ? order.shops[0] : order.shops) : null;
        const pi = (l.reference_type === 'purchase_invoice' || l.reference_type === 'purchase') && l.reference_id ? piMap.get(l.reference_id) : null;

        let normalizedType = 'adjustment';
        const rawType = (l.type || '').toLowerCase();
        if (rawType === 'sale' || rawType === 'dispatch') {
          normalizedType = 'dispatch';
        } else if (rawType === 'purchase' || rawType === 'inward') {
          normalizedType = 'purchase';
        } else if (rawType === 'reversal' || rawType === 'return') {
          normalizedType = 'reversal';
        } else if (rawType === 'transfer') {
          normalizedType = 'transfer';
        }

        const key = `ledger-${l.id}`;
        // If this exact transaction was already captured via batch, don't overwrite if batch has richer details
        if (!entriesMap.has(key)) {
          entriesMap.set(key, {
            id: key,
            product_id: l.product_id,
            batch_id: l.batch_id || null,
            batch_number: null,
            qty_transacted: Number(l.qty_change || 0),
            entry_type: normalizedType,
            reference_id: l.reference_id || null,
            reference_type: l.reference_type || null,
            notes: l.notes || null,
            created_at: l.created_at,
            product_name: prod?.name || 'Unknown Product',
            product_sku: prod?.sku || 'UNKNOWN',
            units_per_packet: prod?.units_per_packet || 1,
            packets_per_case: prod?.packets_per_case || 1,
            order_number: order?.order_number || null,
            shop_name: shop?.name || null,
            shop_location: shop?.address || null,
            purchase_invoice_number: pi?.invoice_number || null,
            supplier_name: pi?.supplier_name || null,
            from_warehouse_name: normalizedType === 'dispatch' ? wh?.name : null,
            to_warehouse_name: normalizedType === 'purchase' || normalizedType === 'reversal' ? wh?.name : null,
            created_by_name: profile?.full_name || 'SYSTEM'
          });
        }
      }
    }
  } catch (err) {
    console.warn("Could not fetch stock_ledger for stock movements:", err);
  }

  // 3. Fetch Inventory Movements (if table has rows)
  try {
    const { data: movements, error: mErr } = await supabase
      .from('inventory_movements')
      .select(`
        id,
        product_id,
        batch_id,
        warehouse_id,
        quantity,
        movement_type,
        reference_id,
        reference_type,
        notes,
        created_at,
        performed_by,
        products (
          id,
          name,
          sku,
          units_per_packet,
          packets_per_case
        ),
        profiles (
          id,
          full_name
        ),
        warehouses (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (!mErr && movements && movements.length > 0) {
      for (const m of movements) {
        const prod = Array.isArray(m.products) ? m.products[0] : m.products;
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const wh = Array.isArray(m.warehouses) ? m.warehouses[0] : m.warehouses;

        let normalizedType = 'adjustment';
        const rawType = (m.movement_type || '').toLowerCase();
        if (rawType === 'sale' || rawType === 'dispatch') {
          normalizedType = 'dispatch';
        } else if (rawType === 'purchase' || rawType === 'inward') {
          normalizedType = 'purchase';
        } else if (rawType === 'reversal' || rawType === 'return') {
          normalizedType = 'reversal';
        } else if (rawType === 'transfer') {
          normalizedType = 'transfer';
        }

        const key = `im-${m.id}`;
        if (!entriesMap.has(key)) {
          entriesMap.set(key, {
            id: key,
            product_id: m.product_id,
            batch_id: m.batch_id || null,
            batch_number: null,
            qty_transacted: Number(m.quantity || 0),
            entry_type: normalizedType,
            reference_id: m.reference_id || null,
            reference_type: m.reference_type || null,
            notes: m.notes || null,
            created_at: m.created_at,
            product_name: prod?.name || 'Unknown Product',
            product_sku: prod?.sku || 'UNKNOWN',
            units_per_packet: prod?.units_per_packet || 1,
            packets_per_case: prod?.packets_per_case || 1,
            order_number: null,
            shop_name: null,
            shop_location: null,
            purchase_invoice_number: null,
            supplier_name: null,
            from_warehouse_name: wh?.name || null,
            to_warehouse_name: null,
            created_by_name: profile?.full_name || 'SYSTEM'
          });
        }
      }
    }
  } catch (err) {
    console.warn("Could not fetch inventory_movements:", err);
  }

  // Convert to array and sort descending by timestamp
  const allEntries = Array.from(entriesMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Compute counts
  const counts: StockMovementCounts = {
    all: allEntries.length,
    purchase: allEntries.filter(e => e.entry_type === 'purchase').length,
    dispatch: allEntries.filter(e => e.entry_type === 'dispatch').length,
    adjustment: allEntries.filter(e => e.entry_type === 'adjustment').length,
    reversal: allEntries.filter(e => e.entry_type === 'reversal').length,
    transfer: allEntries.filter(e => e.entry_type === 'transfer').length,
  };

  return { entries: allEntries, counts };
}
