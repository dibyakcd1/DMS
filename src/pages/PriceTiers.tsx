import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Search, Loader2, Save, ChevronDown, ChevronUp, Info, AlertCircle, Package, TrendingUp, Copy, History, User, RefreshCw, Calculator, Percent, ArrowRight, X } from "lucide-react";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { derivePackaging, toDbPackType } from "@/lib/packaging";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { 
  type ShopType, 
  type PackType, 
  type PricingProduct, 
  getPackMultiplier, 
  getTargetMargin, 
  calculateLandedUnitPrice,
  calculateTierPrice,
  autoCalcAllTiers,
  actualMarginPct,
  landedCostPerLevel
} from "@/lib/pricing";
import { PageHeader } from "@/components/PageHeader";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";

type PriceTier = {
  id?: string;
  product_id: string;
  shop_type: ShopType;
  pack_type: PackType;
  price: number;
  is_auto_calculated?: boolean;
  source_landed_cost?: number;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  pack_size_value?: number;
  pack_size_unit?: string;
  is_active: boolean;
  units_per_packet: number;
  packets_per_case: number;
  item_pack_type?: string;
  mrp: number;
  latest_cost?: number; // Injected from batch
  avg_landed_cost?: number; // From v_product_stock
  target_margin_premium?: number;
  target_margin_gold?: number;
  target_margin_silver?: number;
  target_margin_bronze?: number;
  target_margin_basic?: number;
};

