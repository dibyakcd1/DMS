import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Batch, Product } from "@/types";

export interface DBRecommendedBatchRow {
  id: string;
  product_id: string;
  batch_number: string;
  expiry_date: string;
  remaining_qty: number;
  warehouse_id: string | null;
  mfg_date?: string | null;
  cost_price?: number | null;
  landed_cost?: number | null;
  received_qty?: number | null;
  received_at?: string | null;
  notes?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  product_mrp?: number | null;
  product_division_category?: string | null;
  product_item_pack_type?: string | null;
  product_units_per_packet?: number | null;
  product_packets_per_case?: number | null;
  product_pack_size_value?: number | null;
  product_pack_size_unit?: string | null;
  product_unit_type?: string | null;
  product_units_per_case?: number | null;
  product_company_id?: string | null;
  product_brand?: string | null;
}

export function useRecommendedBatches(warehouseId?: string, search?: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["recommended-batches", warehouseId, search],
    queryFn: async ({ pageParam = 0 }) => {
      const isAllWarehouses = !warehouseId || warehouseId === "all" || warehouseId === "ALL" || warehouseId === "null";

      const pageSize = 100;
      let rawData: DBRecommendedBatchRow[] = [];
      let queryErr: { code?: string; message?: string } | null = null;

      try {
        let query = supabase
          .from("v_inventory_batch_details")
          .select("*, received_at:created_at")
          .gt("remaining_qty", 0)
          .order("expiry_date", { ascending: true })
          .order("created_at", { ascending: true })
          .range(pageParam, pageParam + pageSize - 1);

        if (!isAllWarehouses && warehouseId) {
          query = query.eq("warehouse_id", warehouseId);
        }

        if (search) {
          query = query.or(`product_name.ilike.%${search}%,product_sku.ilike.%${search}%,batch_number.ilike.%${search}%`);
        }

        const res = await query;
        if (res.error) {
          queryErr = { code: res.error.code, message: res.error.message };
        } else {
          rawData = (res.data || []) as DBRecommendedBatchRow[];
        }
      } catch (dbErr: unknown) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        queryErr = { message: errMsg };
      }

      if (queryErr && (queryErr.code === "PGRST205" || queryErr.message?.includes("does not exist"))) {
        console.warn("View v_inventory_batch_details is missing from schema cache, falling back to direct table query in useRecommendedBatches.");
        
        interface SimpleJoinedProd {
          id: string;
          name: string | null;
          sku: string | null;
          mrp: number | null;
          division_category: string | null;
          item_pack_type: string | null;
          units_per_packet: number | null;
          packets_per_case: number | null;
          pack_size_value: number | null;
          pack_size_unit: string | null;
          unit_type: string | null;
          units_per_case: number | null;
          company_id: string | null;
          brand: string | null;
        }

        interface SimpleBatchRow {
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
          product: SimpleJoinedProd | SimpleJoinedProd[] | null;
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
              division_category,
              item_pack_type,
              units_per_packet,
              packets_per_case,
              pack_size_value,
              pack_size_unit,
              unit_type,
              units_per_case,
              company_id,
              brand
            )
          `)
          .gt("remaining_qty", 0)
          .order("expiry_date", { ascending: true })
          .order("received_at", { ascending: true })
          .range(pageParam, pageParam + pageSize - 1);

        if (!isAllWarehouses && warehouseId) {
          query = query.eq("warehouse_id", warehouseId);
        }

        if (search) {
          query = query.or(`batch_number.ilike.%${search}%`);
        }

        const res = await query;
        if (res.error) throw res.error;

        rawData = ((res.data as unknown as SimpleBatchRow[]) ?? []).map((row) => {
          const p = Array.isArray(row.product) ? row.product[0] : row.product;
          return {
            id: row.id,
            product_id: row.product_id,
            batch_number: row.batch_number,
            expiry_date: row.expiry_date,
            remaining_qty: row.remaining_qty,
            warehouse_id: row.warehouse_id,
            mfg_date: row.mfg_date,
            cost_price: row.cost_price,
            landed_cost: row.landed_cost,
            received_qty: row.received_qty,
            received_at: row.received_at,
            notes: row.notes,
            product_name: p?.name,
            product_sku: p?.sku,
            product_mrp: p?.mrp,
            product_division_category: p?.division_category,
            product_item_pack_type: p?.item_pack_type,
            product_units_per_packet: p?.units_per_packet,
            product_packets_per_case: p?.packets_per_case,
            product_pack_size_value: p?.pack_size_value,
            product_pack_size_unit: p?.pack_size_unit,
            product_unit_type: p?.unit_type,
            product_units_per_case: p?.units_per_case,
            product_company_id: p?.company_id,
            product_brand: p?.brand
          };
        });
      } else if (queryErr) {
        throw new Error(queryErr.message);
      }

      const results = rawData.map((x) => ({
        ...x,
        product: {
          id: x.product_id,
          name: x.product_name,
          sku: x.product_sku,
          mrp: x.product_mrp,
          division_category: x.product_division_category,
          item_pack_type: x.product_item_pack_type,
          units_per_packet: x.product_units_per_packet,
          packets_per_case: x.product_packets_per_case,
          pack_size_value: x.product_pack_size_value,
          pack_size_unit: x.product_pack_size_unit,
          unit_type: x.product_unit_type,
          units_per_case: x.product_units_per_case,
          company_id: x.product_company_id,
          brand: x.product_brand,
        } as unknown as Product
      } as unknown as Batch));

      return {
        data: results,
        nextPage: results.length === pageSize ? pageParam + pageSize : undefined
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: enabled && (warehouseId === "all" || !warehouseId || warehouseId !== "null"),
  });
}
