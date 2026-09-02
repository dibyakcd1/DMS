import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { useDashboardStats } from "./useDashboardStats";
import { useCurrentUser } from "./useCurrentUser";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";

export type AdminStats = {
  pending: number;
  approved: number;
  dispatched: number;
  deliveredToday: number;
  salesToday: number;
  outstanding: number;
  pendingQueue: {
    id: string;
    order_number: string;
    total: number;
    created_at: string;
    salesperson_name: string;
    salesperson_id: string;
    shop: { name: string } | null;
  }[];
  lowStock: { 
    id: string; 
    name: string; 
    quantity: number; 
    min_stock: number; 
    units_per_packet: number;
    pack_size_value?: number | null;
    pack_size_unit?: string | null;
    case_qty_unit?: string | null;
    allowKg?: boolean;
  }[];
  expiring: { 
    id: string; 
    batch_number: string; 
    expiry_date: string; 
    remaining_qty: number; 
    product?: { 
      name: string;
      allowKg?: boolean;
      pack_size_value?: number | null;
      pack_size_unit?: string | null;
    } | null 
  }[];
  topShops: { shop_id: string; name: string; total: number }[];
  trend: { date: string; total: number }[];
  totalInventoryValue: number;
  todayCollections: number;
  warehouseSplit: { name: string; code: string; total_value: number; item_count: number }[];
  recent: {
    id: string;
    order_number: string;
    status: string;
    total: number;
    created_at: string;
    shop: { name: string } | null;
    payment_status?: string;
  }[];
  topSalespeople: { name: string; total: number }[];
};

export function useHomeQueue() {
  const currentUser = useCurrentUser();
  const { data: dashboardData, isLoading, error: queryError, refetch } = useDashboardStats(currentUser?.warehouse_id);
  const [acting, setActing] = React.useState<string | null>(null);
  const { user } = useAuth();

  const stats = React.useMemo(() => {
    if (!dashboardData) return null;
    const d = dashboardData as Record<string, unknown>;

    // Map lowStock to match local type expectations
    const lowStock = ((d.lowStock as unknown[]) || []).map((p: unknown) => ({
      id: String((p as Record<string, unknown>).id),
      name: String((p as Record<string, unknown>).name),
      min_stock: Number((p as Record<string, unknown>).min_stock || 0),
      quantity: Number((p as Record<string, unknown>).quantity ?? 0),
      units_per_packet: Number((p as Record<string, unknown>).units_per_packet || 1),
      pack_size_value: (p as Record<string, unknown>).pack_size_value as number | null,
      pack_size_unit: (p as Record<string, unknown>).pack_size_unit as string | null,
      allowKg: (String((p as Record<string, unknown>).pack_size_unit || '')).toLowerCase() === "kg",
    }));

    // Top shops mapping
    const topShops = ((d.topShops as unknown[]) || []).map((s: unknown) => ({
      shop_id: String((s as Record<string, unknown>).shop_id),
      name: String((s as Record<string, unknown>).name),
      total: Number((s as Record<string, unknown>).total || 0)
    }));

    // Trend mapping
    const trend = ((d.trend as unknown[]) || []).map((t: unknown) => ({
      date: String((t as Record<string, unknown>).date),
      total: Number((t as Record<string, unknown>).total || 0)
    }));

    // Recent mapping
    const recent = ((d.recent as unknown[]) || []).map((o: unknown) => ({
      id: String((o as Record<string, unknown>).id),
      order_number: String((o as Record<string, unknown>).order_number),
      status: String((o as Record<string, unknown>).status),
      total: Number((o as Record<string, unknown>).total || 0),
      created_at: String((o as Record<string, unknown>).created_at),
      shop: { name: String((o as Record<string, unknown>).shop_name || "—") },
      payment_status: String((o as Record<string, unknown>).payment_status || "unpaid")
    }));

    // Pending Queue hydration
    const pendingQueue = ((d.pendingQueue as unknown[]) || []).map((o: unknown) => ({
      id: String((o as Record<string, unknown>).id),
      order_number: String((o as Record<string, unknown>).order_number),
      total: Number((o as Record<string, unknown>).total || 0),
      created_at: String((o as Record<string, unknown>).created_at),
      salesperson_id: String((o as Record<string, unknown>).salesperson_id),
      salesperson_name: String((o as Record<string, unknown>).salesperson_name || "—"),
      shop: { name: String((o as Record<string, unknown>).shop_name || "—") }
    }));

    // Top Salespeople mapping
    const topSalespeople = ((d.topSalespeople as unknown[]) || []).map((s: unknown) => ({
      name: String((s as Record<string, unknown>).name || "Unknown"),
      total: Number((s as Record<string, unknown>).total || 0)
    }));

    // Expiring mapping
    const expiring = ((d.expiring as unknown[]) || []).map((b: unknown) => ({
      id: String((b as Record<string, unknown>).id),
      batch_number: String((b as Record<string, unknown>).batch_number),
      expiry_date: String((b as Record<string, unknown>).expiry_date),
      remaining_qty: Number((b as Record<string, unknown>).remaining_qty),
      product: {
        name: String((b as Record<string, unknown>).product_name || "Unknown Product")
      }
    }));

    return {
      pending: Number(d.pending || 0),
      approved: Number(d.approved || 0),
      dispatched: Number(d.dispatched || 0),
      deliveredToday: Number(d.deliveredToday || 0),
      salesToday: Number(d.salesToday || 0),
      outstanding: Number(d.outstanding || 0),
      pendingQueue,
      lowStock,
      expiring,
      topShops,
      trend,
      recent,
      topSalespeople,
      totalInventoryValue: Number(d.totalInventoryValue || 0),
      todayCollections: Number(d.todayCollections || 0),
      warehouseSplit: ((d.warehouseSplit as unknown[]) || []).map((w: Record<string, unknown>) => ({
        name: String(w.name || "Unknown"),
        code: String(w.code || ""),
        total_value: Number(w.total_value || 0),
        item_count: Number(w.item_count || 0)
      })),
    } as AdminStats;
  }, [dashboardData]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setActing(id);
    const { error } = await supabase
      .from("orders")
      .update({ 
        status: decision
      })
      .eq("id", id);
    setActing(null);
    if (error) {
      console.error('[Context] Order decision failed', error);
      toast.error(friendlyError(error));
      return;
    }
    toast.success(decision === "approved" ? "Order approved" : "Order rejected");
    refetch();
  };

  return { 
    stats, 
    isLoading, 
    queryError, 
    refetch, 
    acting, 
    decide 
  };
}
