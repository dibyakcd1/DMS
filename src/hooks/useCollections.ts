import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RecentPayment = {
  id: string;
  amount: number;
  paid_at: string;
  method: string;
  invoice: {
    invoice_number: string;
    shop: {
      name: string;
    } | null;
  } | null;
};

export type ShopOutstanding = {
  shop_id: string;
  shop_name: string;
  total_outstanding: number;
  invoice_count: number;
  last_order_at: string | null;
};

export function useCollections(userId: string | undefined, isAdmin: boolean) {
  return useQuery({
    queryKey: ['collections', userId, isAdmin],
    queryFn: async () => {
      if (!userId) return { outstandings: [], recentPayments: [], totalOutstanding: 0 };

      interface BaseInvoice {
        total: number;
        amount_paid: number;
        shop_id: string | null;
        created_at: string;
        payment_status?: string;
        status?: string;
        shop: { name: string } | null;
        order: {
          shop_id: string | null;
          salesperson_id: string;
          shop: { name: string } | null;
        } | null;
      }

      // 1. Fetch all unpaid/partial invoices with shop info
      let invs: BaseInvoice[] = [];
      try {
        let query = supabase
          .from("invoices")
          .select(`
            total, 
            amount_paid, 
            shop_id, 
            created_at,
            payment_status,
            shop:shops!invoices_shop_id_fkey (
              name
            ),
            order:orders!inner (
              shop_id,
              salesperson_id,
              shop:shops (name)
            )
          `)
          .neq("payment_status", "paid")
          .eq("is_void", false);

        if (!isAdmin) {
          query = query.eq("order.salesperson_id", userId);
        }

        const { data, error: invError } = await query;
        if (invError) throw invError;
        invs = (data as unknown as BaseInvoice[]) || [];
      } catch (err) {
        const pgError = err as { code?: string; message?: string };
        if (pgError.code === "42703" || pgError.message?.includes("payment_status")) {
          console.warn("Falling back useCollections invoices query to use status column instead of payment_status");
          let query = supabase
            .from("invoices")
            .select(`
              total, 
              amount_paid, 
              shop_id, 
              created_at,
              status,
              shop:shops!invoices_shop_id_fkey (
                name
              ),
              order:orders!inner (
                shop_id,
                salesperson_id,
                shop:shops (name)
              )
            `)
            .neq("status", "paid")
            .eq("is_void", false);

          if (!isAdmin) {
            query = query.eq("order.salesperson_id", userId);
          }

          const { data, error: fbError } = await query;
          if (fbError) throw fbError;
          
          invs = ((data as unknown as BaseInvoice[]) || []).filter(i => {
            const status = i.status || "unpaid";
            if (status === "paid") return false;
            const total = Number(i.total || 0);
            const paid = Number(i.amount_paid || 0);
            if (paid >= total && total > 0) return false;
            return true;
          });
        } else {
          throw err;
        }
      }

      // Aggregate by shop
      const shopMap = new Map<string, ShopOutstanding>();
      let overallTotal = 0;

      invs?.forEach(inv => {
        const actualShopId = inv.shop_id || (inv.order as { shop_id?: string } | null)?.shop_id;
        if (!actualShopId) return;
        
        const outstanding = Number(inv.total) - Number(inv.amount_paid);
        if (outstanding <= 0) return; 

        overallTotal += outstanding;
        const shopName = inv.shop?.name || (inv.order as { shop: { name: string } } | null)?.shop?.name || "Unknown Shop";

        const existing = shopMap.get(actualShopId) || {
          shop_id: actualShopId,
          shop_name: shopName,
          total_outstanding: 0,
          invoice_count: 0,
          last_order_at: null
        };

        existing.total_outstanding += outstanding;
        existing.invoice_count += 1;
        if (!existing.last_order_at || new Date(inv.created_at) > new Date(existing.last_order_at)) {
          existing.last_order_at = inv.created_at;
        }

        shopMap.set(actualShopId, existing);
      });

      const outstandings = Array.from(shopMap.values()).sort((a, b) => b.total_outstanding - a.total_outstanding);
      
      interface RawPayment {
        id: string;
        amount: number;
        paid_at?: string;
        created_at?: string;
        method?: string;
        payment_method?: string;
        notes?: string | null;
        invoice: {
          invoice_number: string;
          shop: { name: string } | null;
          order: { salesperson_id: string; shop: { name: string } | null } | null;
        } | null;
      }

      // 2. Recent payments with robust dynamic fallback for paid_at/created_at and payment_method/method
      let pays: RecentPayment[] = [];
      try {
        // We try selecting payment_method (which exists) first.
        let payQuery = supabase
          .from("payments")
          .select(`
            id,
            amount,
            paid_at,
            payment_method,
            notes,
            invoice:invoices!inner (
              invoice_number,
              shop:shops!invoices_shop_id_fkey (
                name
              ),
              order:orders!inner (
                salesperson_id,
                shop:shops (name)
              )
            )
          `)
          .order("paid_at", { ascending: false })
          .limit(20);

        if (!isAdmin) {
          payQuery = payQuery.eq("invoice.order.salesperson_id", userId);
        }

        const { data, error: payError } = await payQuery;
        if (payError) throw payError;
        pays = (data as unknown as RawPayment[]).map(p => {
          const isDiscount = p.notes?.toLowerCase().includes("discount");
          return {
            id: p.id,
            amount: p.amount,
            paid_at: p.paid_at || p.created_at || new Date().toISOString(),
            method: isDiscount ? "other" : (p.payment_method || p.method || "cash"),
            invoice: p.invoice ? {
              invoice_number: p.invoice.invoice_number,
              shop: p.invoice.shop || (p.invoice.order ? p.invoice.order.shop : null)
            } : null
          };
        });
      } catch (err) {
        const pgError = err as { code?: string; message?: string };
        const isColumnError = pgError.code === "42703" || pgError.message?.includes("payment_method") || pgError.message?.includes("method") || pgError.message?.includes("paid_at");
        console.warn("Retrying useCollections payments query with fallbacks. Error:", pgError.message);
        
        // Let's try selecting with 'method' and 'created_at' as fallbacks
        try {
          const selectField = pgError.message?.includes("payment_method") ? "method" : "payment_method";
          const timeField = (pgError.message?.includes("paid_at") || pgError.code === "42703") ? "created_at" : "paid_at";
          
          let payQueryFallback = supabase
            .from("payments")
            .select(`
              id,
              amount,
              notes,
              ${timeField},
              ${selectField},
              invoice:invoices!inner (
                invoice_number,
                shop:shops!invoices_shop_id_fkey (
                  name
                ),
                order:orders!inner (
                  salesperson_id,
                  shop:shops (name)
                )
              )
            `)
            .order(timeField, { ascending: false })
            .limit(20);

          if (!isAdmin) {
            payQueryFallback = payQueryFallback.eq("invoice.order.salesperson_id", userId);
          }

          const { data, error: fbErr } = await payQueryFallback;
          if (fbErr) {
            // Ultimate fallback - select *
            console.warn("Fallback query failed, doing select *");
            let payQueryStar = supabase
              .from("payments")
              .select("*, invoice:invoices!inner(invoice_number, shop:shops(name), order:orders!inner(salesperson_id, shop:shops(name)))");
            
            if (!isAdmin) {
              payQueryStar = payQueryStar.eq("invoice.order.salesperson_id", userId);
            }
            const { data: starData, error: starErr } = await payQueryStar.limit(20);
            if (starErr) throw starErr;
            
            pays = (starData as unknown as RawPayment[]).map(p => {
              const isDiscount = p.notes?.toLowerCase().includes("discount");
              return {
                id: p.id,
                amount: p.amount,
                paid_at: p.paid_at || p.created_at || new Date().toISOString(),
                method: isDiscount ? "other" : (p.payment_method || p.method || "cash"),
                invoice: p.invoice ? {
                  invoice_number: p.invoice.invoice_number,
                  shop: p.invoice.shop || (p.invoice.order ? p.invoice.order.shop : null)
                } : null
              };
            });
          } else {
            pays = (data as unknown as RawPayment[]).map(p => {
              const isDiscount = p.notes?.toLowerCase().includes("discount");
              return {
                id: p.id,
                amount: p.amount,
                paid_at: p[timeField as keyof RawPayment] || p.created_at || new Date().toISOString(),
                method: isDiscount ? "other" : (p[selectField as keyof RawPayment] || p.payment_method || p.method || "cash"),
                invoice: p.invoice ? {
                  invoice_number: p.invoice.invoice_number,
                  shop: p.invoice.shop || (p.invoice.order ? p.invoice.order.shop : null)
                } : null
              };
            });
          }
        } catch (innerErr) {
          console.error("All fallback queries failed in useCollections:", innerErr);
          pays = [];
        }
      }

      return {
        outstandings,
        recentPayments: pays,
        totalOutstanding: overallTotal
      };
    },
    enabled: !!userId,
    staleTime: 30000,
  });
}
