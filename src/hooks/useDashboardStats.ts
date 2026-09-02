import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export function useDashboardStats(warehouseId?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["dashboard-stats", warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_stats", { p_warehouse_id: warehouseId || null });
      if (error) throw error;
      
      const stats = data as Record<string, unknown>;
      
      // Fallback if migration haven't applied yet
      if (stats && stats['totalInventoryValue'] === undefined) {
        console.warn("Dashboard migration not yet applied. Fetching extra stats manually...");
        
        // Fetch Today's Collections
        const { data: collections } = await supabase
          .from("payments")
          .select("amount")
          .gte("created_at", new Date().toISOString().split('T')[0]);
        
        const todayCollections = (collections || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        
        // Fetch Inventory value (Approximate if huge, but we'll try)
        // For a really robust system, this must be server-side.
        // We'll set them to 0 or try a limited fetch if migration is missing.
        const mutableStats = stats as Record<string, unknown>;
        mutableStats['totalInventoryValue'] = 0; 
        mutableStats['todayCollections'] = todayCollections;
        mutableStats['warehouseSplit'] = [];
      }

      // Merge real invoice payment status for maximum reliability
      if (stats && Array.isArray(stats.recent)) {
        const orderIds = stats.recent.map((o) => (o as Record<string, unknown>).id).filter(Boolean);
        if (orderIds.length > 0) {
          let statusMap = new Map<string, string>();
          try {
            const { data: invoices, error: invError } = await supabase
              .from("invoices")
              .select("order_id, payment_status")
              .in("order_id", orderIds)
              .eq("is_void", false);
            
            if (!invError && invoices && invoices.length > 0) {
              statusMap = new Map(invoices.map((inv) => [inv.order_id, inv.payment_status]));
            } else if (invError && (invError.code === "42703" || invError.message?.includes("payment_status"))) {
              console.warn("Falling back useDashboardStats invoices query using status instead of payment_status");
              const { data: fallbackInvs } = await supabase
                .from("invoices")
                .select("order_id, status")
                .in("order_id", orderIds)
                .eq("is_void", false);
              
              if (fallbackInvs) {
                statusMap = new Map(fallbackInvs.map((inv) => [inv.order_id, inv.status || "unpaid"]));
              }
            }
          } catch (e) {
            console.warn("Failed to get payment status for dashboard stats", e);
          }
          
          if (statusMap.size > 0) {
            stats.recent = stats.recent.map((o) => {
              const order = o as Record<string, unknown>;
              return {
                ...order,
                payment_status: statusMap.get(order.id) || order.payment_status || "unpaid"
              };
            });
          }
        }
      }

      return stats;
    },
    staleTime: 30000, // 30 seconds
  });

  useEffect(() => {
    // Use a unique channel name per-instance to avoid collisions when the hook 
    // is used in multiple components (e.g. AppLayout and Home)
    const instanceId = Math.random().toString(36).substring(7);
    const channel = supabase
      .channel(`dashboard-realtime-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_batches" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
