import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { fmtINR } from "@/lib/format";

export interface PeriodMetric {
  value: number;
  prevValue: number;
  delta: number;
}

export interface SmartInsight {
  type: 'positive' | 'action_needed' | 'urgent';
  title: string;
  description: string;
  label: string;
}

export interface PerformanceMetric {
  metric: string;
  this_period: number;
  prev_period: number;
  delta: number;
  format: 'currency' | 'number' | 'percent';
}

export interface ComparisonRow {
  label: string;
  current: string;
  prev: string;
  delta: string;
  deltaType: 'up' | 'down';
}

export interface ReportData {
  todaySales: number;
  monthlyRevenue: PeriodMetric;
  monthlyProfit: PeriodMetric;
  grossProfit: PeriodMetric;
  cogs: PeriodMetric;
  discounts: PeriodMetric;
  orders: PeriodMetric;
  profitMargin: PeriodMetric;
  avgOrderValue: PeriodMetric;
  collections: PeriodMetric;
  growthRate: number;
  targetHitRate: number;
  outstanding: {
    overdue: number;
    pending: number;
  };
  smartInsights: SmartInsight[];
  performanceMetrics: PerformanceMetric[];
  spList: { name: string; delivered: number; orders: number; delta?: number; prevDelivered?: number }[];
  taxInv: { val: number, delta: number };
  cashMemo: { val: number, delta: number };
  dailySales: { date: string; amount: number; profit: number }[];
  dailyProfitTrend: { date: string; profit: number; revenue: number }[];
  productStats: { name: string; sales: number; profit: number; delta?: number; realizedMargin?: number; landedCost?: number }[];
  shopTypeSales: { type: string; amount: number; percent: number; icon: string }[];
  orderStatus: { status: string; count: number; color: string }[];
  peakInsight: { day: string; percent: number; insight: string };
  reorderValue: number;
  stockTurnover: number;
  inventoryHealth: number;
  margins: { date: string; margin: number }[];
  categoryPerformance: { product_name: string; avg_landed_cost: number; realized_margin_percent: number; realized_profit: number }[];
  topTenProducts: { name: string; sales: number; profit: number; delta: number; realizedMargin: number }[];
  orderStatusBreakdown: { status: string; count: number; percentage: number }[];
  inventoryReport: InventoryReportItem[];
  comparisonTable: ComparisonRow[];
}

export interface InventoryReportItem {
  id: string;
  sku: string;
  name: string;
  valuation: number;
  base_qty: number;
  cases: number;
  packets: number;
  units: number;
  weight: string;
  status: 'OOS' | 'LOW' | 'HEALTHY';
}

interface OrderItemJoin {
  line_total: number;
  line_total_tax_exclusive: number;
  product_id: string;
  unit_price: number;
  quantity: number;
  products: { name: string; division_category?: string } | null;
  orders: {
    id: string;
    created_at: string;
    status: string;
    salesperson_id: string;
    shop_id: string;
    subtotal: number;
    total: number;
    profiles: { full_name: string | null } | null;
  } | null;
  order_batch_deductions: {
    qty_base_units: number;
    inventory_batches: { landed_cost: number } | null;
  }[] | null;
}