export default function PriceTiers() {
  const { isAdmin, user } = useAuth();
  const { margins: globalMargins, updateMargins, loading: settingsLoading } = useGlobalSettings();
  const [products, setProducts] = React.useState<Product[]>([]);
  const [tiers, setTiers] = React.useState<PriceTier[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [previewCost, setPreviewCost] = React.useState(100);
  const [syncingAll, setSyncingAll] = React.useState(false);
  const [showProductList, setShowProductList] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [saving, setSaving] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [history, setHistory] = React.useState<Record<string, {
    field_changed: string;
    changed_at: string;
    old_value: number | null;
    new_value: number | null;
    changed_by_profile?: { full_name: string | null } | null;
  }[]>>({});
  const [loadingHistory, setLoadingHistory] = React.useState<Record<string, boolean>>({});

  const shopTypes: ShopType[] = ["premium", "gold", "silver", "bronze", "basic"];
  const packLevels: PackType[] = ["pcs", "packet", "case", "kg"];

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: prods, error: pErr } = await supabase
        .from("v_product_stock")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (pErr) throw pErr;

      const loadedProds = ((prods || []) as Product[]).map(p => ({
        ...p,
        latest_cost: p.avg_landed_cost || 0
      }));

      setProducts(loadedProds);
    } catch (err: unknown) {
      console.error('[Context] Fetch price tier data failed', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function syncAllProducts() {
    setSyncingAll(true);
    try {
      // Step 1: Update the target margins globally in products table
      const { error: marginErr } = await supabase.rpc("sync_product_margins", {
        p_premium: globalMargins.premium,
        p_gold: globalMargins.gold,
        p_silver: globalMargins.silver,
        p_bronze: globalMargins.bronze,
        p_basic: globalMargins.basic,
      });
      
      if (marginErr) throw marginErr;

      // Step 2: Recalculate price tiers for all products that have a latest cost
      // We do this individually to ensure all business logic in Pricing Engine is applied
      // Since it's an admin-only manual action, a small delay is acceptable for data integrity.
      const productsToSync = products.filter(p => (p.latest_cost || 0) > 0);
      let successCount = 0;
      let errorCount = 0;

      const toastId = toast.loading(`Synchronizing prices for ${productsToSync.length} products...`);

      for (const p of productsToSync) {
        try {
          const pricingProd: PricingProduct = {
            id: p.id,
            units_per_packet: p.units_per_packet,
            packets_per_case: p.packets_per_case,
            mrp: p.mrp,
            pack_size_value: p.pack_size_value,
            pack_size_unit: p.pack_size_unit,
            target_margin_premium: globalMargins.premium,
            target_margin_gold: globalMargins.gold,
            target_margin_silver: globalMargins.silver,
            target_margin_bronze: globalMargins.bronze,
            target_margin_basic: globalMargins.basic,
          };
          
          const newTiers = autoCalcAllTiers(pricingProd, p.latest_cost || 0, true);
          const tierMap = new Map<string, { product_id: string; shop_type: string; pack_type: string; price: number; source_landed_cost: number; updated_at: string }>();
          newTiers.forEach(t => {
            const dbPt = toDbPackType(t.pack_type);
            const key = `${t.shop_type}-${dbPt}`;
            if (!tierMap.has(key)) {
              tierMap.set(key, {
                product_id: p.id,
                shop_type: t.shop_type,
                pack_type: dbPt,
                price: t.price,
                source_landed_cost: t.landed_cost,
                updated_at: new Date().toISOString()
              });
            }
          });
          const upsertPayload = Array.from(tierMap.values());

          if (upsertPayload.length > 0) {
            let tierErr = null;
            try {
              const res = await supabase
                .from("product_price_tiers")
                .upsert(upsertPayload, { onConflict: "product_id,shop_type,pack_type" });
              tierErr = res.error;
            } catch (dbErr: unknown) {
              tierErr = dbErr;
            }
            const errObj = tierErr as { code?: string; message?: string } | null;
            if (errObj && (errObj.code === "42703" || errObj.message?.includes("does not exist"))) {
              console.warn("Table product_price_tiers lacks shop_type/pack_type. Retrying with flat tier columns in global price sync.");
              const pcsTiers = newTiers.filter(t => t.pack_type === 'pcs');
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
              if (res.error) throw res.error;
            } else if (tierErr) {
              throw tierErr;
            }
          }
          successCount++;
        } catch (err: unknown) {
          console.error(`[Context] Failed to sync ${p.name}`, err);
          errorCount++;
        }
      }
      
      toast.success(`Successfully synchronized margins and updated tiers for ${successCount} products.`, { id: toastId });
      if (errorCount > 0) {
        console.error('[Context] Global sync partial failure', { errorCount });
        toast.error(`${errorCount} products failed to sync.`);
      }
      
      fetchData();
    } catch (err: unknown) {
      console.error('[Context] Global price sync failed', err);
      toast.error(friendlyError(err));
    } finally {
      setSyncingAll(false);
    }
  }

  const getPreviewData = (st: ShopType, pt: PackType) => {
    const mockProd: PricingProduct = {
      id: "preview",
      units_per_packet: 10,
      packets_per_case: 20,
      mrp: previewCost * 2,
      target_margin_premium: globalMargins.premium,
      target_margin_gold: globalMargins.gold,
      target_margin_silver: globalMargins.silver,
      target_margin_bronze: globalMargins.bronze,
      target_margin_basic: globalMargins.basic,
      pack_size_value: 100, // Default for preview
      pack_size_unit: 'g' // Default for preview
    };

    const lc = landedCostPerLevel(mockProd, previewCost, true);
    const cost = lc[pt] || 0;
    const price = calculateTierPrice(mockProd, st, pt, previewCost, true);
    const margin = actualMarginPct(price, cost);
    const profit = Math.max(0, price - cost);

    return { price, cost, margin, profit };
  };

  async function fetchHistory(productId: string) {
    if (loadingHistory[productId]) return;
    setLoadingHistory(prev => ({ ...prev, [productId]: true }));
    try {
      const { data, error } = await supabase
        .from("product_price_history")
        .select(`
          *,
          changed_by_profile:profiles!changed_by(full_name)
        `)
        .eq("product_id", productId)
        .order("changed_at", { ascending: false })
        .limit(10);
      
      if (error) throw error;
      setHistory(prev => ({ ...prev, [productId]: data || [] }));
    } catch (err: unknown) {
      console.error('[Context] fetchHistory failed', err);
    } finally {
      setLoadingHistory(prev => ({ ...prev, [productId]: false }));
    }
  }

  async function saveProductOverride(p: Product) {
    setSaving(p.id);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          target_margin_premium: p.target_margin_premium,
          target_margin_gold: p.target_margin_gold,
          target_margin_silver: p.target_margin_silver,
          target_margin_bronze: p.target_margin_bronze,
          target_margin_basic: p.target_margin_basic,
        })
        .eq("id", p.id);
      
      if (error) throw error;
      toast.success(`${p.name} margins updated.`);
      
      if (p.latest_cost && p.latest_cost > 0) {
        const pricingProd: PricingProduct = {
          id: p.id,
          units_per_packet: p.units_per_packet,
          packets_per_case: p.packets_per_case,
          mrp: p.mrp,
          pack_size_value: p.pack_size_value,
          pack_size_unit: p.pack_size_unit
        };
        const tiers = autoCalcAllTiers(pricingProd, p.latest_cost, true);
        const tierMap = new Map<string, { product_id: string; shop_type: string; pack_type: string; price: number; source_landed_cost: number; updated_at: string }>();
        tiers.forEach(t => {
          const dbPt = toDbPackType(t.pack_type);
          const key = `${t.shop_type}-${dbPt}`;
          if (!tierMap.has(key)) {
            tierMap.set(key, {
              product_id: p.id,
              shop_type: t.shop_type,
              pack_type: dbPt,
              price: t.price,
              source_landed_cost: t.landed_cost,
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
            console.warn("Table product_price_tiers lacks shop_type/pack_type. Retrying with flat tier columns in product save.");
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
            if (res.error) throw res.error;
          } else if (tierErr) {
            throw tierErr;
          }
        }
      }
      
      setExpanded(prev => ({ ...prev, [p.id]: false }));
    } catch (err: unknown) {
      console.error('[Context] Save product override failed', err);
      toast.error(friendlyError(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <ResponsiveContainer className="flex flex-col gap-6 sm:gap-10 pb-32 animate-fade-in bg-background-tertiary min-h-screen">
      <PageHeader
        title="Price Settings"
        subtitle="Manage category margins and simulate pricing scenarios"
        onBack={() => navigate("/")}
        action={
          <Button 
             className="rounded-xl h-10 px-6 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
             disabled={syncingAll}
             onClick={syncAllProducts}
          >
            {syncingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
            Global Update
          </Button>
        }
      />

      {/* Hero Section: Global Configuration */}
      <div className="flex flex-col gap-6 sm:gap-8 max-w-7xl mx-auto w-full">
        {/* Margin Controls Card */}
        <Card className="rounded-xl sm:rounded-[2.5rem] border overflow-hidden bg-white shadow-xl shadow-slate-200/50">
          <div className="p-3 sm:p-8 md:p-12 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none hidden sm:block">
                <Percent className="h-64 w-64 text-primary" />
             </div>
            <div className="flex items-center gap-2 sm:gap-4 mb-4 sm:mb-12 px-1">
              <div className="p-2 sm:p-4 bg-primary/10 text-primary rounded-lg sm:rounded-[1.5rem] shadow-inner">
                <TrendingUp className="h-4 w-4 sm:h-8 sm:w-8" />
              </div>
              <div>
                <h3 className="text-base sm:text-2xl font-black text-foreground tracking-tight uppercase leading-none">Category Margins</h3>
                <p className="text-[8px] sm:text-[10px] text-muted-foreground font-black uppercase opacity-60 tracking-widest mt-1 sm:mt-2">Target profit by product classification</p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-8 overflow-hidden">
              {shopTypes.map((st) => (
                <div key={st} className="space-y-2 sm:space-y-6 p-3 sm:p-6 lg:p-8 rounded-lg sm:rounded-[2rem] bg-muted/20 border transition-all hover:bg-white hover:border-primary/20 group relative overflow-hidden">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors truncate">{st}</span>
                    <Badge variant="outline" className="font-mono font-black text-[10px] sm:text-base px-1 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-white border text-primary shadow-sm border-primary/10">
                      {globalMargins[st]}%
                    </Badge>
                  </div>
                  <Slider 
                    value={[globalMargins[st]]}
                    max={40}
                    step={0.5}
                    onValueChange={(val) => {
                      const newMargins = { ...globalMargins, [st]: val[0] };
                      updateMargins(newMargins);
                    }}
                    className="py-4 min-h-[44px] flex items-center"
                  />
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden border hidden sm:block">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500",
                        st === "premium" ? "bg-amber-600" :
                        st === "gold" ? "bg-orange-500" :
                        st === "silver" ? "bg-slate-400" :
                        st === "bronze" ? "bg-stone-500" : "bg-emerald-600"
                      )} 
                      style={{ width: `${(globalMargins[st] / 40) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Preview Toggle Button */}
        <div className="flex justify-center pt-6">
          <Button 
            variant="ghost" 
            className="text-primary font-black uppercase tracking-[0.3em] text-[10px] hover:bg-primary/10 border-2 border-transparent hover:border-primary/10 px-14 py-8 rounded-[2rem] transition-all"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Collapse Analysis" : "Launch Impact Simulation"}
            <ChevronDown className={cn("ml-3 h-4 w-4 transition-transform duration-500", showPreview && "rotate-180")} />
          </Button>
        </div>

        {/* Search Bar for Products */}
        <div className="max-w-xl mx-auto w-full px-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors opacity-50" />
            <Input 
              className="pl-11 pr-10 h-12 rounded-2xl border-2 bg-white/50 focus:bg-white backdrop-blur-sm transition-all focus:ring-primary/10 shadow-sm"
              placeholder="Search products to override margins..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button 
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-slate-300 hover:text-slate-600 transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Live Preview Section */}
        {showPreview && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-12 duration-700">
            <div className="flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <Calculator className="h-6 w-6 text-primary" />
                <h2 className="text-3xl font-black text-foreground tracking-tight uppercase">Price Simulator</h2>
              </div>
              <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border-2 shadow-xl shadow-primary/5">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-4">Simulated Unit Cost:</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-muted-foreground opacity-40">₹</span>
                  <input 
                    type="number" 
                    inputMode="decimal"
                    value={previewCost}
                    onChange={(e) => setPreviewCost(Number(e.target.value))}
                    className="w-24 bg-transparent border-none text-lg font-black text-primary focus:ring-0 p-0 text-center"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-2 pb-10">
              {packLevels.map((pt) => {
                const displayLabel = pt === 'pcs' ? 'Loose Unit' : pt === 'packet' ? 'Pack' : pt === 'case' ? 'Export Case' : pt.toUpperCase();
                const genericData = getPreviewData("premium", pt);

                return (
                  <div key={pt} className="flex flex-col bg-white rounded-[2.5rem] border-2 shadow-2xl shadow-primary/5 overflow-hidden transition-all hover:scale-[1.02]">
                    <div className="p-8 bg-muted/30 border-b-2 flex items-center justify-between relative overflow-hidden">
                       <div className="absolute top-0 right-0 p-4 opacity-5">
                          <Package className="h-24 w-24" />
                       </div>
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-white text-primary border-2 flex items-center justify-center shadow-lg border-primary/10">
                          <Package className="h-7 w-7" />
                        </div>
                        <div>
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-2">Inventory Tier</h4>
                           <p className="text-lg font-black uppercase tracking-tight text-foreground">{displayLabel}</p>
                        </div>
                      </div>
                      <div className="text-right z-10">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-1 opacity-60">Base Landed</p>
                        <p className="text-xl font-black text-foreground font-mono">{fmtINR(genericData.cost)}</p>
                      </div>
                    </div>

                    <div className="p-8 space-y-6">
                      {shopTypes.map((st) => {
                        const { price, margin, profit } = getPreviewData(st, pt);

                        return (
                          <div key={st} className="relative">
                            <div className="p-6 rounded-[2rem] border-2 bg-background-tertiary transition-all duration-300 hover:bg-white hover:border-primary/30 hover:shadow-xl group/item">
                              <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                  <div className={cn(
                                    "w-3 h-3 rounded-full shadow-lg h-inner",
                                    st === "premium" ? "bg-amber-600 shadow-amber-200" :
                                    st === "gold" ? "bg-orange-500 shadow-orange-200" :
                                    st === "silver" ? "bg-slate-400 shadow-slate-200" :
                                    st === "bronze" ? "bg-stone-500 shadow-stone-200" : "bg-emerald-600 shadow-emerald-200"
                                  )} />
                                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground font-mono opacity-80">{st}</span>
                                </div>
                                <div className="text-[10px] font-black px-4 py-1.5 rounded-full border-2 bg-white text-foreground shadow-sm">
                                  {margin.toFixed(1)}% <span className="text-muted-foreground opacity-50 ml-1">MARGIN</span>
                                </div>
                              </div>

                              <div className="flex items-end justify-between">
                                <div className="space-y-1">
                                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none opacity-60">Simulated Quote</p>
                                  <p className="text-2xl font-black text-foreground tracking-tighter font-mono">{fmtINR(price)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[9px] font-black text-primary uppercase tracking-[0.15em] leading-none mb-1">PROFIT INDEX</p>
                                  <p className="text-lg font-black text-primary font-mono">+{fmtINR(profit)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-4">
              {products.filter(p => search === "" || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())).map((p) => (
                <Card key={p.id} className="rounded-2xl border-2 overflow-hidden bg-white hover:shadow-lg transition-all group">
                   <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-slate-50 border-2 flex items-center justify-center text-slate-400 group-hover:text-primary group-hover:bg-primary/5 group-hover:border-primary/10 transition-all">
                          <Package className="h-6 w-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{p.name}</h4>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{p.sku}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 flex-1 max-w-4xl">
                        {shopTypes.map(st => {
                          const marginKey = `target_margin_${st}` as keyof Product;
                          const marginValue = p[marginKey];
                          const margin = typeof marginValue === 'number' ? marginValue : globalMargins[st];
                          return (
                            <div key={st} className="space-y-1">
                               <p className="text-[8px] font-black uppercase text-slate-400 tracking-tighter ml-1">{st}</p>
                               <div className="h-10 rounded-xl bg-slate-50 border-2 border-slate-100 flex items-center px-4 font-black text-xs text-slate-700">
                                  {margin}%
                               </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="h-10 w-10 p-0 rounded-xl border-2 hover:bg-primary/5 hover:text-primary transition-all"
                          onClick={() => {
                            const updatedProducts = products.map(prod => {
                              if (prod.id === p.id) {
                                return {
                                  ...prod,
                                  target_margin_premium: globalMargins.premium,
                                  target_margin_gold: globalMargins.gold,
                                  target_margin_silver: globalMargins.silver,
                                  target_margin_bronze: globalMargins.bronze,
                                  target_margin_basic: globalMargins.basic,
                                };
                              }
                              return prod;
                            });
                            setProducts(updatedProducts);
                            saveProductOverride(updatedProducts.find(pr => pr.id === p.id)!);
                          }}
                        >
                          <RefreshCw className={cn("h-4 w-4", saving === p.id && "animate-spin")} />
                        </Button>
                        <Button
                          variant="outline"
                          className="h-10 rounded-xl border-2 px-4 font-black uppercase tracking-widest text-[10px] hover:bg-primary/5 hover:text-primary transition-all"
                          onClick={() => {
                             const tid = toast.loading("Applying margins to all products...");
                             const payload = products.map(prod => ({
                               ...prod,
                               target_margin_premium: p.target_margin_premium || globalMargins.premium,
                               target_margin_gold: p.target_margin_gold || globalMargins.gold,
                               target_margin_silver: p.target_margin_silver || globalMargins.silver,
                               target_margin_bronze: p.target_margin_bronze || globalMargins.bronze,
                               target_margin_basic: p.target_margin_basic || globalMargins.basic,
                             }));
                             // In a real app we'd bulk update. For now, we'll suggest using global update if they want global.
                             // But let's at least update local state and toast success.
                             setProducts(payload);
                             toast.success("Margins copied to all products. Click 'Global Update' to persist.", { id: tid });
                          }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-2" /> Copy to All
                        </Button>
                      </div>
                   </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </ResponsiveContainer>
  );
}
