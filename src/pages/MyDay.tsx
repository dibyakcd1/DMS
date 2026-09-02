import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Plus, ClipboardList, Clock, CheckCircle2, Truck, Store, IndianRupee as IndianRupeeIcon, AlertCircle, Wallet, ChevronRight, TrendingUp } from "lucide-react";
import { fmtINR, statusColor, statusLabel } from "@/lib/format";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { ListCard } from "@/components/ListCard";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";
import { useMyDayData } from "@/hooks/useMyDayData";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Loader2, MapPin } from "lucide-react";

export default function MyDay() {
  const currentUser = useCurrentUser();
  const navigate = useNavigate();
  const { data, isLoading } = useMyDayData(currentUser?.id);

  const greeting = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const userName = currentUser?.full_name?.split(" ")[0] ?? "there";

  const [visitOpen, setVisitOpen] = React.useState(false);
  const [visitingShopId, setVisitingShopId] = React.useState<string | null>(null);
  const [visitNotes, setVisitNotes] = React.useState("");
  const [isLoggingVisit, setIsLoggingVisit] = React.useState(false);

  const handleRecordVisit = async () => {
    if (!visitingShopId) {
      toast.error("Please select a shop");
      return;
    }
    setIsLoggingVisit(true);
    try {
      // Check if shop_visits table exists by trial
      const { error } = await supabase.from('shop_visits').insert({
        shop_id: visitingShopId,
        visitor_id: currentUser?.id,
        notes: visitNotes,
        visit_date: new Date().toISOString()
      });
      
      if (error) {
        if (error.code === '42P01') { // undefined_table
           toast.error("Visit logging table not initialized in database. Contact admin.");
           return;
        }
        throw error;
      }
      
      toast.success("Visit recorded successfully");
      setVisitOpen(false);
      setVisitNotes("");
      setVisitingShopId(null);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setIsLoggingVisit(false);
    }
  };

  return (
    <ResponsiveContainer className="space-y-5 pb-32">
      <section className="flex flex-col gap-1 px-1">
        <h2 className="text-2xl font-black tracking-tight text-slate-900 leading-none">{greeting}, {userName}</h2>
        <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest hidden sm:block">Today's Progress</p>
      </section>

      {/* Primary KPI Card */}
      <Card 
        className="relative overflow-hidden border-0 bg-primary text-white shadow-2xl rounded-[2rem] animate-in fade-in slide-in-from-top-4 duration-500 group cursor-pointer active:scale-[0.99] transition-all"
        onClick={() => navigate("/reports")}
      >
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform">
          <TrendingUp className="h-32 w-32 rotate-12" />
        </div>
        <CardContent className="relative p-8 z-10 space-y-6 min-h-0">
          <div className="flex flex-col gap-1">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Total revenue generated</div>
            <div className="text-4xl font-black tracking-tight tabular-nums pb-2 text-white">
              {data ? fmtINR(data.todaySales) : "₹0.00"}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/10 rounded-2xl p-4 border border-white/20 backdrop-blur-md">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 mb-2">Delivered Today</div>
              <div className="text-lg font-black text-white">{data?.todayDelivered ?? 0} <span className="text-[10px] opacity-60 uppercase">Units</span></div>
            </div>
            <div className="bg-white/10 rounded-2xl p-4 border border-white/20 backdrop-blur-md">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 mb-2">Balance due</div>
              <div className="text-lg font-black text-white">{data ? fmtINR(data.outstanding) : "₹0"}</div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button 
              className="h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest bg-white text-slate-900 hover:bg-white/90 shadow-xl shadow-white/10 border-0 flex-1 mr-4"
              onClick={(e) => { e.stopPropagation(); navigate("/orders/new"); }}
            >
              <Plus className="mr-2 h-4 w-4" /> 
              Book New order
            </Button>
            <div className="h-12 w-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
               <ChevronRight className="h-5 w-5 text-white/40 group-hover:text-white transition-colors" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secondary Pulse */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <StatCard 
          label="Pending" 
          value={data ? String(data.pendingApproval) : "0"} 
          icon={Clock} 
          color="warning" 
          onClick={() => navigate("/orders?status=pending_approval")} 
        />
        <StatCard 
          label="Approved" 
          value={data ? String(data.approved) : "0"} 
          icon={CheckCircle2} 
          color="success" 
          onClick={() => navigate("/orders?status=approved")} 
        />
        <StatCard 
          label="In Transit" 
          value={data ? String(data.inTransit) : "0"} 
          icon={Truck} 
          color="info" 
          onClick={() => navigate("/orders?status=dispatched")} 
        />
        <StatCard 
          label="Due Balance" 
          value={data ? fmtINR(data.outstanding) : "₹0"} 
          icon={Wallet} 
          color="danger" 
          onClick={() => navigate("/collections")} 
        />
      </div>

      <section className="space-y-4">
        <SectionHeader 
          title="Today's orders" 
          actionLabel="View all" 
          onAction={() => navigate("/orders")} 
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading && Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl shimmer" />)}
          {!isLoading && data?.todayOrders.length === 0 && (
            <Card className="border-border/40 rounded-2xl md:col-span-2 lg:col-span-3">
              <CardContent className="p-8 text-center bg-muted/5">
                <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <div className="text-sm font-medium text-muted-foreground/60">No orders booked today.</div>
                <Button size="sm" variant="outline" className="mt-4 h-10 rounded-xl font-bold px-6" onClick={() => navigate("/orders/new")}>
                  Book first order
                </Button>
              </CardContent>
            </Card>
          )}
          {data?.todayOrders.map((o) => (
            <ListCard
              key={o.id}
              title={o.shop?.name ?? "—"}
              subtitle={o.order_number}
              badge={<Badge variant="outline" className={cn("text-[9px] font-bold px-1.5 h-4 border-none", statusColor[o.status])}>{statusLabel[o.status]}</Badge>}
              meta={<div className="text-sm font-bold text-primary">{fmtINR(o.total)}</div>}
              onClick={() => navigate(`/orders/${o.id}`)}
              icon={<Store className="h-5 w-5" />}
            />
          ))}
        </div>
      </section>

      {/* Approval updates */}
      {data && data.recentApprovals.length > 0 && (
        <section className="space-y-4">
          <SectionHeader title="Recent updates" subtitle="Updates" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.recentApprovals.map((o) => (
              <ListCard
                key={o.id}
                title={o.shop?.name ?? "—"}
                subtitle={`${o.order_number} · ${statusLabel[o.status]}`}
                meta={<div className="text-sm font-bold text-primary">{fmtINR(o.total)}</div>}
                onClick={() => navigate(`/orders/${o.id}`)}
                icon={o.status === "approved" ? <CheckCircle2 className="h-5 w-5 text-status-delivered" /> : <AlertCircle className="h-5 w-5 text-status-cancelled" />}
              />
            ))}
          </div>
        </section>
      )}

      {/* My shops quick access */}
      <section className="space-y-4">
        <SectionHeader 
          title="Quick shops" 
          subtitle="Recent clients"
          actionLabel="Record Visit" 
          onAction={() => setVisitOpen(true)} 
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading && <Skeleton className="h-20 rounded-xl shimmer" />}
          {!isLoading && data?.myShops.length === 0 && (
            <Card className="border-border/40 rounded-2xl md:col-span-2 lg:col-span-3">
              <CardContent className="p-8 text-center text-sm font-medium text-muted-foreground/40 bg-muted/5">No shops yet.</CardContent>
            </Card>
          )}
          {data?.myShops.map((s) => (
            <ListCard
              key={s.id}
              title={s.name}
              subtitle={s.phone || "No contact"}
              onClick={() => navigate(`/orders/new?shop=${s.id}`)}
              icon={<Store className="h-5 w-5" />}
            />
          ))}
        </div>
      </section>

      {/* Footer quick actions */}
      <div className="grid grid-cols-2 gap-4 min-h-0 pt-2">
        <Button variant="outline" className="h-12 rounded-xl font-bold border-border bg-card shadow-sm text-foreground hover:bg-muted" onClick={() => navigate("/collections")}>
          <Wallet className="mr-2 h-5 w-5 text-primary/70" /> Collect payment
        </Button>
        <Button variant="outline" className="h-12 rounded-xl font-bold border-border bg-card shadow-sm text-foreground hover:bg-muted" onClick={() => navigate("/orders")}>
          <ClipboardList className="mr-2 h-5 w-5 text-primary/70" /> My orders
        </Button>
      </div>
      {/* Visit Logging Sheet */}
      <Sheet open={visitOpen} onOpenChange={setVisitOpen}>
        <SheetContent side="bottom" className="rounded-t-[2rem] p-6 h-[70vh]">
          <SheetHeader>
            <SheetTitle className="text-2xl font-black text-slate-900">Record Shop Visit</SheetTitle>
            <SheetDescription className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Log client interaction for audit
            </SheetDescription>
          </SheetHeader>
          <div className="py-8 space-y-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Select Client</Label>
              <select 
                className="h-14 w-full rounded-2xl border-2 bg-slate-50 px-4 font-bold outline-none focus:ring-2 focus:ring-primary/20"
                value={visitingShopId || ""}
                onChange={(e) => setVisitingShopId(e.target.value)}
              >
                <option value="">Select a shop...</option>
                {data?.myShops.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Interaction Notes</Label>
              <Textarea 
                placeholder="Stock levels, recovery follow-up, client feedback..."
                className="rounded-2xl border-2 bg-slate-50 min-h-[120px] font-bold p-4 focus-visible:ring-primary/20"
                value={visitNotes}
                onChange={(e) => setVisitNotes(e.target.value)}
              />
            </div>
          </div>
          <SheetFooter className="flex flex-row gap-3 pt-4 border-t border-slate-100">
            <Button 
              variant="outline" 
              className="flex-1 h-16 rounded-2xl font-black uppercase tracking-widest text-[11px] border-slate-200"
              onClick={() => setVisitOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              className="flex-[2] h-16 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-[11px] shadow-2xl active:scale-95 transition-all"
              onClick={handleRecordVisit}
              disabled={isLoggingVisit || !visitingShopId}
            >
              {isLoggingVisit ? <Loader2 className="h-6 w-6 animate-spin" /> : <><MapPin className="mr-2 h-4 w-4" /> Save Visit</>}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ResponsiveContainer>
  );
}

// Removing KpiMini as it's replaced by StatCard
