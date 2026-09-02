import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MappedInvoice {
  id: string;
  invoice_number: string;
  payment_status: string;
  type: string;
  total: number;
  amount_paid: number;
  is_void: boolean;
  created_at: string;
  order_number: string;
  order_status: string;
  order_date: string;
  delivered_at?: string | null;
  shop_name: string;
  shop_id: string | null;
  order_id: string;
}

export function useInvoices(search: string, category: string) {
  const pageSize = 50;
  
  return useInfiniteQuery({
    queryKey: ["invoices", search, category],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      let useFallback = false;
      let data: MappedInvoice[] | null = null;
      let count: number | null = null;

      try {
        let query = supabase
          .from("v_invoices_expanded")
          .select(`
            id,
            invoice_number,
            payment_status,
            type,
            total,
            amount_paid,
            is_void,
            created_at,
            order_number,
            order_status,
            order_date,
            shop_name,
            shop_id,
            order_id
          `, { count: 'exact' })
          .order("created_at", { ascending: false })
          .range(from, to);

        if (category === "unpaid") {
          query = query.eq("payment_status", "unpaid").eq("is_void", false);
        } else if (category === "partial") {
          query = query.eq("payment_status", "partial").eq("is_void", false);
        } else if (category === "paid") {
          query = query.eq("payment_status", "paid").eq("is_void", false);
        } else if (category === "void") {
          query = query.eq("is_void", true);
        } else {
          query = query.eq("is_void", false);
        }

        if (search) {
          query = query.or(`invoice_number.ilike.%${search}%,shop_name.ilike.%${search}%,order_number.ilike.%${search}%`);
        }

        const res = await query;
        if (res.error) {
          if (res.error.code === 'PGRST205' || res.error.message.includes("Could not find the table") || res.error.message.includes("does not exist")) {
            useFallback = true;
          } else {
            throw res.error;
          }
        } else {
          data = (res.data || []) as MappedInvoice[];
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
        console.warn("v_invoices_expanded missing from schema cache, falling back to basic invoices table join with client-side mapping & filter");
        let query = supabase
          .from("invoices")
          .select(`
            id,
            invoice_number,
            status,
            total,
            amount_paid,
            is_void,
            created_at,
            order_id,
            orders!left (
              order_number,
              status,
              order_date,
              delivered_at,
              shops!left (
                id,
                name
              )
            )
          `, { count: 'exact' })
          .order("created_at", { ascending: false })
          .range(from, to);

        if (category === "unpaid") {
          query = query.eq("status", "unpaid").eq("is_void", false);
        } else if (category === "partial") {
          query = query.eq("status", "partial").eq("is_void", false);
        } else if (category === "paid") {
          query = query.eq("status", "paid").eq("is_void", false);
        } else if (category === "void") {
          query = query.eq("is_void", true);
        } else {
          query = query.eq("is_void", false);
        }

        if (search) {
          query = query.or(`invoice_number.ilike.%${search}%`);
        }

        const res = await query;
        if (res.error) throw res.error;

        const mappedData = ((res.data || []) as Array<{
          id: string;
          invoice_number: string;
          status: string;
          total: number;
          amount_paid: number;
          is_void: boolean;
          created_at: string;
          order_id: string;
          orders: {
            order_number: string;
            status: string;
            order_date: string;
            shops: {
              id: string;
              name: string;
            } | {
              id: string;
              name: string;
            }[] | null;
          } | {
            order_number: string;
            status: string;
            order_date: string;
            shops: {
              id: string;
              name: string;
            } | {
              id: string;
              name: string;
            }[] | null;
          }[] | null;
        }>).map((item) => {
          const orderObj = Array.isArray(item.orders) ? item.orders[0] : item.orders;
          const shopObj = orderObj ? (Array.isArray(orderObj.shops) ? orderObj.shops[0] : orderObj.shops) : null;
          
          return {
            id: item.id,
            invoice_number: item.invoice_number,
            payment_status: item.status || "unpaid",
            type: "sales",
            total: item.total,
            amount_paid: item.amount_paid,
            is_void: item.is_void,
            created_at: item.created_at,
            order_number: orderObj?.order_number || "",
            order_status: orderObj?.status || "",
            order_date: orderObj?.order_date || "",
            delivered_at: (orderObj as unknown as { delivered_at?: string })?.delivered_at || null,
            shop_name: shopObj?.name || "Unassociated Shop",
            shop_id: shopObj?.id || null,
            order_id: item.order_id
          };
        });

        let filteredData = mappedData;
        if (search) {
          const lowerSearch = search.toLowerCase();
          filteredData = mappedData.filter((item) => 
            (item.invoice_number && item.invoice_number.toLowerCase().includes(lowerSearch)) ||
            (item.shop_name && item.shop_name.toLowerCase().includes(lowerSearch)) ||
            (item.order_number && item.order_number.toLowerCase().includes(lowerSearch))
          );
        }

        data = filteredData;
        count = res.count;
      }

      return { 
        data: data || [], 
        count, 
        nextPage: (data?.length || 0) === pageSize ? pageParam + 1 : undefined 
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: 30000,
  });
}

export function useVoidInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ is_void: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
