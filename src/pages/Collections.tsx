import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { 
  Search, 
  IndianRupee as IndianRupeeIcon, 
  Store, 
  History, 
  ChevronRight,
  TrendingDown,
  Wallet,
  X,
  FileText,
  CheckCircle2
} from "lucide-react";
import { fmtINR } from "@/lib/format";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RecordPaymentDialog from "@/components/RecordPaymentDialog";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/context/AuthContextCore";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useCollections } from "@/hooks/useCollections";
import { friendlyError } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, AdaptiveTable } from "@/components/ui/responsive-ui";

export default function Collections() {
  const [search, setSearch] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState<{ id: string; name: string } | null>(null);
  const navigate = useNavigate();

  const { isAdmin } = useAuth();
  const currentUser = useCurrentUser();

  const { data, isLoading: loading, refetch: loadData } = useCollections(currentUser?.id, isAdmin);

  const recentPayments = data?.recentPayments ?? [];
  const totalOutstanding = data?.totalOutstanding ?? 0;
  const outstandings = useMemo(() => data?.outstandings ?? [], [data?.outstandings]);

  const filteredShops = useMemo(() => 
    outstandings.filter(s => 
      s.shop_name.toLowerCase().includes(search.toLowerCase())
    ),
    [outstandings, search]
  );

  return (
    <ResponsiveContainer className="space-y-5 pb-32">
      <PageHeader
        title="Collections"
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/")}
      />

      {/* Summary Area */}
      <Card className="relative overflow-hidden border-0 bg-slate-900 text-white shadow-xl rounded-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Wallet className="h-32 w-32 rotate-12" />
        </div>
        <CardContent className="p-8 relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] opacity-50">
                <IndianRupeeIcon className="h-3 w-3" />
                Total outstanding
              </div>
              <div className="text-5xl font-black tracking-tight tabular-nums mt-2">
                {fmtINR(totalOutstanding)}
              </div>
              <div className="flex items-center gap-2 text-xs font-bold mt-4">
                <span className="flex items-center gap-1.5 bg-white/10 px-4 py-1.5 rounded-2xl border border-white/10 backdrop-blur-sm">
                  <TrendingDown className="h-4 w-4 text-emerald-400" />
                  {outstandings.length} shops with dues
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="shops" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-muted/30 rounded-2xl border border-border/40 mb-6">
          <TabsTrigger value="shops" className="rounded-xl font-bold text-xs transition-all">
            Outstanding
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl font-bold text-xs transition-all">
            Payment history
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shops" className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="relative group px-1">
            <Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-brand-primary transition-colors" />
            <Input 
              placeholder="Search shops..." 
              className="pl-12 pr-10 h-11 border border-border/60 bg-muted/20 font-medium focus:bg-background transition-all rounded-xl focus:border-brand-primary shadow-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button 
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-slate-300 hover:text-slate-600 transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {!loading && outstandings.length === 0 ? (
            <Card className="border-2 border-dashed border-emerald-100 rounded-[2rem] bg-emerald-50/30 py-24 shadow-none">
              <CardContent className="flex flex-col items-center justify-center text-center space-y-6">
                <div className="h-20 w-20 rounded-full bg-white shadow-xl flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-slate-900">All caught up!</h3>
                  <p className="text-sm font-medium text-slate-500 max-w-xs mx-auto">
                    No outstanding payments at the moment. Your distribution network is clear.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <AdaptiveTable
              data={filteredShops}
              isLoading={loading}
              emptyMessage="No shops found matching your search."
              onRowClick={(shop) => {
                setSelectedShop({ id: shop.shop_id, name: shop.shop_name });
                setPayOpen(true);
              }}
              columns={[
                {
                  header: "Shop",
                  id: "shop",
                  render: (s) => (
                    <div className="flex items-center gap-4">
                      <div className="h-9 w-9 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                        <Store className="h-4 w-4" />
                      </div>
                      <span className="font-bold text-foreground">{s.shop_name}</span>
                    </div>
                  ),
                },
                {
                  header: "Pending",
                  render: (s) => (
                    <div className="flex items-center gap-1.5 text-[10px] font-black text-primary bg-primary/5 px-3 py-1.5 rounded-xl uppercase tracking-wider w-fit">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{s.invoice_count}</span>
                    </div>
                  ),
                  hideOnMobile: true,
                },
                {
                  header: "Balance",
                  className: "text-right font-black tabular-nums text-foreground text-lg",
                  render: (s) => fmtINR(s.total_outstanding),
                },
                {
                  header: "",
                  id: "actions",
                  className: "w-[120px] text-right",
                  render: (s) => (
                    <Button 
                      size="sm" 
                      className="h-9 rounded-xl text-[10px] font-black tracking-widest bg-slate-900 border-none shadow-brand shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedShop({ id: s.shop_id, name: s.shop_name });
                        setPayOpen(true);
                      }}
                    >
                      Collect
                    </Button>
                  )
                }
              ]}
              renderMobileCard={(shop) => (
                <Card 
                  key={shop.shop_id} 
                  className="group relative overflow-hidden border border-border/60 rounded-2xl bg-card shadow-sm active:scale-[0.98] transition-all"
                  onClick={() => {
                    setSelectedShop({ id: shop.shop_id, name: shop.shop_name });
                    setPayOpen(true);
                  }}
                >
                  <CardContent className="p-4 flex items-center justify-between gap-3 text-left overflow-hidden">
                    <div className="flex flex-col min-w-0 flex-1">
                      <h3 className="font-black text-xs text-slate-900 tracking-tight group-hover:text-primary transition-colors leading-tight">
                        {shop.shop_name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="flex items-center gap-1 text-[9px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded-lg uppercase tracking-wider">
                          <FileText className="h-3 w-3" />
                          <span>{shop.invoice_count}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-black text-base text-slate-900 tabular-nums tracking-tight group-hover:text-primary transition-colors leading-none">{fmtINR(shop.total_outstanding)}</div>
                      </div>
                      <Button 
                        size="sm" 
                        className="h-8 w-8 rounded-full bg-slate-900 hover:bg-primary p-0 flex items-center justify-center shadow-lg"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedShop({ id: shop.shop_id, name: shop.shop_name });
                          setPayOpen(true);
                        }}
                      >
                        <ChevronRight className="h-4 w-4 text-white" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            />
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <AdaptiveTable
            data={recentPayments}
            isLoading={loading}
            emptyMessage="Clean Audit Trail: No payment transactions recorded."
            columns={[
              {
                header: "Settlement Node",
                id: "shop",
                render: (p) => (
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
                      <Store className="h-4 w-4" />
                    </div>
                    <span className="font-bold text-foreground">
                      {p.invoice?.shop?.name || (p.invoice?.order as { shop: { name: string } }| null)?.shop?.name || "System Settlement"}
                    </span>
                  </div>
                ),
              },
            {
              header: "Reference",
              render: (p) => (
                <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl uppercase tracking-wider w-fit">
                   <FileText className="h-3.5 w-3.5 opacity-50" />
                   <span>INV-{p.invoice?.invoice_number?.slice(-4) || "—"}</span>
                </div>
              ),
              hideOnMobile: true,
            },
              {
                header: "Date",
                render: (p) => (
                  <span className="text-sm font-medium text-slate-500 font-mono">
                    {new Date(p.paid_at).toLocaleDateString()}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                header: "Method",
                render: (p) => (
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {p.method}
                  </span>
                ),
                hideOnMobile: true,
              },
              {
                header: "Amount Collected",
                className: "text-right font-black tabular-nums text-lg",
                render: (p) => (
                  <div className="flex flex-col items-end">
                    <div className={cn(
                      p.method === 'other' ? "text-amber-600" : "text-emerald-600"
                    )}>
                      {p.method === 'other' ? "-" : "+"}{fmtINR(p.amount)}
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      {p.method === 'other' ? "Discount" : p.method}
                    </div>
                  </div>
                ),
              }
            ]}
            renderMobileCard={(payment) => (
              <Card 
                key={payment.id} 
                className="group relative overflow-hidden border border-border/60 rounded-2xl bg-card shadow-sm transition-all"
              >
                <CardContent className="p-4 flex items-center justify-between gap-3 text-left overflow-hidden">
                  <div className="flex flex-col min-w-0 flex-1">
                    <h3 className="font-black text-xs text-slate-900 tracking-tight leading-tight transition-colors group-hover:text-primary">
                      {payment.invoice?.shop?.name || (payment.invoice?.order as { shop: { name: string } }| null)?.shop?.name || "System Settlement"}
                    </h3>
                    <div className="flex flex-col gap-1.5 mt-2">
                      <div className="flex items-center gap-1 text-[9px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded-lg uppercase tracking-wider w-fit">
                         <FileText className="h-3 w-3" />
                         <span>INV-{payment.invoice?.invoice_number?.slice(-4) || "—"}</span>
                      </div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-0.5">{new Date(payment.paid_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <div className={cn(
                      "font-black text-base tabular-nums tracking-tight group-hover:text-primary transition-colors leading-none",
                      payment.method === 'other' ? "text-amber-600" : "text-emerald-600"
                    )}>
                      {payment.method === 'other' ? "-" : "+"}{fmtINR(payment.amount)}
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">
                      {payment.method === 'other' ? "Discount" : payment.method}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          />
        </TabsContent>
      </Tabs>

      <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end pointer-events-none">
        {outstandings.length > 1 && (
          <div className="bg-slate-900/90 backdrop-blur-md text-white/70 text-[8px] font-black uppercase tracking-widest py-1 px-3 rounded-t-xl border-x border-t border-white/10 w-fit mb-[-1px] animate-in slide-in-from-right-4">
            {outstandings.length} pending
          </div>
        )}
        <Button 
          className="w-auto h-12 bg-slate-900 text-white rounded-2xl shadow-2xl hover:bg-slate-800 flex items-center gap-4 group animate-in fade-in slide-in-from-right-8 duration-700 active:scale-[0.98] transition-all border border-white/10 px-4 pointer-events-auto"
          onClick={() => {
            const target = filteredShops[0] || outstandings[0];
            if (target) {
              setSelectedShop({ id: target.shop_id, name: target.shop_name });
              setPayOpen(true);
            } else {
              toast.error("Collections cleared", { description: "All distribution nodes are at zero balance." });
            }
          }}
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-brand-primary/20 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="text-left hidden sm:block">
              <div className="font-black text-[11px] tracking-tight leading-none">Instant settlement</div>
              <div className="text-[8px] font-bold text-white/40 mt-1 uppercase tracking-widest truncate max-w-[120px]">
                {outstandings[0] ? outstandings[0].shop_name : "Process next"}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-[11px] font-black text-brand-primary tabular-nums">
                {outstandings[0] ? fmtINR(outstandings[0].total_outstanding) : "₹0"}
              </div>
            </div>
            <div className="h-6 w-6 rounded-lg bg-white/5 flex items-center justify-center text-white/40">
              <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </Button>
      </div>

      {selectedShop && (
        <RecordPaymentDialog 
          open={payOpen} 
          onOpenChange={setPayOpen} 
          shopId={selectedShop.id}
          shopName={selectedShop.name}
          onSaved={loadData} 
        />
      )}
    </ResponsiveContainer>
  );
}
