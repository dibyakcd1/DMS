import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Store,
  Wallet,
  Trash2,
  X,
  Package,
  Users,
  Layers,
  CircleDollarSign,
} from "lucide-react";
import { fmtINR, statusColor, statusLabel } from "@/lib/format";
import { SectionHeader } from "@/components/SectionHeader";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { ListCard } from "@/components/ListCard";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useIsMobile, useIsTablet } from "@/lib/responsive";
import { useCurrentUser } from "@/hooks/useCurrentUser";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useHomeQueue } from "@/hooks/useHomeQueue";

import {
  ResponsiveContainer,
  AdaptiveTable,
} from "@/components/ui/responsive-ui";

export default function Home() {
  const { stats, isLoading, acting, decide } = useHomeQueue();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const currentUser = useCurrentUser();

  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }, []);

  return (
    <div className="pb-32 md:pb-8">
      {/* Page Header (Unified) */}
      <PageHeader 
        title="Dashboard" 
        titleColor="var(--color-brand-primary)"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-2">
        {/* Main Panel (Left) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Hero Card */}
          <Card className="relative overflow-hidden border-0 bg-brand-gradient text-white shadow-brand/40 rounded-3xl group">
            {/* Visual element */}
            <div className="absolute top-0 right-0 h-48 w-48 bg-white/20 rounded-full blur-3xl -mr-24 -mt-24 group-hover:bg-white/30 transition-all duration-700" />
            <div className="absolute bottom-0 left-0 h-32 w-32 bg-brand-secondary/20 rounded-full blur-2xl -ml-16 -mb-16" />
            
            <CardContent className="relative p-5 sm:p-7 md:p-8 z-10 space-y-5 sm:space-y-8 flex flex-col h-full justify-between">
              <div className="flex flex-col gap-1 sm:gap-1.5">
                <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white/80">Today's Collections</div>
                <div className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight tabular-nums drop-shadow-sm whitespace-nowrap overflow-hidden text-ellipsis">
                  {stats ? fmtINR(stats.todayCollections) : "Rs.\u00A00.00"}
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/20 shadow-inner min-w-0">
                  <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white/80 mb-1">Inventory Value</div>
                  <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis drop-shadow-sm leading-snug">
                    {stats ? fmtINR(stats.totalInventoryValue) : "Rs.\u00A00.00"}
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/20 shadow-inner overflow-hidden min-w-0">
                  <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white/80 mb-1">Total Outstanding</div>
                  <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis drop-shadow-sm leading-snug">
                    {stats ? fmtINR(stats.outstanding) : "Rs.\u00A00.00"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* New Operational Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-2 gap-4">
            <StatCard 
              label="Stock alerts" 
              value={stats?.lowStock.length ?? 0} 
              icon={Package} 
              color="destructive" 
              onClick={() => navigate("/stock")}
            />
            <StatCard 
              label="Payments today" 
              value={`${stats?.todayCollections ? (stats.todayCollections / 1000).toFixed(1) : 0}k`} 
              icon={CircleDollarSign} 
              color="success" 
              onClick={() => navigate("/reports")}
            />
          </div>

          {/* Warehouse Distribution */}
          <section className="space-y-4">
            <SectionHeader 
              title="Inventory Distribution" 
              subtitle="Stock valuation by warehouse"
              actionLabel="View Stock"
              onAction={() => navigate("/stock")}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {stats?.warehouseSplit.map((w) => (
                <Card 
                  key={w.name} 
                  className="border border-slate-200/80 rounded-2xl bg-white shadow-sm hover:border-primary/30 hover:shadow-md transition-all cursor-pointer overflow-hidden" 
                  onClick={() => navigate("/stock")}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/15">
                          <Layers className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-bold text-slate-900 leading-snug break-words">{w.name}</div>
                          <div className="inline-flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200/60">
                              {w.code || "WH"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] sm:text-xs font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 shrink-0">
                        {w.item_count} items
                      </span>
                    </div>

                    <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stock Valuation</span>
                      <span className="text-xs sm:text-sm md:text-base font-extrabold text-primary tracking-tight whitespace-nowrap">
                        {fmtINR(w.total_value)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {(!stats || stats.warehouseSplit.length === 0) && !isLoading && (
                 <div className="col-span-full py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm">
                   No warehouse data available
                 </div>
              )}
            </div>
          </section>

          {/* Authorization Queue */}
          <section className="space-y-4">
            <SectionHeader 
              title="Orders waiting for approval" 
              subtitle={`${stats?.pending ?? 0} orders waiting`}
              actionLabel="View all"
              onAction={() => navigate("/orders?status=pending_approval")}
            />
            
            <AdaptiveTable
              data={stats?.pendingQueue || []}
              isLoading={isLoading}
              emptyMessage="No orders pending approval."
              onRowClick={(o) => navigate(`/orders/${o.id}`)}
              className="border-slate-100 shadow-sm rounded-2xl"
              columns={[
                {
                  header: "Ref #",
                  accessorKey: "order_number",
                  className: "font-mono font-black text-primary",
                },
                {
                  header: "Shop",
                  render: (o) => o.shop_name || o.shop?.name || "No Shop",
                  className: "font-bold text-slate-900",
                },
                {
                  header: "Amount",
                  accessorKey: "total",
                  className: "text-right font-black tabular-nums text-slate-900 px-6",
                  render: (o) => fmtINR(o.total),
                },
                {
                  header: "Action",
                  id: "action",
                  className: "w-[200px] text-right",
                  render: (o: { id: string }) => (
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button 
                        type="button"
                        className="h-9 px-4 rounded-xl text-emerald-600 border border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50 font-black text-[10px] tracking-wider transition-colors" 
                        onClick={() => decide(o.id, "approved")}
                        disabled={acting === o.id}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 inline-block" />
                        Approve
                      </button>
                      <button 
                        type="button"
                        className="h-9 px-4 rounded-xl text-rose-600 border border-rose-100 bg-rose-50/30 hover:bg-rose-50 font-black text-[10px] tracking-wider transition-colors" 
                        onClick={() => decide(o.id, "rejected")}
                        disabled={acting === o.id}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5 inline-block" />
                        Reject
                      </button>
                    </div>
                  ),
                }
              ]}
              renderMobileCard={(o: { id: string; order_number: string; salesperson_name?: string; shop?: { name: string }; total: number }) => (
                <ListCard 
                  title={o.shop?.name ?? "No Shop"}
                  subtitle={`Ref: #${o.order_number} · ${o.salesperson_name || "Agent"}`}
                  meta={
                    <div className="flex flex-col gap-4 mt-3">
                      <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Amount</span>
                          <span className="text-base font-black text-slate-900">{fmtINR(o.total)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <Button
                          size="sm"
                          className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-black text-[11px] tracking-wider shadow-lg shadow-emerald-600/10"
                          disabled={acting === o.id}
                          onClick={(e) => { e.stopPropagation(); decide(o.id, "approved"); }}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 rounded-xl font-black text-[11px] tracking-wider text-rose-600 border-rose-100 bg-rose-50/30"
                          disabled={acting === o.id}
                          onClick={(e) => { e.stopPropagation(); decide(o.id, "rejected"); }}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  }
                  onClick={() => navigate(`/orders/${o.id}`)}
                />
              )}
            />
          </section>
        </div>

        {/* Side Panel (Right) */}
        <div className="lg:col-span-4 space-y-8">
          <section className="space-y-4">
            <SectionHeader title="Payment Tracking" subtitle="Recent collections status" onAction={() => navigate("/collections")} actionLabel="View all" />
            <div className="space-y-3">
              {stats?.recent.filter(o => o.status === 'delivered').slice(0, 3).map((o) => {
                const payStatus = o.payment_status || "unpaid";
                let badgeClass = "bg-amber-50 text-amber-600";
                let badgeText = "Awaiting";
                
                if (payStatus === "paid") {
                  badgeClass = "bg-emerald-50 text-emerald-600";
                  badgeText = "Paid";
                } else if (payStatus === "partial") {
                  badgeClass = "bg-sky-50 text-sky-600";
                  badgeText = "Partial";
                }

                return (
                  <ListCard
                    key={o.id}
                    title={o.shop?.name ?? "—"}
                    subtitle={payStatus === "paid" ? `Collected for #${o.order_number}` : `Payment Due for #${o.order_number}`}
                    badge={<Badge variant="outline" className={cn("text-[10px] font-black px-2.5 py-0.5 rounded-md border-none uppercase tracking-widest", badgeClass)}>{badgeText}</Badge>}
                    meta={<div className="text-sm font-black text-slate-900 tracking-tight">{fmtINR(o.total)}</div>}
                    onClick={() => navigate(`/orders/${o.id}`)}
                  />
                );
              })}
              {stats?.todayCollections === 0 && !isLoading && (
                <div className="p-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm">
                  No payment activity today
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader title="Recent Activity" subtitle="Updates from the field" actionLabel="View all" onAction={() => navigate("/orders")} />
            <div className="space-y-3">
              {stats?.recent.slice(0, 5).map((o) => (
                <ListCard
                  key={o.id}
                  title={o.shop?.name ?? "—"}
                  subtitle={`#${o.order_number}`}
                  badge={<Badge variant="outline" className={cn("text-[10px] font-black px-2.5 py-0.5 rounded-md border-none shadow-none uppercase tracking-widest", statusColor[o.status as keyof typeof statusColor])}>{statusLabel[o.status as keyof typeof statusLabel]}</Badge>}
                  meta={<div className="text-sm font-black text-slate-900 tracking-tight">{fmtINR(o.total)}</div>}
                  onClick={() => navigate(`/orders/${o.id}`)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>

    </div>
  );
}
