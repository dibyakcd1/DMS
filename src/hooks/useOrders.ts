import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MappedOrder {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  order_date: string;
  is_void: boolean;
  is_over_limit: boolean;
  shop_name: string;
  salesperson_name: string;
  salesperson_id: string;
}

export function useOrders(search: string, category: string, isAdmin: boolean, userId?: string, salespersonId?: string) {
  const pageSize = 50;
  
  return useInfiniteQuery({
    queryKey: ["orders", search, category, isAdmin, userId, salespersonId],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      let useFallback = false;
      let data: MappedOrder[] | null = null;
      let count: number | null = null;

      try {
        let query = supabase
          .from("v_orders_expanded")
          .select("id, order_number, status, total, created_at, order_date, is_void, is_over_limit, shop_name, salesperson_name, salesperson_id", { count: 'exact' })
          .order("order_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to);

        if (search) {
          query = query.or(`order_number.ilike.%${search}%,shop_name.ilike.%${search}%,salesperson_name.ilike.%${search}%`);
        }

        if (category !== "All") {
          let status = category.toLowerCase().replace(" ", "_");
          if (status === "pending") status = "pending_approval";
          query = query.eq("status", status);
        }

        if (!isAdmin && userId) {
          query = query.eq("salesperson_id", userId);
        } else if (salespersonId && salespersonId !== "all") {
          query = query.eq("salesperson_id", salespersonId);
        }

        const res = await query;
        if (res.error) {
          if (res.error.code === 'PGRST205' || res.error.message.includes("Could not find the table") || res.error.message.includes("does not exist")) {
            useFallback = true;
          } else {
            throw res.error;
          }
        } else {
          data = (res.data || []) as MappedOrder[];
          count = res.count;
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorCode = (err && typeof err === 'object' && 'code' in err) ? String((err as { code: unknown }).code) : '';
        if (errorCode === 'PGRST205' || errorMsg.includes("Could not find the table") || errorMsg.includes("does not exist")) {
          useFallback = true;
        } else {
          throw err;
        }
      }

      if (useFallback) {
        console.warn("v_orders_expanded missing from schema cache, falling back to basic orders table join with client-side mapping & filter");
        let query = supabase
          .from("orders")
          .select(`
            id,
            order_number,
            status,
            total,
            created_at,
            order_date,
            is_void,
            is_over_limit,
            salesperson_id,
            shop_id,
            shops!left (name),
            profiles!left (full_name)
          `, { count: 'exact' })
          .order("order_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to);

        if (search) {
          query = query.or(`order_number.ilike.%${search}%`);
        }

        if (category !== "All") {
          let status = category.toLowerCase().replace(" ", "_");
          if (status === "pending") status = "pending_approval";
          query = query.eq("status", status);
        }

        if (!isAdmin && userId) {
          query = query.eq("salesperson_id", userId);
        } else if (salespersonId && salespersonId !== "all") {
          query = query.eq("salesperson_id", salespersonId);
        }

        const res = await query;
        if (res.error) throw res.error;

        const mappedData = ((res.data || []) as Array<{
          id: string;
          order_number: string;
          status: string;
          total: number;
          created_at: string;
          order_date: string;
          is_void: boolean;
          is_over_limit: boolean;
          salesperson_id: string;
          shop_id: string;
          shops: { name: string } | { name: string }[] | null;
          profiles: { full_name: string } | { full_name: string }[] | null;
        }>).map((item) => {
          const shopObj = Array.isArray(item.shops) ? item.shops[0] : item.shops;
          const profileObj = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
          
          return {
            id: item.id,
            order_number: item.order_number,
            status: item.status,
            total: item.total,
            created_at: item.created_at,
            order_date: item.order_date,
            is_void: item.is_void,
            is_over_limit: item.is_over_limit,
            salesperson_id: item.salesperson_id,
            shop_name: shopObj?.name || "Unassociated Shop",
            salesperson_name: profileObj?.full_name || "Unknown Staff"
          };
        });

        let filteredData = mappedData;
        if (search) {
          const lowerSearch = search.toLowerCase();
          filteredData = mappedData.filter((item) => 
            item.order_number.toLowerCase().includes(lowerSearch) ||
            item.shop_name.toLowerCase().includes(lowerSearch) ||
            item.salesperson_name.toLowerCase().includes(lowerSearch)
          );
        }

        data = filteredData;
        count = res.count;
      }

      return { data: data || [], count, nextPage: (data?.length || 0) === pageSize ? pageParam + 1 : undefined };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
  });
}
