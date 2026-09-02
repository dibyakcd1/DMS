import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Edit2, Plus, Search, AlertTriangle, Trash2, PackagePlus, FileUp, Zap, X, 
  Loader2, History as HistoryIcon, FileText, ArrowRightLeft, Settings2, 
  IndianRupee as IndianRupeeIcon, Warehouse, ClipboardList, TrendingUp, 
  Download, Receipt, Sparkles, LucideIcon, Layers, ChevronLeft, ChevronRight, MoreVertical,
  SlidersHorizontal, Archive, CheckCircle, XCircle
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { fmtDate, fmtINR } from "@/lib/format";
import { derivePackaging, formatStockBreakdown, getAvailableSellUnits, convertToBaseUnits, getDetailedStockBreakdown, toDbPackType } from "@/lib/packaging";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";
import { cn } from "@/lib/utils";
import { Product as GlobalProduct, Warehouse as WarehouseType } from "@/types";
import { autoCalcAllTiers, PricingProduct } from "@/lib/pricing";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { useFilters } from "@/hooks/useFilters";
import { PageHeader } from "@/components/PageHeader";
import { TeleportAction } from "@/components/TeleportAction";
import { StockTabs } from "@/components/stock/StockTabs";
import { useInventory } from "@/hooks/useInventory";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ResponsiveContainer, 
  AdaptiveTable,
} from "@/components/ui/responsive-ui";
import { ListCard } from "@/components/ListCard";
import { useIsMobile } from "@/lib/responsive";

type Batch = {
  id: string;
  product_id: string;
  batch_number: string;
  mfg_date: string | null;
  expiry_date: string;
  received_qty: number;
  remaining_qty: number;
  cost_price: number;
  landed_cost: number | null;
  freight_cost_per_unit?: number;
  handling_cost_per_unit?: number;
  notes: string | null;
  received_at: string;
  product?: GlobalProduct | null;
  warehouse_id: string | null;
  warehouse?: { id: string; name: string; code?: string | null } | null;
};

// Using GlobalProduct for all product interactions
const parseMMYY = (raw: string): { mm: number; yyyy: number } | null => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 4) return null;
  const mm = Number(digits.slice(0, 2));
  const yy = Number(digits.slice(2, 4));
  if (!Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { mm, yyyy: 2000 + yy };
};

const mmyyToIsoDate = (raw: string): string | null => {
  const p = parseMMYY(raw);
  if (!p) return null;
  return `${p.yyyy}-${String(p.mm).padStart(2, "0")}-01`;
};

