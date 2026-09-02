import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types";

interface UseProductsOptions {
  warehouseId?: string;
  search?: string;
  enabled?: boolean;
}

export function useProducts({ warehouseId, search, enabled = true }: UseProductsOptions) {
  return useInfiniteQuery({
    queryKey: ["products", warehouseId, search],
    queryFn: async ({ pageParam = 0 }) => {
      if (!warehouseId || warehouseId === "null") return { data: [], nextPage: undefined };

      const pageSize = 50;
      let query = supabase
        .from("v_product_stock_warehouse")
        .select("id, name, sku, stock_base_units, avg_landed_cost, units_per_packet, packets_per_case, item_pack_type, division_category, mrp, is_active")
        .eq("warehouse_id", warehouseId)
        .eq("is_active", true)
        .order("name")
        .range(pageParam, pageParam + pageSize - 1);

      if (search) {
        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const results = (data ?? []).map((x) => ({
        ...x,
        inventory: { 
          stock_base_units: (x as unknown as { stock_base_units: number }).stock_base_units, 
          avg_landed_cost: (x as unknown as { avg_landed_cost: number }).avg_landed_cost 
        }
      } as unknown as Product));

      return {
        data: results,
        nextPage: results.length === pageSize ? pageParam + pageSize : undefined
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: enabled && !!warehouseId && warehouseId !== "null",
    staleTime: 60000, // 1 minute
  });
}