export function useReportsData() {
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<ReportData | null>(null);

  const loadData = React.useCallback(async (startDate: Date, endDate: Date, revenueTarget: number, marginFloor: number) => {
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      const curStart = new Date(startDate);
      curStart.setHours(0, 0, 0, 0);
      
      const curEnd = new Date(endDate);
      curEnd.setHours(23, 59, 59, 999);

      // Previous period for comparison (same duration)
      const durationMs = curEnd.getTime() - curStart.getTime();
      const prevEnd = new Date(curStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs);

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // 1. Fetch Summary & Raw Data
      const [
        { data: curSummary, error: curSumError },
        { data: prevSummary, error: prevSumError },
        { data: allInvoices, error: invError },
        { data: todayOrders, error: todayOrdersError },
        { data: shopData, error: shopDataError },
        { data: productsData, error: productsError },
        { data: inventoryData, error: inventoryError },
        marginResponse,
        { data: rawOrders, error: ordersError }
      ] = await Promise.all([
        supabase.from("summary_daily_performance").select("*").gte("date", curStart.toISOString().split('T')[0]).lte("date", curEnd.toISOString().split('T')[0]),
        supabase.from("summary_daily_performance").select("*").gte("date", prevStart.toISOString().split('T')[0]).lte("date", prevEnd.toISOString().split('T')[0]),
        // Robust invoices query with fallback for payment_status and type/invoice_type
        (async () => {
          interface InvoicesRow {
            id: string;
            total: number;
            amount_paid: number;
            created_at: string;
            payment_status?: string;
            status?: string;
            type?: string;
            invoice_type?: string;
          }

          const attempts = [
            { query: "id, total, amount_paid, payment_status, created_at, type", calcPayStatus: false },
            { query: "id, total, amount_paid, payment_status, created_at, invoice_type", calcPayStatus: false },
            { query: "id, total, amount_paid, status, created_at, type", calcPayStatus: false },
            { query: "id, total, amount_paid, status, created_at, invoice_type", calcPayStatus: false },
            { query: "id, total, amount_paid, created_at, type", calcPayStatus: true },
            { query: "id, total, amount_paid, created_at, invoice_type", calcPayStatus: true }
          ];

          for (const attempt of attempts) {
            try {
              const res = await supabase.from("invoices").select(attempt.query);
              if (!res.error && res.data) {
                const decoded = res.data as unknown as InvoicesRow[];
                const mapped = decoded.map(i => {
                  const total = Number(i.total || 0);
                  const paid = Number(i.amount_paid || 0);
                  let payStatus = i.payment_status || i.status;
                  
                  if (!payStatus || attempt.calcPayStatus) {
                    if (paid >= total && total > 0) payStatus = "paid";
                    else if (paid > 0) payStatus = "partial";
                    else payStatus = "unpaid";
                  }

                  const mappedType = i.type || i.invoice_type || "gst";

                  return {
                    id: i.id,
                    total: i.total,
                    amount_paid: i.amount_paid,
                    created_at: i.created_at,
                    payment_status: payStatus,
                    type: mappedType
                  };
                });
                return { data: mapped, error: null };
              }
            } catch (e) {
              console.warn(`Query attempt '${attempt.query}' failed inside reports fetch`, e);
            }
          }

          // Fallback if everything else failed
          try {
            const res = await supabase.from("invoices").select("id, total, amount_paid, created_at");
            if (res.error) return { data: null, error: res.error as unknown as { message: string } };
            const decoded = (res.data ?? []) as unknown as InvoicesRow[];
            const mapped = decoded.map(i => {
              const total = Number(i.total || 0);
              const paid = Number(i.amount_paid || 0);
              let payStatus = "unpaid";
              if (paid >= total && total > 0) payStatus = "paid";
              else if (paid > 0) payStatus = "partial";
              return {
                id: i.id,
                total: i.total,
                amount_paid: i.amount_paid,
                created_at: i.created_at,
                payment_status: payStatus,
                type: "gst"
              };
            });
            return { data: mapped, error: null };
          } catch (err) {
            return { data: null, error: err as { message: string } };
          }
        })(),
        supabase.from("orders").select("total").eq("status", "delivered").gte("delivered_at", startOfToday.toISOString()),
        
        // Robust shops query
        (async () => {
          try {
            const res = await supabase.from("shops").select("shop_type, id");
            if (res.error) {
              if (res.error.code === "42703" || res.error.message?.includes("does not exist")) {
                throw res.error;
              }
              return { data: null, error: res.error };
            }
            return { data: res.data, error: null };
          } catch (err: unknown) {
            console.warn("Falling back shops query without shop_type");
            const res = await supabase.from("shops").select("id");
            if (res.error) return { data: null, error: res.error as unknown as { message: string } };
            return {
              data: (res.data ?? []).map(s => ({ id: s.id, shop_type: 'silver' })),
              error: null
            };
          }
        })(),

        supabase.from("v_product_stock").select("id, name, sku, units_per_packet, packets_per_case, pack_size_value, pack_size_unit, stock_base_units, avg_landed_cost").eq("is_active", true),
        (async () => {
          try {
            const res = await supabase.from("v_inventory_batch_details").select("id, product_id, product_name, product_sku, remaining_qty, product_units_per_packet, product_packets_per_case, product_pack_size_value, product_pack_size_unit, landed_cost");
            if (res.error) throw res.error;
            return { data: res.data, error: null };
          } catch (err: unknown) {
            console.warn("Falling back inventory batch details query using nested product select in reports");
            const res = await supabase.from("inventory_batches").select(`
              id,
              product_id,
              remaining_qty,
              landed_cost,
              product:products(
                id,
                name,
                sku,
                units_per_packet,
                packets_per_case,
                pack_size_value,
                pack_size_unit
              )
            `);
            if (res.error) return { data: null, error: res.error as unknown as { message: string } };
            const mapped = (res.data ?? []).map(item => {
              const p = item.product as unknown as {
                id: string;
                name: string;
                sku: string;
                units_per_packet?: number;
                packets_per_case?: number;
                pack_size_value?: number;
                pack_size_unit?: string;
              } | null;
              return {
                id: item.id,
                product_id: item.product_id,
                product_name: p?.name || 'Unknown',
                product_sku: p?.sku || 'N/A',
                remaining_qty: item.remaining_qty,
                product_units_per_packet: p?.units_per_packet,
                product_packets_per_case: p?.packets_per_case,
                product_pack_size_value: p?.pack_size_value,
                product_pack_size_unit: p?.pack_size_unit,
                landed_cost: item.landed_cost
              };
            });
            return { data: mapped, error: null };
          }
        })(),
        // BUG 16.2 - Only delivered orders in revenue
        supabase.from("realized_margin_view" as string).select("*").eq("order_status", "delivered").gte("order_date", curStart.toISOString().split('T')[0]).lte("order_date", curEnd.toISOString().split('T')[0]).then(res => res, e => ({ data: null, error: e })),
        
        // Robust orders inner shops(shop_type) query
        (async () => {
          try {
            const res = await supabase.from("orders").select("total, status, created_at, order_date, delivered_at, salesperson:profiles!salesperson_id(full_name), shop:shops(shop_type)").eq("is_void", false).gte("order_date", prevStart.toISOString().split('T')[0]);
            if (res.error) {
              if (res.error.code === "42703" || res.error.message?.includes("does not exist")) {
                throw res.error;
              }
              return { data: null, error: res.error };
            }
            return { data: res.data, error: null };
          } catch (err: unknown) {
            console.warn("Falling back orders query without shops(shop_type)");
            const res = await supabase.from("orders").select("total, status, created_at, order_date, delivered_at, salesperson:profiles!salesperson_id(full_name), shop:shops(id)").eq("is_void", false).gte("order_date", prevStart.toISOString().split('T')[0]);
            if (res.error) return { data: null, error: res.error as unknown as { message: string } };
            return {
              data: (res.data ?? []).map((o: { total: number; status: string; created_at: string; order_date: string | null; delivered_at: string | null; salesperson: unknown; shop: unknown }) => ({
                ...o,
                shop: o.shop ? (Array.isArray(o.shop) ? o.shop.map(() => ({ shop_type: 'silver' })) : { shop_type: 'silver' }) : null
              })),
              error: null
            };
          }
        })()
      ]);

      const realizedMargins = marginResponse?.data;
      const marginError = marginResponse?.error;

      if (curSumError || prevSumError || invError || todayOrdersError || shopDataError || productsError || inventoryError || (marginError && !marginError.message.includes('schema cache'))) {
        console.error("Reports Fetch Error:", { curSumError, prevSumError, invError, todayOrdersError, shopDataError, productsError, inventoryError, marginError, ordersError });
        
        // Detailed error reporting
        const firstError = curSumError || prevSumError || invError || todayOrdersError || shopDataError || productsError || inventoryError || (marginError && !marginError.message.includes('schema cache') ? marginError : null) || ordersError;
        throw new Error(`Failed to fetch reports data: ${firstError?.message || 'Unknown error'}`);
      }

      if (marginError) {
        console.warn("Margin View missing from schema cache - falling back to basic revenue", marginError);
      }

      // Create product map for cost fallback
      const productCostMap = new Map<string, number>();
      (productsData || []).forEach(p => {
        productCostMap.set(p.id, Number(p.avg_landed_cost || 0));
        // Also map by name if ID join is tricky
        productCostMap.set(p.name, Number(p.avg_landed_cost || 0));
      });

      // Process Inventory Report
      const inventoryReportMap = new Map<string, InventoryReportItem & { _conv: { upp: number; ppc: number; psv: number; psu: string } }>();
      
      // Initialize with all products and their current stock from v_product_stock
      (productsData || []).forEach(p => {
        const baseQty = Number(p.stock_base_units || 0);
        const avgCost = Number(p.avg_landed_cost || 0);
        
        inventoryReportMap.set(p.id, {
          id: p.id,
          sku: p.sku || 'N/A',
          name: p.name || 'Unknown',
          valuation: (Number(baseQty) || 0) * (Number(avgCost) || 0),
          base_qty: Number(baseQty) || 0,
          cases: 0,
          packets: 0,
          units: 0,
          weight: '0',
          status: baseQty <= 0 ? 'OOS' : baseQty < 10 ? 'LOW' : 'HEALTHY',
          _conv: {
            upp: p.units_per_packet || 1,
            ppc: p.packets_per_case || 1,
            psv: p.pack_size_value || 0,
            psu: p.pack_size_unit || ''
          }
        });
      });

      // Add detailed batch data if available
      (inventoryData || []).forEach(item => {
        const existing = inventoryReportMap.get(item.product_id);
        if (existing) {
          if (existing.valuation === 0 && item.remaining_qty > 0) {
             existing.valuation += Number(item.remaining_qty || 0) * Number(item.landed_cost || 0);
          }
        } else {
          const bQty = Number(item.remaining_qty || 0);
          inventoryReportMap.set(item.product_id, {
            id: item.product_id,
            sku: item.product_sku || 'N/A',
            name: item.product_name || 'Unknown',
            valuation: (Number(bQty) || 0) * (Number(item.landed_cost) || 0),
            base_qty: Number(bQty) || 0,
            cases: 0,
            packets: 0,
            units: 0,
            weight: '0',
            status: bQty <= 0 ? 'OOS' : bQty < 10 ? 'LOW' : 'HEALTHY',
            _conv: {
              upp: item.product_units_per_packet || 1,
              ppc: item.product_packets_per_case || 1,
              psv: item.product_pack_size_value || 0,
              psu: item.product_pack_size_unit || ''
            }
          });
        }
      });

      const inventoryReport = Array.from(inventoryReportMap.values()).map(item => {
        const status: 'OOS' | 'LOW' | 'HEALTHY' = item.base_qty <= 0 ? 'OOS' : item.base_qty < 10 ? 'LOW' : 'HEALTHY';
        
        const upp = item._conv.upp;
        const ppc = item._conv.ppc;
        const upc = upp * ppc;
        
        const cases = Math.floor(item.base_qty / upc);
        const remAfterCases = item.base_qty % upc;
        const packets = Math.floor(remAfterCases / upp);
        const units = Math.floor(remAfterCases % upp); // Use Math.floor to ensure number
        
        let weightStr = '—';
        const psu = (item._conv.psu || '').toLowerCase().trim();
        const isWeightUnit = ['g', 'gm', 'gms', 'grams', 'kg', 'kilogram', 'kilograms', 'ml', 'ltr', 'l', 'litre', 'litres'].includes(psu);

        if (item._conv.psv > 0 && isWeightUnit) {
          const totalWeightUnits = item.base_qty * item._conv.psv;
          if (psu === 'g' || psu === 'ml') {
            weightStr = (totalWeightUnits / 1000).toFixed(2) + (psu === 'g' ? ' kg' : ' L');
          } else {
            weightStr = totalWeightUnits.toFixed(2) + ' ' + (item._conv.psu || 'kg');
          }
        } else {
          weightStr = '—';
        }
 
        return { 
          ...item, 
          status,
          cases,
          packets,
          units,
          weight: weightStr
        };
      });

      // Process Salesperson & Shop Type Performance from Raw Orders
      const curOrders = (rawOrders || []).filter(o => {
        const dateStr = o.order_date || o.created_at;
        const date = new Date(dateStr);
        return date >= curStart && date <= curEnd;
      });
      const prevOrders = (rawOrders || []).filter(o => {
        const dateStr = o.order_date || o.created_at;
        const date = new Date(dateStr);
        return date >= prevStart && date <= prevEnd;
      });

      const spMap = new Map<string, { name: string; delivered: number; orders: number; prevDelivered: number }>();
      const shopTypeMap = new Map<string, { amount: number; count: number }>();

      curOrders.forEach(o => {
        // SP Perf
        const spName = (o.salesperson as { full_name: string | null })?.full_name || 'Unknown';
        const existingSp = spMap.get(spName) || { name: spName, delivered: 0, orders: 0, prevDelivered: 0 };
        if (o.status === 'delivered') existingSp.delivered += Number(o.total || 0);
        existingSp.orders += 1;
        spMap.set(spName, existingSp);

        // Shop Type
        const type = (o.shop as { shop_type: string | null })?.shop_type || 'basic';
        const existingType = shopTypeMap.get(type) || { amount: 0, count: 1 };
        if (o.status === 'delivered') existingType.amount += Number(o.total || 0);
        existingType.count += 1;
        shopTypeMap.set(type, existingType);
      });

      prevOrders.forEach(o => {
        const spName = (o.salesperson as { full_name: string | null })?.full_name || 'Unknown';
        const existingSp = spMap.get(spName);
        if (existingSp && o.status === 'delivered') {
          existingSp.prevDelivered += Number(o.total || 0);
          spMap.set(spName, existingSp);
        }
      });

      const spList = Array.from(spMap.values()).map(sp => ({
        ...sp,
        delta: sp.prevDelivered > 0 ? ((sp.delivered - sp.prevDelivered) / sp.prevDelivered) * 100 : 0
      })).sort((a, b) => b.delivered - a.delivered);

      const totalShopAmount = Array.from(shopTypeMap.values()).reduce((s, t) => s + t.amount, 0);
      const shopTypeSales = Array.from(shopTypeMap.entries()).map(([type, v]) => ({
        type,
        amount: v.amount,
        percent: totalShopAmount > 0 ? (v.amount / totalShopAmount) * 100 : 0,
        icon: 'store'
      })).sort((a,b) => b.amount - a.amount);

      // 2. Process Profit Data from Realized Margins
      let curRevenue = 0;
      let curProfit = 0;
      const curDiscounts = 0;
      const curOrdersCount = curOrders.length;
      
      const prodMap = new Map<string, { name: string; sales: number; profit: number; base_qty: number; cost: number }>();
      
      (realizedMargins || []).forEach(rm => {
        const lineRevenue = Number(rm.revenue_exclusive || 0);
        let lineProfit = Number(rm.realized_profit_total || 0);
        let lineCost = Number(rm.cost_exclusive || 0);

        // CALC-GAP-6: Fallback for empty batch deductions (Bug 16.1)
        if (lineCost === 0 && lineRevenue > 0) {
          const fallbackCost = productCostMap.get(rm.product_id) || productCostMap.get(rm.product_name) || 0;
          lineCost = Number(rm.quantity || 0) * fallbackCost;
          lineProfit = lineRevenue - lineCost;
        }

        curRevenue += lineRevenue;
        curProfit += lineProfit;
        
        const existing = prodMap.get(rm.product_name) || { name: rm.product_name, sales: 0, profit: 0, base_qty: 0, cost: 0 };
        existing.sales += lineRevenue;
        existing.profit += lineProfit;
        existing.base_qty += Number(rm.quantity || 0);
        existing.cost += lineCost;
        prodMap.set(rm.product_name, existing);
      });

      const productStats = Array.from(prodMap.values()).map(p => ({
        name: p.name,
        sales: p.sales,
        profit: p.profit,
        realizedMargin: p.sales > 0 ? (p.profit / p.sales) * 100 : 0,
        landedCost: p.base_qty > 0 ? p.cost / p.base_qty : 0
      })).sort((a, b) => b.profit - a.profit);

      const topTenProducts = productStats.slice(0, 10).map(p => ({ ...p, delta: 0 }));

      // Daily stats from RealizedMargins for accuracy (v_delivered only)
      const dailyMap = new Map<string, { amount: number; profit: number }>();
      
      (realizedMargins || []).forEach(rm => {
        const date = rm.order_date;
        const existing = dailyMap.get(date) || { amount: 0, profit: 0 };
        existing.amount += Number(rm.revenue_exclusive || 0);
        existing.profit += Number(rm.realized_profit_total || 0);
        dailyMap.set(date, existing);
      });

      // Aggregate PREVIOUS period from summary (assuming summary table is updated via delivered flag or we count it as baseline)
      let prevRevenue = 0;
      let prevProfit = 0;
      let prevDiscounts = 0;
      let prevOrdersCount = 0;

      (prevSummary || []).forEach(row => {
        prevRevenue += Number(row.revenue || 0);
        prevProfit += Number(row.profit || 0);
        prevOrdersCount += Number(row.order_count || 0);
        prevDiscounts += Number(row.discounts_given || 0);
      });

      const statusCounts: Record<string, number> = { delivered: 0, dispatched: 0, pending: 0, other: 0 };
      curOrders.forEach(o => {
        const s = (o.status || 'pending').toLowerCase();
        if (statusCounts[s] !== undefined) statusCounts[s]++;
        else statusCounts.other++;
      });

      // 3. Final Calculations
      const todaySales = (todayOrders ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
      const growthRate = prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue) * 100 : 0;
      const targetHitRate = (curRevenue / revenueTarget) * 100;

      let curTaxInv = 0;
      let prevTaxInv = 0;
      let curCashMemo = 0;
      let prevCashMemo = 0;

      if (allInvoices) {
        allInvoices.forEach(inv => {
          const createdAt = new Date(inv.created_at);
          const val = Number(inv.total || 0);
          if (createdAt >= curStart && createdAt <= today) {
            if (inv.type === 'tax') curTaxInv += val;
            else curCashMemo += val;
          } else if (createdAt >= prevStart && createdAt <= prevEnd) {
            if (inv.type === 'tax') prevTaxInv += val;
            else prevCashMemo += val;
          }
        });
      }

      const taxDelta = prevTaxInv > 0 ? ((curTaxInv - prevTaxInv) / prevTaxInv) * 100 : 0;
      const cashDelta = prevCashMemo > 0 ? ((curCashMemo - prevCashMemo) / prevCashMemo) * 100 : 0;

      // Outstanding
      let overdue = 0;
      let pendingTotal = 0;
      const now = new Date();
      (allInvoices ?? []).forEach(inv => {
        if (inv.payment_status === 'paid') return;
        const outstanding = Number(inv.total) - Number(inv.amount_paid);
        pendingTotal += outstanding;
        const dueDate = new Date(inv.created_at);
        dueDate.setDate(dueDate.getDate() + 7); 
        if (dueDate < now) overdue += outstanding;
      });

      const topInsights: SmartInsight[] = [
        { type: growthRate > 0 ? 'positive' : 'urgent', title: `${growthRate > 0 ? 'Upward' : 'Downward'} Trend`, description: `Revenue is ${Math.abs(growthRate).toFixed(1)}% ${growthRate > 0 ? 'higher' : 'lower'} than previous period.`, label: growthRate > 0 ? 'Positive' : 'Urgent' },
        { type: targetHitRate >= 80 ? 'positive' : 'action_needed', title: 'Target Velocity', description: `You have achieved ${targetHitRate.toFixed(1)}% of your currency goal.`, label: targetHitRate >= 80 ? 'Positive' : 'Action needed' }
      ];

      if (overdue > 0) topInsights.push({ type: 'urgent', title: 'Liquidity Risk', description: `₹${(overdue/1000).toFixed(1)}k in overdue credit requires immediate collection.`, label: 'Urgent' });

      // Build Comparison Table
      const comparisonTable: ComparisonRow[] = [
        { 
          label: "Revenue", 
          current: fmtINR(curRevenue), 
          prev: fmtINR(prevRevenue), 
          delta: `${Math.abs(growthRate).toFixed(1)}%`,
          deltaType: growthRate >= 0 ? 'up' : 'down' 
        },
        { 
          label: "Orders", 
          current: curOrdersCount.toString(), 
          prev: prevOrdersCount.toString(), 
          delta: `${Math.abs(prevOrdersCount > 0 ? ((curOrdersCount - prevOrdersCount) / prevOrdersCount) * 100 : 0).toFixed(1)}%`,
          deltaType: curOrdersCount >= prevOrdersCount ? 'up' : 'down' 
        },
        { 
          label: "Avg Order", 
          current: fmtINR(curOrdersCount > 0 ? curRevenue / curOrdersCount : 0), 
          prev: fmtINR(prevOrdersCount > 0 ? prevRevenue / prevOrdersCount : 0), 
          delta: "—",
          deltaType: 'up' 
        },
        { 
          label: "Gross Profit", 
          current: fmtINR(curProfit), 
          prev: fmtINR(prevProfit), 
          delta: `${Math.abs(prevProfit > 0 ? ((curProfit - prevProfit) / prevProfit) * 100 : 0).toFixed(1)}%`,
          deltaType: curProfit >= prevProfit ? 'up' : 'down' 
        }
      ];

      const peakDay = Object.entries(statusCounts).sort((a,b) => b[1] - a[1])[0] || ["None", 0];
      const healthyCount = inventoryReport.filter(i => i.status === 'HEALTHY').length;
      const totalCount = inventoryReport.length;
      const inventoryHealth = totalCount > 0 ? (healthyCount / totalCount) * 100 : 0;

      const reportData: ReportData = {
        todaySales,
        monthlyRevenue: { value: curRevenue, prevValue: prevRevenue, delta: growthRate },
        monthlyProfit: { value: curProfit, prevValue: prevProfit, delta: prevProfit > 0 ? ((curProfit - prevProfit) / prevProfit) * 100 : 0 },
        grossProfit: { value: curProfit, prevValue: prevProfit, delta: 0 },
        cogs: { value: curRevenue - curProfit, prevValue: 0, delta: 0 },
        discounts: { value: curDiscounts, prevValue: prevDiscounts, delta: prevDiscounts > 0 ? ((curDiscounts - prevDiscounts) / prevDiscounts) * 100 : 0 },
        orders: { value: curOrdersCount, prevValue: prevOrdersCount, delta: prevOrdersCount > 0 ? ((curOrdersCount - prevOrdersCount) / prevOrdersCount) * 100 : 0 },
        profitMargin: { value: curRevenue > 0 ? (curProfit / curRevenue) * 100 : 0, prevValue: 0, delta: 0 },
        avgOrderValue: { value: curOrdersCount > 0 ? curRevenue / curOrdersCount : 0, prevValue: 0, delta: 0 },
        collections: { value: 0, prevValue: 0, delta: 0 },
        growthRate,
        targetHitRate,
        outstanding: { overdue, pending: pendingTotal },
        smartInsights: topInsights,
        performanceMetrics: [],
        spList,
        taxInv: { val: curTaxInv, delta: taxDelta },
        cashMemo: { val: curCashMemo, delta: cashDelta },
        dailySales: Array.from(dailyMap.entries()).map(([date, v]) => ({ date, amount: v.amount, profit: v.profit })),
        dailyProfitTrend: Array.from(dailyMap.entries()).map(([date, v]) => ({ date, profit: v.profit, revenue: v.amount })),
        productStats,
        shopTypeSales,
        orderStatus: Object.entries(statusCounts).map(([status, count]) => ({ status: status.charAt(0).toUpperCase() + status.slice(1), count, color: status === 'delivered' ? '#10b981' : '#3b82f6' })),
        peakInsight: { day: String(peakDay[0]), percent: curOrdersCount > 0 ? (Number(peakDay[1]) / curOrdersCount) * 100 : 0, insight: "" },
        reorderValue: 0,
        stockTurnover: 0,
        inventoryHealth,
        margins: Array.from(dailyMap.entries()).map(([date, v]) => ({ date, margin: v.amount > 0 ? (v.profit / v.amount) * 100 : 0 })),
        categoryPerformance: productStats.slice(0, 10).map(p => ({
          product_name: p.name,
          avg_landed_cost: p.landedCost || 0,
          realized_margin_percent: p.realizedMargin,
          realized_profit: p.profit
        })),
        topTenProducts,
        orderStatusBreakdown: Object.entries(statusCounts).map(([status, count]) => ({ status: status.charAt(0).toUpperCase() + status.slice(1), count, percentage: curOrdersCount > 0 ? (count / curOrdersCount) * 100 : 0 })),
        inventoryReport,
        comparisonTable
      };

      setData(reportData);
    } catch (error: unknown) {
      console.error('[Context] Reports data load failure', error);
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, data, loadData };
}
