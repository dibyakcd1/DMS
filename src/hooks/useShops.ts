import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useShops(showInactive: boolean = false) {
  return useQuery({
    queryKey: ["shops", showInactive],
    queryFn: async () => {
      let query = supabase.from("shops").select("*").order("name");
      if (!showInactive) {
        query = query.eq("is_active", true);
      }
      const { data, error } = await query;
      if (error) throw error;
      
      type DatabaseRow = Record<string, string | number | boolean | null | undefined>;
      return (data || []).map((s: unknown) => {
        const row = s as DatabaseRow;
        return {
          ...row,
          shop_type: (row.shop_type as string | null | undefined) || "silver",
          discount_pct: Number(row.discount_pct || 0),
          gstin: (row.gstin as string | null | undefined) || null
        };
      });
    },
  });
}
