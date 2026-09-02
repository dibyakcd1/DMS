import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MyDayData = {
  todaySales: number;
  todayDelivered: number;
  pendingApproval: number;
  approved: number;
  inTransit: number;
  outstanding: number;
  myShops: { id: string; name: string; phone: string | null }[];
  todayOrders: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    created_at: string;
    shop: { name: string } | null;
  }[];
  recentApprovals: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    approved_at: string | null;
    shop: { name: string } | null;
  }[];
};

export function useMyDayData(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-day', userId],
    queryFn: async () => {
      if (!userId) throw new Error("User not authenticated");

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isoToday = today.toISOString();
      const dateToday = isoToday.split('T')[0];

      const [todayOrdersRes, pendingRes, approvedRes, dispatchedRes, recentApprovalsRes, shopsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, status, total, created_at, order_date, delivered_at, dispatched_at, shop:shops(name)")
          .eq("salesperson_id", userId)
          .or(`created_at.gte.${isoToday},order_date.eq.${dateToday},delivered_at.gte.${isoToday},dispatched_at.gte.${isoToday}`)
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("salesperson_id", userId)
          .eq("status", "pending_approval"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("salesperson_id", userId)
          .eq("status", "approved"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("salesperson_id", userId)
          .eq("status", "dispatched"),
        supabase
          .from("orders")
          .select("id, order_number, status, total, updated_at, shop:shops(name)")
          .eq("salesperson_id", userId)
          .in("status", ["approved", "rejected"])
          .order("updated_at", { ascending: false, nullsFirst: false })
          .limit(3),
        supabase.from("orders")
          .select("shop:shops(id, name, phone)")
          .eq("salesperson_id", userId)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      let invs: Array<Record<string, unknown>> | null = null;
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select("total, amount_paid, payment_status, order:orders!inner(salesperson_id)")
          .eq("order.salesperson_id", userId)
          .eq("is_void", false);
        
        if (!error && data) {
          invs = data.filter(i => i.payment_status !== "paid") as unknown as Array<Record<string, unknown>>;
        } else if (error && (error.code === "42703" || error.message?.includes("payment_status"))) {
          console.warn("Falling back useMyDayData invoices query to status/total amount_paid comparison");
          const { data: fallbackData } = await supabase
            .from("invoices")
            .select("total, amount_paid, status, order:orders!inner(salesperson_id)")
            .eq("order.salesperson_id", userId)
            .eq("is_void", false);
          
          if (fallbackData) {
            invs = fallbackData.filter(i => {
              const status = i.status || "unpaid";
              if (status === "paid") return false;
              const total = Number(i.total || 0);
              const paid = Number(i.amount_paid || 0);
              if (paid >= total && total > 0) return false;
              return true;
            }) as unknown as Array<Record<string, unknown>>;
          }
        }
      } catch (e) {
        console.warn("Failed to catch outstanding invoices in My Day data", e);
      }
      
      const outstanding = (invs ?? []).reduce((s, i) => s + (Number(i.total || 0) - Number(i.amount_paid || 0)), 0);

      const orders = (todayOrdersRes.data ?? []);
      const deliveredToday = orders.filter((o) => 
        (o.status === "delivered" && o.delivered_at && o.delivered_at >= isoToday) || 
        (o.status === "dispatched" && o.dispatched_at && o.dispatched_at >= isoToday)
      );
      const todaySales = deliveredToday.reduce((s, o) => s + Number(o.total || 0), 0);

      const myShopsRaw = (shopsRes.data ?? [])
        .map(o => o.shop as { id: string; name: string; phone: string | null })
        .filter(Boolean);
      const myShops = Array.from(new Map(myShopsRaw.map(s => [s.id, s])).values());

      return {
        todaySales,
        todayDelivered: deliveredToday.length,
        pendingApproval: pendingRes.count ?? 0,
        approved: approvedRes.count ?? 0,
        inTransit: dispatchedRes.count ?? 0,
        outstanding,
        myShops: myShops as MyDayData["myShops"],
        todayOrders: orders as MyDayData["todayOrders"],
        recentApprovals: (recentApprovalsRes.data ?? []).map(o => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          total: o.total,
          approved_at: o.updated_at,
          shop: o.shop
        })) as MyDayData["recentApprovals"],
      };
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}