const mmyyToIsoExpiryDate = (raw: string): string | null => {
  const p = parseMMYY(raw);
  if (!p) return null;
  const end = new Date(p.yyyy, p.mm, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
};

const addMonthsMMYY = (raw: string, months: number): string => {
  const p = parseMMYY(raw);
  if (!p) return "";
  const d = new Date(p.yyyy, p.mm - 1, 1);
  d.setMonth(d.getMonth() + months);
  return `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getFullYear()).slice(-2)}`;
};

const isoToMMYY = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getFullYear()).slice(-2)}`;
};

const getEmptyBatch = () => ({
  id: "",
  product_id: "",
  batch_number: "",
  mfg_date: "",
  expiry_date: "",
  received_qty: 0,
  remaining_qty: 0,
  cost_price: 0,
  landed_cost: 0,
  freight_cost_per_unit: 0,
  handling_cost_per_unit: 0,
  notes: "",
  input_qty_raw: 0,
  input_unit: "top" as "unit" | "top" | "packet" | "kg",
  input_cost_raw: 0,
  invoice_total: 0,
  additional_landed_costs: 0,
  warehouse_id: "",
  received_at: new Date().toISOString().slice(0, 10),
});

type SyncBatch = {
  id: string;
  product_id: string;
  landed_cost: number | null;
  received_at: string;
  product: GlobalProduct | null;
};

type BatchForm = ReturnType<typeof getEmptyBatch>;

export default function Stock() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  
  const { 
    state, 
    debouncedSearch, 
    setSearch, 
    setCategory, 
    setFilter, 
    reset: clearFilters 
  } = useFilters({ 
    category: 'Active',
    initialSearch: searchParams.get('q') || ''
  });

  const [selectedWarehouse, setSelectedWarehouse] = React.useState<string>("all");
  const parentRef = React.useRef<HTMLDivElement>(null);

  const { 
    data, 
    isLoading: loadingBatches,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useInventory(debouncedSearch, selectedWarehouse, state.category);

  const allBatches = React.useMemo(() => {
    return data?.pages.flatMap(p => p.data) || [];
  }, [data]);

  const [products, setProducts] = React.useState<GlobalProduct[]>([]);
  const [items_as_products, setItemsAsProducts] = React.useState<GlobalProduct[]>([]);
  const [warehouses, setWarehouses] = React.useState<WarehouseType[]>([]);

  const [open, setOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [form, setForm] = React.useState<BatchForm>(getEmptyBatch());
  const [batchToDelete, setBatchToDelete] = React.useState<string | null>(null);
  const [selectedItems, setSelectedItems] = React.useState<string[]>([]);

  const loadMetadata = React.useCallback(async () => {
    try {
      const { data: p, error: pErr } = await supabase.from("products").select("*").order("name");
      const { data: w, error: wErr } = await supabase.from("warehouses").select("*");

      if (pErr) throw pErr;
      if (wErr) throw wErr;

      setProducts((p as GlobalProduct[]) ?? []);
      setWarehouses(w || []);
      setItemsAsProducts((p as GlobalProduct[]) || []);
    } catch (error: unknown) {
      console.error('[Context] Load metadata failed', error);
      toast.error(friendlyError(error));
    }
  }, []);

  React.useEffect(() => { loadMetadata(); }, [loadMetadata]);

  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const in30 = React.useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const sortedBatches = React.useMemo(() => {
    return [...allBatches].sort((a, b) => {
      const sort = state.filters.sort || 'Expiry (Soonest)';
      if (sort === 'Expiry (Soonest)') return (a.expiry_date || "").localeCompare(b.expiry_date || "");
      if (sort === 'Expiry (Latest)') return (b.expiry_date || "").localeCompare(a.expiry_date || "");
      if (sort === 'Stock (Low)') return a.remaining_qty - b.remaining_qty;
      if (sort === 'Stock (High)') return b.remaining_qty - a.remaining_qty;
      return 0;
    });
  }, [allBatches, state.filters.sort]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, { product: GlobalProduct; batches: (typeof allBatches[0])[]; total_qty: number }>();
    sortedBatches.forEach(b => {
      if (!b.product || !b.product_id) return;
      const existing = map.get(b.product_id) ?? { 
        product: b.product as unknown as GlobalProduct, 
        batches: [], 
        total_qty: 0 
      };
      existing.batches.push(b);
      existing.total_qty += (b.remaining_qty || 0);
      map.set(b.product_id, existing);
    });
    return Array.from(map.values()).sort((a, b) => {
      const nameA = a.product.name || "";
      const nameB = b.product.name || "";
      return nameA.localeCompare(nameB);
    });
  }, [sortedBatches]);

  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? grouped.length + 1 : grouped.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  React.useEffect(() => {
    if (!lastItem) return;

    if (
      lastItem.index >= grouped.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage, grouped.length, isFetchingNextPage, lastItem]);

  const categories = [
    { label: 'Active', count: data?.pages[0]?.count || 0 }, 
    { label: 'Expiring', count: 0 }, 
    { label: 'Expired', count: 0 },
    { label: 'All', count: data?.pages[0]?.count || 0 }
  ];

  const stockFilters = [
    { 
      id: 'sort', 
      label: 'Sort By', 
      icon: 'sort' as const, 
      options: ['Expiry (Soonest)', 'Expiry (Latest)', 'Stock (Low)', 'Stock (High)'] 
    }
  ];

  const save = async () => {
    if (!form.product_id) return toast.error("Select a product");
    if (!form.batch_number.trim()) return toast.error("Batch number required");
    if (!form.expiry_date) return toast.error("Expiry date required");
    const mfgIso = form.mfg_date ? mmyyToIsoDate(form.mfg_date) : null;
    const expIso = mmyyToIsoExpiryDate(form.expiry_date);
    if (form.mfg_date && !mfgIso) return toast.error("Mfg date must be MMYY");
    if (!expIso) return toast.error("Expiry date must be MMYY");
    if (!form.received_qty || form.received_qty <= 0) return toast.error("Quantity must be > 0");

    const payload = {
      product_id: form.product_id,
      batch_number: form.batch_number.trim(),
      mfg_date: mfgIso,
      expiry_date: expIso,
      initial_qty: form.received_qty,
      received_qty: form.received_qty,
      remaining_qty: form.id ? form.remaining_qty : form.received_qty,
      cost_price: Number(form.cost_price || 0),
      landed_cost: Number(form.landed_cost || form.cost_price || 0),
      warehouse_id: form.warehouse_id || null,
      notes: form.notes || null,
      received_at: form.received_at || new Date().toISOString(),
    };

    const { error } = form.id 
      ? await supabase.from("inventory_batches").update(payload).eq("id", form.id)
      : await supabase.from("inventory_batches").insert(payload);

    if (error) {
      console.error('[Context] Save inventory batch failed', error);
      return toast.error(friendlyError(error));
    }
    
    // Automatically activate product if adding new stock
    if (!form.id && payload.received_qty > 0) {
      await supabase.from("products").update({ is_active: true }).eq("id", form.product_id);
    }
    
    // Recompute inventory aggregate after ANY save (insert or update)
    if (form.product_id) {
       await supabase.rpc('recompute_inventory', { _product_id: form.product_id });
    }
    
    toast.success(form.id ? "Stock updated" : "Stock received");

    // Sync Price Tiers for batch with valid landed cost
    if (payload.landed_cost > 0) {
      const p = items_as_products.find(x => x.id === form.product_id);
      if (p) {
        const pricingProd: PricingProduct = {
          id: p.id,
          units_per_packet: p.units_per_packet,
          packets_per_case: p.packets_per_case,
          mrp: p.mrp,
          pack_size_value: p.pack_size_value,
          pack_size_unit: p.pack_size_unit
        };
        const tiers = autoCalcAllTiers(pricingProd, payload.landed_cost, true);
        const tierMap = new Map<string, { product_id: string; shop_type: string; pack_type: string; price: number; updated_at: string }>();
        tiers.forEach(t => {
          const dbPt = toDbPackType(t.pack_type);
          const key = `${t.shop_type}-${dbPt}`;
          if (!tierMap.has(key)) {
            tierMap.set(key, {
              product_id: p.id,
              shop_type: t.shop_type,
              pack_type: dbPt,
              price: t.price,
              updated_at: new Date().toISOString()
            });
          }
        });
        const allTiersToUpsert = Array.from(tierMap.values());

        if (allTiersToUpsert.length > 0) {
          let tierErr = null;
          try {
            const res = await supabase
              .from("product_price_tiers")
              .upsert(allTiersToUpsert, { onConflict: "product_id,shop_type,pack_type" });
            tierErr = res.error;
          } catch (dbErr: unknown) {
            tierErr = dbErr;
          }

          const errObj = tierErr as { code?: string; message?: string } | null;
          if (errObj && (errObj.code === "42703" || errObj.message?.includes("does not exist"))) {
            console.warn("Table product_price_tiers lacks shop_type/pack_type. Retrying with flat tier columns in Stock sync.");
            const pcsTiers = tiers.filter(t => t.pack_type === 'pcs');
            const p1 = pcsTiers.find(t => t.shop_type === 'premium')?.price || 0;
            const p2 = pcsTiers.find(t => t.shop_type === 'gold')?.price || 0;
            const p3 = pcsTiers.find(t => t.shop_type === 'silver')?.price || 0;
            const p4 = pcsTiers.find(t => t.shop_type === 'bronze')?.price || 0;
            const p5 = pcsTiers.find(t => t.shop_type === 'basic')?.price || 0;

            const flatPayload = {
              product_id: p.id,
              tier_1_distributor: p1,
              tier_2_super_stockist: p2,
              tier_3_sub_stockist: p3,
              tier_4_wholesale: p4,
              tier_5_retail: p5,
              updated_at: new Date().toISOString()
            };
            const res = await supabase
              .from("product_price_tiers")
              .upsert(flatPayload, { onConflict: "product_id" });
            tierErr = res.error;
          }

          if (tierErr) {
            console.error("Auto pricing sync failed:", tierErr);
            toast.warning("Stock added, but price tier sync encountered an issue.");
          } else {
            toast.success("Stock added & price tiers synchronized successfully.");
          }
        }
      }
    }

    setOpen(false); setEditOpen(false); setForm(getEmptyBatch());
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };

  const startEdit = (b: Batch) => {
    // ALWAYS prefer items_as_products for latest multiplier info
    const p = items_as_products.find(x => x.id === b.product_id) || b.product;
    const info = derivePackaging(p || {});
    const cases = b.received_qty / (info.totalItemsInTop || 1);
    
    setForm({
      id: b.id,
      product_id: b.product_id,
      batch_number: b.batch_number,
      mfg_date: isoToMMYY(b.mfg_date),
      expiry_date: isoToMMYY(b.expiry_date),
      received_qty: b.received_qty,
      remaining_qty: b.remaining_qty,
      cost_price: b.cost_price,
      landed_cost: b.landed_cost || b.cost_price,
      notes: b.notes || "",
      input_qty_raw: Number(cases.toFixed(2)),
      input_unit: "top",
      warehouse_id: b.warehouse_id || "",
      input_cost_raw: (b.landed_cost || b.cost_price) * (info.totalItemsInTop || 1),
      received_at: b.received_at ? new Date(b.received_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
    setEditOpen(true);
  };

  const remove = async (id: string) => {
    const batch = (allBatches || []).find(b => b.id === id);
    const { error } = await supabase.from("inventory_batches").delete().eq("id", id);
    if (error) {
      console.error('[Context] Delete inventory batch failed', error);
      return toast.error(friendlyError(error));
    }
    
    if (batch?.product_id) {
      await supabase.rpc('recompute_inventory', { _product_id: batch.product_id });
    }
    
    toast.success("Batch deleted");
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["stock-movement"] });
    queryClient.invalidateQueries({ queryKey: ["v_stock_ledger_details"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    refetch();
  };

  return (
    <div className="pb-32 md:pb-24">
      <PageHeader
        title="Stocks"
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/")}
      />

      <ResponsiveContainer className="space-y-4 md:space-y-6 mt-1 md:mt-4">
        {/* Top Action Tabs */}
        <StockTabs />

        {/* Search & Filters Section */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-3">
            <div className="flex-1 w-full relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Name, SKU or Batch..."
                className="pl-10 pr-10 h-11 md:h-12 rounded-xl border border-border bg-card font-medium text-sm shadow-sm focus:border-primary/30 focus:ring-0 transition-all w-full"
                value={state.search}
                onChange={e => setSearch(e.target.value)}
              />
              {state.search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-11 md:h-12 w-full md:w-64 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between px-4 font-bold text-xs md:text-sm gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <Warehouse className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{selectedWarehouse === "all" ? "All Warehouses" : warehouses.find(w => w.id === selectedWarehouse)?.name}</span>
                    </div>
                    <Settings2 className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[calc(100vw-32px)] md:w-64 rounded-xl p-2 bg-white shadow-2xl border border-border z-50">
                  <div className="p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-2.5 block">Filter by Warehouse</p>
                    <div className="space-y-1">
                      <button 
                        onClick={() => setSelectedWarehouse("all")}
                        className={cn(
                          "w-full text-left px-4 py-2 rounded-xl text-xs font-bold transition-all",
                          selectedWarehouse === "all" ? "bg-primary/5 text-primary" : "hover:bg-muted/10 text-muted-foreground"
                        )}
                      >
                        All Warehouses
                      </button>
                      {warehouses.map(w => (
                        <button 
                          key={w.id}
                          onClick={() => setSelectedWarehouse(w.id)}
                          className={cn(
                            "w-full text-left px-4 py-2 rounded-xl text-xs font-bold transition-all",
                            selectedWarehouse === w.id ? "bg-primary/5 text-primary" : "hover:bg-muted/10 text-muted-foreground"
                          )}
                        >
                          {w.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Filter Tabs Consistent with Reports */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 py-1">
            <div className="flex-1 w-full bg-white/95 backdrop-blur-md border border-slate-100 rounded-3xl p-1 shadow-sm">
              <div className="flex items-center justify-between">
                {[
                  { id: 'Active', label: 'Active', icon: CheckCircle },
                  { id: 'Expiring', label: 'Expiring', icon: AlertTriangle },
                  { id: 'Expired', label: 'Expired', icon: XCircle },
                  { id: 'All', label: 'All', icon: Layers },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const isActive = state.category === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setCategory(tab.id)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 px-2 pt-2.5 pb-2 transition-all cursor-pointer relative flex-1 focus:outline-none",
                        isActive ? "opacity-100" : "opacity-50 hover:opacity-100"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-slate-600")} />
                      <span className={cn(
                        "text-[9px] sm:text-[10px] font-black uppercase tracking-tight transition-colors",
                        isActive ? "text-primary" : "text-slate-500"
                      )}>
                        {tab.label}
                      </span>
                      {isActive && (
                        <motion.div 
                          layoutId="activeStockTabPanel"
                          className="absolute bottom-0 left-2 right-2 h-[2.5px] bg-primary rounded-t-full"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

              {isAdmin && (
                <div className="hidden md:flex items-center gap-3">
                  <Button 
                    variant="outline" 
                    className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-primary hover:bg-slate-50 font-bold text-xs flex items-center gap-2 active:scale-95 transition-all shadow-sm"
                    onClick={async () => {
                      const tid = toast.loading("Checking stock...");
                      try {
                        const { error } = await supabase.rpc('recompute_all_inventory', {});
                        if (error) throw error;
                        toast.success("Stock counts fixed", { id: tid });
                        refetch();
                      } catch (err: unknown) {
                        console.error('[Context] Recompute inventory failed', err);
                        toast.error(friendlyError(err), { id: tid });
                      }
                    }}
                  >
                    <Zap className="h-4 w-4 text-primary fill-primary/10" />
                    <span>Fix Stocks</span>
                  </Button>
                  <Button 
                    className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-xs flex items-center gap-2 active:scale-[0.98] transition-all border-none shadow-sm shadow-primary/10"
                    onClick={() => navigate("/stock/grns")}
                  >
                    <Plus className="h-4 w-4" />
                    <span>Inward GRN</span>
                  </Button>
                </div>
              )}
            </div>
        </div>

        {/* Main Table Section */}
        {isMobile ? (
          <div className="space-y-3">
            {loadingBatches && sortedBatches.length === 0 ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-28 w-full animate-pulse bg-white rounded-xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)]" />
                ))}
              </div>
            ) : sortedBatches.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-100 py-12 p-5 text-center shadow-[0_2px_8px_rgba(0,0,0,0.015)]">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">List is Empty</p>
                <p className="text-sm font-semibold text-slate-600 mt-1">No batches found.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {sortedBatches.map((b) => {
                    const date = new Date(b.expiry_date);
                    const month = date.toLocaleString('default', { month: 'short' }).toUpperCase();
                    const year = date.getFullYear();
                    const status = b.expiry_date < today ? 'expired' : b.expiry_date <= in30 ? 'warning' : 'ok';
                    
                    return (
                      <div 
                        key={b.id} 
                        onClick={() => startEdit(b)}
                        className="bg-white rounded-3xl border border-slate-50 shadow-[0_4px_16px_rgba(0,0,0,0.015)] hover:shadow-md transition-all cursor-pointer p-4 flex justify-between items-center"
                      >
                        {/* Left side: Product */}
                        <div className="flex items-start gap-3 flex-1 min-w-0 mr-4">
                          <div className="h-11 w-11 rounded-2xl bg-[#E8EEF5]/40 border border-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                            <Archive className="h-5 w-5 text-[#5A7E9A] stroke-[1.5]" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-900 text-[13px] leading-tight block">{b.product?.name}</span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1 block">{b.product?.sku}</span>
                            
                            {/* Units & Expiry Stack under SKU on mobile */}
                            <div className="flex items-center gap-6 mt-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-950 text-[13px] leading-none tracking-tight">
                                  {b.remaining_qty.toLocaleString()}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1.5 leading-none">
                                  {b.product ? formatStockBreakdown(b.remaining_qty, b.product) || "UNITS" : "UNITS"}
                                </span>
                              </div>
                              
                              <div className={cn(
                                "flex flex-col items-center justify-center px-4 py-1.5 rounded-2xl select-none border border-transparent shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all shrink-0",
                                status === 'expired' ? "bg-red-50 text-red-600" :
                                status === 'warning' ? "bg-amber-50 text-amber-600" :
                                "bg-[#E6FDF5]" // Soft light green as in user's design image
                              )}>
                                <span className={cn(
                                  "text-[9px] font-black tracking-wider leading-none",
                                  status === 'expired' ? "text-red-500" : status === 'warning' ? "text-amber-500" : "text-emerald-500"
                                )}>{month}</span>
                                <span className={cn(
                                  "text-[10px] font-extrabold tracking-tight leading-none mt-0.5",
                                  status === 'expired' ? "text-red-800" : status === 'warning' ? "text-amber-800" : "text-emerald-850"
                                )}>{year}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Right side: Batch & Chevron */}
                        <div className="shrink-0 flex items-center gap-2">
                          <div className="text-right flex flex-col justify-center items-end min-w-0">
                            {b.batch_number.includes("-") ? (
                              <>
                                <span className="font-bold text-[#556982] text-xs leading-none">
                                  {b.batch_number.split("-")[0]}
                                </span>
                                <span className="font-semibold text-slate-400 text-[10px] mt-1 leading-none select-all uppercase text-right block break-all">
                                  {b.batch_number.substring(b.batch_number.indexOf("-") + 1)}
                                </span>
                              </>
                            ) : (
                              <span className="font-bold text-[#556982] text-xs leading-none select-all uppercase">
                                {b.batch_number}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer / Pagination Row */}
                <div className="flex justify-between items-center px-4 py-4 bg-white rounded-3xl border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.015)]">
                  <span className="text-[11px] font-medium text-slate-400">
                    Showing 1 to {sortedBatches.length} of {data?.pages[0]?.count ?? sortedBatches.length} entries
                  </span>
                  
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button 
                      className="h-7 w-7 rounded-lg border border-slate-150 flex items-center justify-center text-slate-400 hover:bg-slate-50 disabled:opacity-50"
                      disabled={true}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button className="h-7 w-7 rounded-lg bg-primary text-white font-black text-xs flex items-center justify-center shadow-sm">
                      1
                    </button>
                    <button 
                      className="h-7 w-7 rounded-lg border border-slate-150 flex items-center justify-center text-slate-400 hover:bg-slate-50 disabled:opacity-50"
                      disabled={!hasNextPage}
                      onClick={() => fetchNextPage()}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <AdaptiveTable
            data={sortedBatches}
            isLoading={loadingBatches}
            emptyMessage="No batches found."
            onRowClick={(b) => startEdit(b)}
            columns={[
              {
                header: "Product",
                id: "product",
                className: "pl-4",
                render: (b) => {
                  const status = b.expiry_date < today ? 'expired' : b.expiry_date <= in30 ? 'warning' : 'ok';
                  return (
                    <div className="flex items-center gap-4 py-2">
                      <div className={cn(
                        "h-12 w-12 rounded-[1rem] flex items-center justify-center shrink-0 border transition-colors bg-slate-50 border-slate-100"
                      )}>
                        <Layers size={18} className="text-slate-400 stroke-[1.5]" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-slate-900 leading-tight block">{b.product?.name}</span>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1">{b.product?.sku}</span>
                      </div>
                    </div>
                  );
                }
              },
              {
                header: "Batch",
                id: "batch",
                render: (b) => (
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-950 text-sm leading-none">{b.batch_number}</span>
                    {b.warehouse && (
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-1.5 flex items-center gap-1 leading-none">
                        <Warehouse className="h-3 w-3 text-slate-400/80" />
                        {b.warehouse.name}
                      </span>
                    )}
                  </div>
                )
              },
              {
                header: "Stock",
                id: "stock",
                render: (b) => {
                  const breakdown = b.product ? formatStockBreakdown(b.remaining_qty, b.product) : "";
                  return (
                    <div className="flex flex-col">
                      <span className="text-base font-black tabular-nums text-slate-950 leading-none">{b.remaining_qty.toLocaleString()}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5 leading-none">
                        {breakdown || "UNITS"}
                      </span>
                    </div>
                  );
                }
              },
              {
                header: "Expiry",
                id: "expiry",
                render: (b) => {
                  const date = new Date(b.expiry_date);
                  const month = date.toLocaleString('default', { month: 'short' }).toUpperCase();
                  const year = date.getFullYear();
                  const status = b.expiry_date < today ? 'expired' : b.expiry_date <= in30 ? 'warning' : 'ok';
                  
                  return (
                    <div className={cn(
                      "h-12 w-12 rounded-full flex flex-col items-center justify-center shrink-0 select-none border border-transparent shadow-sm transition-all",
                      status === 'expired' ? "bg-red-50 border-red-100 text-red-600" :
                      status === 'warning' ? "bg-amber-50 border-amber-100 text-amber-600" :
                      "bg-emerald-50 border-emerald-100 text-emerald-600"
                    )}>
                      <span className={cn(
                        "text-[9px] font-black tracking-widest leading-none",
                        status === 'expired' ? "text-red-500" : status === 'warning' ? "text-amber-500" : "text-emerald-500"
                      )}>{month}</span>
                      <span className={cn(
                        "text-[11px] font-extrabold tracking-tight leading-none mt-1.5",
                        status === 'expired' ? "text-red-800" : status === 'warning' ? "text-amber-800" : "text-emerald-800"
                      )}>{year}</span>
                    </div>
                  );
                }
              },
              {
                header: "",
                id: "actions",
                className: "text-right pr-4",
                render: (b) => (
                  <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-9 w-9 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
                      onClick={() => startEdit(b)}
                    >
                      <Edit2 size={14} />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-9 w-9 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50/50 transition-all animate-in fade-in"
                      onClick={() => setBatchToDelete(b.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )
              }
            ]}
            renderMobileCard={(b) => {
              const status = b.expiry_date < today ? 'expired' : b.expiry_date <= in30 ? 'warning' : 'ok';
              const date = new Date(b.expiry_date);
              const month = date.toLocaleString('default', { month: 'short' });
              const year = date.getFullYear();

              return (
                <div 
                  className="p-5 border border-white/20 rounded-3xl glass-card flex items-center gap-4 active:scale-95 transition-all shadow-sm relative group"
                  onClick={() => startEdit(b)}
                >
                  <div className={cn(
                    "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border",
                    status === 'expired' ? "bg-red-50 border-red-100 text-red-400" :
                    status === 'warning' ? "bg-amber-50 border-amber-100 text-amber-400" :
                    "bg-slate-50 border-slate-100 text-slate-300"
                  )}>
                    <Layers size={18} className="text-slate-400 stroke-[1.5]" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[13px] font-bold text-slate-900 leading-tight">{b.product?.name}</h4>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">{b.product?.sku}</p>
                    <div className="flex items-center gap-3 mt-1.5 focus:outline-none">
                      <span className="text-[11px] font-black text-slate-700 tabular-nums">{b.remaining_qty.toLocaleString()} <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight ml-0.5">units</span></span>
                      <Badge className={cn(
                        "rounded-full px-2 py-0.5 font-bold text-[9px] border-none scale-90 origin-left",
                        status === 'expired' ? "bg-red-50 text-red-600" :
                        status === 'warning' ? "bg-amber-50 text-amber-600" :
                        "bg-emerald-50 text-emerald-600"
                      )}>
                        {month} {year}
                      </Badge>
                    </div>
                  </div>

                  <div className="shrink-0">
                     <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-400 transition-colors" />
                  </div>
                </div>
              );
            }}
          />
        )}
      </ResponsiveContainer>

      {/* Floating Action Button (FAB) for Mobile instead of full-width sticky footer */}
      {isMobile && isAdmin && (
        <div className="fixed top-[74px] right-4 md:hidden z-40 animate-in zoom-in-50 duration-200">
          <Button 
            className="h-11 w-11 rounded-full border border-primary/60 text-primary bg-white/45 backdrop-blur-sm hover:bg-primary/5 flex items-center justify-center p-0 active:scale-95 transition-all shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
            onClick={() => navigate("/stock/grns")}
          >
            <Plus className="h-5 w-5 stroke-[2.5]" />
          </Button>
        </div>
      )}



      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="w-full md:max-w-2xl lg:max-w-3xl p-0 overflow-hidden border-l border-border/40 shadow-2xl bg-white focus:outline-none flex flex-col">
          <div className="h-full flex flex-col focus:outline-none relative">
            <div className="p-8 pb-4 shrink-0 bg-muted/20 border-b border-border/20">
              <SheetHeader className="mb-2 text-left">
                <SheetTitle className="text-3xl font-bold tracking-tight text-slate-900 leading-none">Modify Stock</SheetTitle>
                <div className="flex flex-wrap items-center gap-3 mt-6">
                    {(() => {
                      const p = items_as_products.find(x => x.id === form.product_id);
                      if (!p) return <span className="text-xs font-medium opacity-50 italic">Loading...</span>;
                      return (
                        <>
                           <Badge className="bg-primary hover:bg-primary text-white border-none rounded-lg font-bold text-[10px] uppercase tracking-wider px-3 py-1">
                              {p.sku}
                           </Badge>
                           <h3 className="text-xl font-bold tracking-tight text-foreground leading-none">{p.name}</h3>
                        </>
                      );
                    })()}
                </div>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8 md:pb-32 space-y-8 no-scrollbar">
              <div className="grid grid-cols-2 gap-5">
                <Field label="Batch number">
                  <Input 
                    className="h-14 rounded-2xl border-none bg-muted/50 font-black text-lg focus-visible:ring-2 focus-visible:ring-primary/20 px-5 transition-all" 
                    value={form.batch_number} 
                    onChange={(e) => setForm({ ...form, batch_number: e.target.value.toUpperCase() })} 
                  />
                </Field>
                <Field label="Expiry (MMYY)">
                  <Input
                    className="h-14 rounded-2xl border-none bg-muted/50 font-mono font-black text-lg text-center tracking-widest focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
                    placeholder="MMYY"
                    value={form.expiry_date}
                    onChange={(e) => setForm({ ...form, expiry_date: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  />
                </Field>
              </div>

              <div className="rounded-[2rem] border border-border/40 bg-muted/20 p-8 space-y-8 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary">
                     <PackagePlus size={18} />
                     <Label className="text-[10px] font-bold uppercase tracking-wider">Adjustment</Label>
                  </div>
                  {form.product_id && (() => {
                    const prod = items_as_products.find(x => x.id === form.product_id);
                    const info = derivePackaging(prod);
                    return (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-50">
                        1 {info.topUnit} = {info.totalItemsInTop} {info.baseUnit || 'units'}
                      </span>
                    );
                  })()}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 ring-2 ring-primary/5 p-6 rounded-3xl bg-primary/[0.01]">
                  <Field label={(() => {
                    if (!form.product_id) return "Total count";
                    const prod = items_as_products.find(x => x.id === form.product_id);
                    const info = derivePackaging(prod);
                    const labelUnit = info.topUnit === 'Doz' ? 'Doz' : `${info.topUnit}s`;
                    return `Inward count (${labelUnit})`;
                  })()}>
                    <Input 
                      type="number" 
                      inputMode="decimal"
                      className="h-20 text-3xl font-black rounded-2xl bg-white border-2 border-border/10 focus-visible:border-primary/50 focus-visible:ring-0 text-center transition-all shadow-sm"
                      value={form.input_qty_raw || ""} 
                      onChange={(e) => {
                        const cases = Number(e.target.value);
                        const p = items_as_products.find(x => x.id === form.product_id);
                        const info = derivePackaging(p || {});
                        const totalUnits = cases * (info.totalItemsInTop || 1);
                        const isNewBatch = form.received_qty === form.remaining_qty;
                        setForm({ 
                          ...form, 
                          input_qty_raw: cases,
                          received_qty: totalUnits,
                          remaining_qty: isNewBatch ? totalUnits : form.remaining_qty
                        });
                      }} 
                    />
                  </Field>
                  <div className="space-y-4">
                    <Field label="Calculated base units">
                      <div className="h-20 bg-primary/5 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-primary/10">
                        <span className="text-3xl font-black text-primary tracking-tighter leading-none">{form.received_qty}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary/40 mt-1">Total Pieces</span>
                      </div>
                    </Field>
                    
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-50 block px-2">Current Physical Balance (Override)</Label>
                      <div className="flex gap-4">
                        <Input 
                          type="number" 
                          inputMode="decimal"
                          className="h-16 rounded-2xl flex-1 font-black text-3xl text-primary border-none bg-white text-center shadow-sm focus-visible:ring-2 focus-visible:ring-primary/20" 
                          value={form.remaining_qty} 
                          onChange={(e) => setForm({ ...form, remaining_qty: Number(e.target.value) })} 
                        />
                        <div className="w-1/3 flex items-center justify-center bg-muted/40 rounded-2xl border border-border/20 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                          Units Left
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[2.5rem] border border-primary/20 bg-primary/[0.02] p-8 space-y-8 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                    <IndianRupeeIcon size={18} />
                    <Label className="text-[10px] font-bold uppercase tracking-wider">Pricing Update</Label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field label={(() => {
                    if (!form.product_id) return "Cost per Unit";
                    const prod = items_as_products.find(x => x.id === form.product_id);
                    const info = derivePackaging(prod);
                    return `Cost per ${info.topUnit}`;
                  })()}>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-primary flex items-center justify-center font-bold text-xl opacity-30 select-none group-focus-within:opacity-100 transition-opacity">₹</div>
                      <Input 
                        type="number" 
                        inputMode="decimal"
                        className="h-20 pl-14 rounded-2xl border-2 border-border/10 bg-white font-bold text-3xl text-primary focus-visible:border-primary/50 focus-visible:ring-0 transition-all shadow-sm"
                        value={(() => {
                          const p = items_as_products.find(x => x.id === form.product_id);
                          const info = derivePackaging(p || {});
                          return Number(((form.landed_cost || 0) * (info.totalItemsInTop || 1)).toFixed(2));
                        })()} 
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const p = items_as_products.find(x => x.id === form.product_id);
                          const info = derivePackaging(p || {});
                          const unitInvoice = val / (info.totalItemsInTop || 1);
                          setForm({ ...form, landed_cost: unitInvoice, cost_price: unitInvoice });
                        }} 
                      />
                    </div>
                  </Field>
                  <div className="flex flex-col justify-center">
                    <div className="h-20 p-5 bg-white rounded-2xl border-2 border-dashed border-primary/10 flex flex-col items-center justify-center shadow-sm">
                      <span className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-wider leading-none mb-1">Price per Piece</span>
                      <span className="text-2xl font-bold text-primary tracking-tight leading-none">
                        {fmtINR(form.landed_cost)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Field label="Notes for records">
                <textarea 
                  className="w-full h-32 rounded-3xl border-none bg-muted/50 font-medium text-sm p-6 focus-visible:ring-2 focus-visible:ring-primary/20 transition-all resize-none shadow-sm" 
                  value={form.notes} 
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} 
                  placeholder="Record why this change was made..."
                />
              </Field>
            </div>

            <div className="p-8 bg-white border-t border-border/20 flex gap-4 shrink-0 mt-auto md:absolute md:bottom-0 md:left-0 md:right-0 z-30">
              <Button variant="outline" className="h-16 rounded-[2rem] flex-1 font-bold uppercase text-[10px] tracking-wider border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all shadow-sm" onClick={() => setEditOpen(false)}>Discard</Button>
              <Button className="h-16 rounded-[2rem] flex-[2] font-bold uppercase text-[10px] tracking-wider shadow-xl shadow-primary/20 bg-primary border-none text-white hover:translate-y-[-2px] transition-all active:translate-y-0" onClick={save}>
                Save Changes
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={batchToDelete !== null} onOpenChange={(open) => !open && setBatchToDelete(null)}>
        <AlertDialogContent className="rounded-2xl border border-border shadow-md bg-white max-w-md">
          <AlertDialogHeader>
            <div className="mb-4 h-16 w-16 bg-destructive/5 rounded-2xl flex items-center justify-center text-destructive">
              <Trash2 className="h-8 w-8" />
            </div>
            <AlertDialogTitle className="text-2xl font-bold tracking-tight text-slate-900">
              Delete this Batch?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-slate-600 font-medium leading-relaxed">
                <div className="mb-4">You are about to permanently delete this inventory records.</div>
                <div className="p-4 bg-destructive/5 rounded-xl border border-destructive/10 text-destructive">
                  <div className="text-[10px] font-bold uppercase tracking-wider">What happens?</div>
                  <div className="text-sm font-semibold mt-1 italic leading-tight">Total Stock counts will be updated across the system.</div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            <AlertDialogCancel className="h-11 rounded-xl font-bold text-xs flex-1 border shadow-sm">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="h-11 rounded-xl font-bold text-xs flex-1 bg-destructive hover:bg-destructive/90 shadow-xl shadow-destructive/20 text-white border-none"
              onClick={() => {
                if (batchToDelete) {
                  remove(batchToDelete);
                  setBatchToDelete(null);
                }
              }}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground ml-0.5">{label}</Label>
      {children}
    </div>
  );
}

function StockTab({ label, isActive, onClick }: { label: string; isActive?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-10 md:h-12 px-5 md:px-6 rounded-xl border border-white/30 transition-all whitespace-nowrap text-[10px] md:text-[11px] font-black uppercase tracking-widest active:scale-95",
        isActive 
          ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.05]" 
          : "glass-card text-foreground hover:bg-white/40"
      )}
    >
      {label}
    </button>
  );
}

function QuickLink({ 
  icon: Icon, 
  label, 
  onClick, 
  color 
}: { 
  icon: LucideIcon, 
  label: string, 
  onClick: () => void, 
  color: "blue" | "emerald" | "amber" | "slate" | "indigo"
}) {
  const colors = {
    blue: "text-[#2563eb] hover:bg-blue-50/50",
    emerald: "text-[#059669] hover:bg-emerald-50/50",
    amber: "text-[#d97706] hover:bg-amber-50/50",
    slate: "text-[#475569] hover:bg-slate-50/50",
    indigo: "text-[#4f46e5] hover:bg-indigo-50/50"
  };

  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-black/5 bg-white transition-all active:scale-95 shrink-0 shadow-sm snap-start group hover:shadow-md hover:border-black/10 min-w-0",
        colors[color]
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:scale-110" />
      <span className="text-[9px] font-black uppercase tracking-tight truncate transition-colors">{label}</span>
    </button>
  );
}
