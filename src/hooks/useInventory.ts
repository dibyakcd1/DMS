import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InventoryBatch {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  remaining_qty: number;
  warehouse_id: string | null;
  product?: {
    id: string;
    name: string;
    sku: string;
    mrp: number;
    min_stock: number;
    units_per_packet: number;
    packets_per_case: number;
    item_pack_type: string;
    division_category: string;
    pack_size_value?: number;
    pack_size_unit?: string;
  };
  warehouse?: {
    id: string;
    name: string;
    code: string | null;
  };
  mfg_date?: string | null;
  cost_price?: number;
  landed_cost?: number | null;
  received_qty?: number;
  received_at?: string;
  notes?: string | null;
}

export interface DBInventoryBatchRow {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  remaining_qty: number;
  warehouse_id: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  product_mrp?: number | null;
  product_min_stock?: number | null;
  product_units_per_packet?: number | null;
  product_packets_per_case?: number | null;
  product_item_pack_type?: string | null;
  product_division_category?: string | null;
  product_pack_size_value?: number | null;
  product_pack_size_unit?: string | null;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
  mfg_date?: string | null;
  cost_price?: number | null;
  landed_cost?: number | null;
  received_qty?: number | null;
  received_at?: string | null;
  notes?: string | null;
}

export function useInventory(search: string, warehouseId: string, category: string) {
  return useInfiniteQuery({
    queryKey: ["inventory", search, warehouseId, category],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const pageSize = 50;
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("v_inventory_batch_details")
        .select(`
          id,
          product_id,
          batch_number,
          expiry_date,
          remaining_qty,
          warehouse_id,
          product_name,
          product_sku,
          product_mrp,
          product_min_stock,
          product_units_per_packet,
          product_packets_per_case,
          product_item_pack_type,
          product_division_category,
          product_pack_size_value,
          product_pack_size_unit,
          warehouse_name,
          warehouse_code,
          mfg_date,
          cost_price,
          landed_cost,
          received_qty,
          received_at:created_at,
          notes
        `, { count: 'exact' });

      if (warehouseId && warehouseId !== "all") {
        query = query.eq("warehouse_id", warehouseId);
      }

      if (search) {
        query = query.or(`batch_number.ilike.%${search}%,product_name.ilike.%${search}%,product_sku.ilike.%${search}%`);
      }

      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date(); 
      in30.setDate(in30.getDate() + 30);
      const in30Iso = in30.toISOString().slice(0, 10);

      if (category === "Active") {
        query = query.gt("remaining_qty", 0).gte("expiry_date", today);
      } else if (category === "Expiring") {
        query = query.gt("remaining_qty", 0).gte("expiry_date", today).lte("expiry_date", in30Iso);
      } else if (category === "Expired") {
        query = query.lt("expiry_date", today);
      }

      let data: DBInventoryBatchRow[] | null = null;
      let count: number | null = null;
      let error: { code?: string; message?: string } | null = null;

      try {
        let query = supabase
          .from("v_inventory_batch_details")
          .select(`
            id,
            product_id,
            batch_number,
            expiry_date,
            remaining_qty,
            warehouse_id,
            product_name,
            product_sku,
            product_mrp,
            product_min_stock,
            product_units_per_packet,
            product_packets_per_case,
            product_item_pack_type,
            product_division_category,
            product_pack_size_value,
            product_pack_size_unit,
            warehouse_name,
            warehouse_code,
            mfg_date,
            cost_price,
            landed_cost,
            received_qty,
            received_at:created_at,
            notes
          `, { count: 'exact' });

        if (warehouseId && warehouseId !== "all") {
          query = query.eq("warehouse_id", warehouseId);
        }

        if (search) {
          query = query.or(`batch_number.ilike.%${search}%,product_name.ilike.%${search}%,product_sku.ilike.%${search}%`);
        }

        const today = new Date().toISOString().slice(0, 10);
        const in30 = new Date(); 
        in30.setDate(in30.getDate() + 30);
        const in30Iso = in30.toISOString().slice(0, 10);

        if (category === "Active") {
          query = query.gt("remaining_qty", 0).gte("expiry_date", today);
        } else if (category === "Expiring") {
          query = query.gt("remaining_qty", 0).gte("expiry_date", today).lte("expiry_date", in30Iso);
        } else if (category === "Expired") {
          query = query.lt("expiry_date", today);
        }

        const res = await query
          .order("expiry_date", { ascending: true })
          .range(from, to);
        data = res.data as DBInventoryBatchRow[];
        count = res.count;
        if (res.error) {
          error = { code: res.error.code, message: res.error.message };
        }
      } catch (dbErr: unknown) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        error = { message: errMsg };
      }

      if (error && (error.code === "PGRST205" || error.message?.includes("does not exist"))) {
        console.warn("View v_inventory_batch_details is missing from schema cache, falling back to direct table query.");
        
        // Define clean shape for joining product/warehouse rows without using any
        interface JoinedProd {
          id: string;
          name: string | null;
          sku: string | null;
          mrp: number | null;
          min_stock: number | null;
          units_per_packet: number | null;
          packets_per_case: number | null;
          item_pack_type: string | null;
          division_category: string | null;
          pack_size_value: number | null;
          pack_size_unit: string | null;
        }

        interface JoinedWH {
          id: string;
          name: string | null;
          code: string | null;
        }

        interface RawBatchRow {
          id: string;
          product_id: string;
          batch_number: string;
          expiry_date: string;
          remaining_qty: number;
          warehouse_id: string | null;
          mfg_date: string | null;
          cost_price: number | null;
          landed_cost: number | null;
          received_qty: number | null;
          received_at: string | null;
          notes: string | null;
          product: JoinedProd | JoinedProd[] | null;
          warehouse: JoinedWH | JoinedWH[] | null;
        }

        let query = supabase
          .from("inventory_batches")
          .select(`
            id,
            product_id,
            batch_number,
            expiry_date,
            remaining_qty,
            warehouse_id,
            mfg_date,
            cost_price,
            landed_cost,
            received_qty,
            received_at,
            notes,
            product:products(
              id,
              name,
              sku,
              mrp,
              min_stock,
              units_per_packet,
              packets_per_case,
              item_pack_type,
              division_category,
              pack_size_value,
              pack_size_unit
            ),
            warehouse:warehouses(
              id,
              name,
              code
            )
          `, { count: "exact" });

        if (warehouseId && warehouseId !== "all") {
          query = query.eq("warehouse_id", warehouseId);
        }

        if (search) {
          query = query.or(`batch_number.ilike.%${search}%`);
        }

        const today = new Date().toISOString().slice(0, 10);
        const in30 = new Date(); 
        in30.setDate(in30.getDate() + 30);
        const in30Iso = in30.toISOString().slice(0, 10);

        if (category === "Active") {
          query = query.gt("remaining_qty", 0).gte("expiry_date", today);
        } else if (category === "Expiring") {
          query = query.gt("remaining_qty", 0).gte("expiry_date", today).lte("expiry_date", in30Iso);
        } else if (category === "Expired") {
          query = query.lt("expiry_date", today);
        }

        const res = await query
          .order("expiry_date", { ascending: true })
          .range(from, to);

        if (res.error) throw res.error;

        data = ((res.data as unknown as RawBatchRow[]) ?? []).map((row) => {
          const p = Array.isArray(row.product) ? row.product[0] : row.product;
          const w = Array.isArray(row.warehouse) ? row.warehouse[0] : row.warehouse;
          return {
            id: row.id,
            product_id: row.product_id,
            batch_number: row.batch_number,
            expiry_date: row.expiry_date,
            remaining_qty: row.remaining_qty,
            warehouse_id: row.warehouse_id,
            product_name: p?.name,
            product_sku: p?.sku,
            product_mrp: p?.mrp,
            product_min_stock: p?.min_stock,
            product_units_per_packet: p?.units_per_packet,
            product_packets_per_case: p?.packets_per_case,
            product_item_pack_type: p?.item_pack_type,
            product_division_category: p?.division_category,
            product_pack_size_value: p?.pack_size_value,
            product_pack_size_unit: p?.pack_size_unit,
            warehouse_name: w?.name,
            warehouse_code: w?.code,
            mfg_date: row.mfg_date,
            cost_price: row.cost_price,
            landed_cost: row.landed_cost,
            received_qty: row.received_qty,
            received_at: row.received_at,
            notes: row.notes
          };
        });
        count = res.count;
      } else if (error) {
        throw new Error(error.message);
      }
      
      const transformed = (data || []).map(d => ({
        id: d.id,
        product_id: d.product_id,
        batch_number: d.batch_number,
        expiry_date: d.expiry_date,
        remaining_qty: d.remaining_qty || 0,
        warehouse_id: d.warehouse_id,
        mfg_date: d.mfg_date,
        cost_price: d.cost_price,
        landed_cost: d.landed_cost,
        received_qty: d.received_qty,
        received_at: d.received_at,
        notes: d.notes,
        product: {
          id: d.product_id,
          name: d.product_name || 'Unknown Product',
          sku: d.product_sku || 'NO-SKU',
          mrp: d.product_mrp,
          min_stock: d.product_min_stock,
          units_per_packet: d.product_units_per_packet,
          packets_per_case: d.product_packets_per_case,
          item_pack_type: d.product_item_pack_type,
          division_category: d.product_division_category,
          pack_size_value: d.product_pack_size_value,
          pack_size_unit: d.product_pack_size_unit,
        },
        warehouse: d.warehouse_id ? {
          id: d.warehouse_id,
          name: d.warehouse_name || 'Unknown Warehouse',
          code: d.warehouse_code,
        } : undefined
      }));

      return { 
        data: transformed as InventoryBatch[], 
        count: count || 0,
        nextPage: (data?.length || 0) < pageSize ? undefined : pageParam + 1
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 1000 * 60 * 5,
  });
}
