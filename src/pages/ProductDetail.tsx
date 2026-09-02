import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowLeft, Package, Zap, History, Minus, Plus, 
  Check, Loader2, Save, Trash2, ShieldCheck, 
  Settings2, Activity, Truck, Grid, TrendingUp, TrendingDown,
  Info, BarChart3, PhilippinePeso, Sparkles, Building2,
  Percent, Hash, Layers, Boxes, RefreshCw
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { type Product, type Company } from "@/types";
import { fmtDate, fmtINR } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sanitizeProductForDb, getPackMultiplier, landedCostPerLevel, persistProductToSupabase, isProductDozenPackaging } from "@/lib/packaging";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { useCompanies } from "@/hooks/useCompanies";
import { generateSku } from "@/lib/skuGenerator";
import { 
  DEFAULT_CATEGORY_NAMES, 
  FMCG_DIVISIONS, 
  inferTaxonomyCategory, 
  inferTaxonomyDivision, 
  inferSubCategory, 
  inferCompanyMatch,
  computeTaxBreakdown,
  normalizeDivisionCategory,
  normalizeDivisionCategoryForDb
} from "@/lib/taxonomy";
import { lookupHsnTaxonomy } from "@/lib/hsnTaxonomy";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer as RechartsContainer,
  AreaChart,
  Area
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const extractWeight = (name: string) => {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(\.?gms?|g|kg|ml|ltr)/i);
  if (match) {
    const value = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    if (unit === 'g' || unit === 'gms' || unit === '.gms') unit = 'g';
    if (unit === 'kg') unit = 'Kg';
    return { value, unit };
  }
  return null;
};

const computeWeightPerUnit = (value: number | null, unit: string | null): number | null => {
  if (!value || !unit) return null;
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'gms' || u === 'ml') return value;
  if (u === 'kg' || u === 'ltr' || u === 'l') return value * 1000;
  return null;
};

interface HistoryLog {
  id: string;
  field_changed: string;
  old_value: string | number | null;
  new_value: string | number | null;
  changed_at: string;
  profile?: { full_name: string | null } | null;
}

interface BatchRecord {
  id: string;
  batch_number: string | null;
  cost_price: number | null;
  landed_cost: number | null;
  received_qty: number;
  remaining_qty: number;
  received_at: string;
  expiry_date: string | null;
  warehouse?: { name: string; code: string } | null;
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [product, setProduct] = React.useState<Product | null>(null);
  const [edit, setEdit] = React.useState<Partial<Product>>({});
  const [history, setHistory] = React.useState<HistoryLog[]>([]);
  const [batches, setBatches] = React.useState<BatchRecord[]>([]);
  const [activeTab, setActiveTab] = React.useState("details");
  const [categories, setCategories] = React.useState<string[]>(DEFAULT_CATEGORY_NAMES);
  const { categoryMargins } = useGlobalSettings();
  const { data: companies = [] } = useCompanies();

  const wacHistoryData = React.useMemo(() => {
    return history
      .filter(h => h.field_changed === 'avg_landed_cost' || h.field_changed === 'landed_cost' || h.field_changed === 'cost_price')
      .map(h => ({
        date: new Date(h.changed_at).toLocaleDateString(),
        value: Number(h.new_value)
      }))
      .reverse();
  }, [history]);

  const load = React.useCallback(async () => {
    try {
      // Fetch categories from DB and merge with defaults
      const { data: divData } = await supabase.from("products").select("division_category");
      const normalizedDbCats = (divData?.map(d => normalizeDivisionCategory(d.division_category)).filter(Boolean) as string[]) || [];
      const uniqueCats = Array.from(new Set([
        ...DEFAULT_CATEGORY_NAMES,
        ...normalizedDbCats
      ])).filter(c => c !== "SPECIAL PRODUCTS" && c !== "BASIC SPICES" && c !== "BLENDED SPICES").sort();
      setCategories(uniqueCats);

      if (!id || id === "new") {
        const defaultProd: Product = {
          id: "",
          name: "",
          sku: "",
          mrp: 0,
          selling_price: 0,
          cost_price: 0,
          gst_rate: 0,
          cgst_rate: 0,
          sgst_rate: 0,
          igst_rate: 0,
          is_active: true,
          unit_type: "pcs",
          units_per_packet: 1,
          packets_per_case: 1,
          units_per_case: 1,
          preferred_sell_unit: "packet",
          case_qty_unit: "unit",
          item_pack_type: "packet",
          division_category: "General",
          division: "General",
          brand: "",
          min_stock: 50,
          company_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        setProduct(defaultProd);
        setEdit(defaultProd);
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("v_product_stock")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error) throw error;

      // Fetch actual inventory batches for this product
      const { data: batchData } = await supabase
        .from("inventory_batches")
        .select(`
          id,
          batch_number,
          cost_price,
          landed_cost,
          received_qty,
          remaining_qty,
          received_at,
          expiry_date,
          warehouse:warehouse_id(name, code)
        `)
        .eq("product_id", id)
        .order("received_at", { ascending: false });
      
      const batchList = (batchData as unknown as BatchRecord[]) || [];
      setBatches(batchList);

      const realTotalStock = batchList.reduce((sum, b) => sum + (Number(b.remaining_qty) || 0), 0);

      const prodRecord = data as Record<string, unknown>;
      
      // Auto-detect missing category, division, or tax rates on load if empty/default
      const currentName = String(prodRecord.name || "");
      const currentHsn = prodRecord.hsn ? String(prodRecord.hsn).trim() : null;
      let detectedCategory = prodRecord.division_category as string;
      const isLegacyDefault = !detectedCategory || 
        detectedCategory === "SPECIAL PRODUCTS" || 
        detectedCategory === "Other" || 
        detectedCategory === "BASIC SPICES" || 
        detectedCategory === "BLENDED SPICES" ||
        (detectedCategory === "Spices" && Boolean(currentHsn && !currentHsn.startsWith("09")));

      if (isLegacyDefault) {
        detectedCategory = inferTaxonomyCategory(currentName, uniqueCats, currentHsn);
      } else {
        detectedCategory = normalizeDivisionCategory(detectedCategory, currentName, currentHsn);
      }

      let detectedDivision = prodRecord.division as string;
      if (!detectedDivision || detectedDivision === "General FMCG" || detectedDivision === "SPECIAL PRODUCTS") {
        detectedDivision = inferTaxonomyDivision(detectedCategory || currentName);
      }

      let detectedCompanyId = prodRecord.company_id as string | null;
      if (!detectedCompanyId && companies.length > 0) {
        const matchedComp = inferCompanyMatch(currentName, prodRecord.brand as string, companies);
        if (matchedComp) detectedCompanyId = matchedComp.id;
      }

      // Calculate tax rates if gst_rate is present but cgst/sgst are null or if HSN provides default
      let currentGst = Number(prodRecord.gst_rate) || 0;
      if (currentGst === 0 && currentHsn) {
        const hsnMatch = lookupHsnTaxonomy(currentHsn);
        if (hsnMatch && hsnMatch.defaultGstRate != null) {
          currentGst = hsnMatch.defaultGstRate;
        }
      }
      const currentCgst = prodRecord.cgst_rate != null && Number(prodRecord.cgst_rate) > 0 ? Number(prodRecord.cgst_rate) : currentGst / 2;
      const currentSgst = prodRecord.sgst_rate != null && Number(prodRecord.sgst_rate) > 0 ? Number(prodRecord.sgst_rate) : currentGst / 2;
      const currentIgst = prodRecord.igst_rate != null && Number(prodRecord.igst_rate) > 0 ? Number(prodRecord.igst_rate) : currentGst;

      const fullData: Partial<Product> = { 
        ...prodRecord, 
        division_category: detectedCategory,
        division: detectedDivision,
        company_id: detectedCompanyId,
        gst_rate: currentGst,
        cgst_rate: currentCgst,
        sgst_rate: currentSgst,
        igst_rate: currentIgst,
        inventory_quantity: realTotalStock 
      } as unknown as Product;

      setProduct(fullData as unknown as Product);
      setEdit(fullData);

      // Fetch price and valuation history
      const { data: hist } = await supabase
        .from("product_price_history")
        .select(`
          *,
          profile:profiles!changed_by(full_name)
        `)
        .eq("product_id", id)
        .order("changed_at", { ascending: false })
        .limit(20);
      
      setHistory((hist as unknown as HistoryLog[]) || []);

    } catch (err: unknown) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [id, companies]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Master Auto-Detect Functionality
  const runAutoDetectAll = (overrideName?: string) => {
    const targetName = (overrideName || edit.name || "").trim();
    if (!targetName) {
      toast.error("Please enter a product title to auto-detect attributes");
      return;
    }

    const inferredCategory = inferTaxonomyCategory(targetName, categories);
    const inferredDivision = inferTaxonomyDivision(inferredCategory || targetName);
    const inferredSub = inferSubCategory(targetName, inferredCategory);
    const weight = extractWeight(targetName);
    const matchedComp = inferCompanyMatch(targetName, edit.brand, companies);

    setEdit(prev => {
      const updates: Partial<Product> = {
        division_category: inferredCategory,
        division: inferredDivision,
        sub_category: inferredSub || prev.sub_category,
      };

      if (matchedComp && !prev.company_id) {
        updates.company_id = matchedComp.id;
        if (!prev.brand) updates.brand = matchedComp.name;
      }

      if (weight) {
        updates.pack_size_value = weight.value;
        updates.pack_size_unit = weight.unit;
        updates.weight_per_unit_grams = computeWeightPerUnit(weight.value, weight.unit);
        if (weight.unit === "g" && weight.value >= 1000) {
          updates.unit_type = "kg_g";
        }
      }

      // Infer physical packaging format
      const lower = targetName.toLowerCase();
      if (lower.includes("jar") || lower.includes("dabba")) updates.item_pack_type = "jar";
      else if (lower.includes("bottle") || lower.includes("btl")) updates.item_pack_type = "bottle";
      else if (lower.includes("can") || lower.includes("tin")) updates.item_pack_type = "can";
      else if (lower.includes("box") || lower.includes("carton")) updates.item_pack_type = "box";
      else if (lower.includes("bag") || lower.includes("bori") || lower.includes("sack")) updates.item_pack_type = "bag";
      else if (lower.includes("pouch") || lower.includes("packet") || lower.includes("pkt")) updates.item_pack_type = "packet";

      return { ...prev, ...updates };
    });

    toast.success("Classification & Logistics Auto-Detected", {
      description: `Category: ${inferredCategory} • Division: ${inferredDivision} ${matchedComp ? `• Company: ${matchedComp.name}` : ''}`
    });
  };

  const handleNameChange = (name: string) => {
    const weight = extractWeight(name);
    setEdit(prev => {
      const updates: Partial<Product> = { name };
      
      // Auto-detect category & division if new product or currently default
      if (!product?.id || !prev.division_category || prev.division_category === "Spices" || prev.division_category === "Other") {
        const cat = inferTaxonomyCategory(name, categories);
        updates.division_category = cat;
        updates.division = inferTaxonomyDivision(cat || name);
      }

      if (weight) {
        updates.pack_size_value = weight.value;
        updates.pack_size_unit = weight.unit;
        updates.weight_per_unit_grams = computeWeightPerUnit(weight.value, weight.unit);
        updates.case_qty_unit = "kg";
        if (!prev.preferred_sell_unit || prev.preferred_sell_unit === 'packet' || prev.preferred_sell_unit === 'unit') {
          updates.preferred_sell_unit = "kg";
        }
      }

      // Auto-match company if not set
      if (!prev.company_id && companies.length > 0) {
        const comp = inferCompanyMatch(name, prev.brand, companies);
        if (comp) updates.company_id = comp.id;
      }

      return { ...prev, ...updates };
    });
  };

  const handleGstChange = (rateVal: number | string) => {
    const gst = rateVal === "" ? 0 : Number(rateVal);
    const breakdown = computeTaxBreakdown(gst);
    setEdit(prev => ({
      ...prev,
      gst_rate: gst,
      cgst_rate: breakdown.cgst_rate,
      sgst_rate: breakdown.sgst_rate,
      igst_rate: breakdown.igst_rate
    }));
  };

  const handleCgstSgstChange = (cgstVal: number | string, sgstVal: number | string) => {
    const cgst = cgstVal === "" ? 0 : Number(cgstVal);
    const sgst = sgstVal === "" ? 0 : Number(sgstVal);
    const gst = cgst + sgst;
    setEdit(prev => ({
      ...prev,
      gst_rate: gst,
      cgst_rate: cgst,
      sgst_rate: sgst,
      igst_rate: gst
    }));
  };

  const save = async () => {
    if (!edit.name?.trim()) return toast.error("Product name is required");
    
    // Auto-generate SKU if blank
    if (!edit.sku?.trim()) {
      const selectedComp = companies.find(c => c.id === edit.company_id);
      edit.sku = generateSku(edit.name, selectedComp?.short_code, edit.division_category, selectedComp?.name || edit.brand);
    }

    setBusy(true);

    try {
      const normalize = (val: string | null | undefined): "pcs" | "packet" | "case" | "kg" => {
        if (!val) return "pcs";
        const v = val.toLowerCase();
        if (v === "case" || v === "ctn" || v === "carton" || v === "box" || v === "bag") return "case";
        if (v === "packet" || v === "pouch" || v === "sachet" || v === "pkt" || v === "pkg" || v === "pack") return "packet";
        if (v === "kg") return "kg";
        return "pcs";
      };

      const normType = normalize(edit.unit_type);
      if (normType !== 'pcs' && normType !== 'kg') {
        if (Number(edit.units_per_packet || 0) <= 1 && Number(edit.packets_per_case || 0) <= 1) {
          setBusy(false);
          return toast.error("Configuration Required", {
            description: "For packaged products, specify units per packet or packets per case."
          });
        }
      }

      const { data: savedData, error: saveError } = await persistProductToSupabase(edit, id);
      if (saveError) throw saveError;

      if (id === "new") {
        toast.success("Product created successfully");
        if (savedData?.id) {
          navigate(`/products/${savedData.id}`, { replace: true });
        } else {
          navigate("/products", { replace: true });
        }
      } else {
        toast.success("Product updated successfully");
        load();
      }
    } catch (err: unknown) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-[80vh]">
      <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
    </div>
  );

  if (!product) return (
    <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
      <Package className="h-16 w-16 text-slate-200" />
      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Product Not Found</p>
      <Button variant="outline" onClick={() => navigate("/products")}>Return to Catalog</Button>
    </div>
  );

  const inventoryStock = (product as unknown as { inventory_quantity: number }).inventory_quantity || 0;
  const currentCompany = companies.find(c => c.id === edit.company_id);

  // Landed cost tier breakdowns
  const baseCost = Number(edit.cost_price || product.cost_price || (batches[0]?.cost_price) || 0);
  const avgLanded = Number(product.avg_landed_cost || edit.cost_price || (batches[0]?.landed_cost) || baseCost);
  const isDozen = isProductDozenPackaging(edit as Product);
  const upp = isDozen ? 12 : Math.max(1, Number(edit.units_per_packet) || 1);
  const ppc = Math.max(1, Number(edit.packets_per_case) || 1);
  const upc = isDozen
    ? (ppc > 1 ? 12 * ppc : 12)
    : (edit.unit_type === 'pcs' && edit.units_per_case && Number(edit.units_per_case) > 1
      ? Number(edit.units_per_case)
      : (upp * ppc));
  const weightG = Number(edit.weight_per_unit_grams) || 0;
  
  const landedPerPacket = avgLanded * upp;
  const landedPerCase = avgLanded * upc;
  const landedPerKg = weightG > 0 ? avgLanded * (1000 / weightG) : null;

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC]">
      {/* Sticky Top Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")} className="h-10 w-10 rounded-xl hover:bg-slate-50 transition-colors">
            <ArrowLeft className="h-5 w-5 text-slate-400" />
          </Button>
          <div className="h-px w-6 bg-slate-200 hidden xs:block" />
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 truncate max-w-[280px] sm:max-w-md">
                {edit.name || (id === "new" ? "New Product" : "Untitled")}
              </h1>
              {currentCompany && (
                <span 
                  className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md tracking-wider text-white shadow-xs"
                  style={{ backgroundColor: currentCompany.accent_hex || "#4F46E5" }}
                >
                  {currentCompany.short_code || currentCompany.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{edit.sku || "AUTO-SKU"}</span>
              <span className="text-[10px] text-slate-300">•</span>
              <span className="text-[10px] font-semibold text-slate-500">{edit.division_category || "Uncategorized"}</span>
              {edit.is_active ? 
                <Badge className="h-4 px-1.5 text-[8px] bg-emerald-50 text-emerald-600 border-emerald-100 shadow-none">Active</Badge> : 
                <Badge className="h-4 px-1.5 text-[8px] bg-slate-100 text-slate-400 border-none shadow-none">Disabled</Badge>
              }
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            size="sm"
            onClick={() => runAutoDetectAll()}
            className="h-10 px-3.5 rounded-xl border-amber-200 bg-amber-50/60 hover:bg-amber-100 text-amber-900 font-bold text-xs gap-1.5 hidden sm:flex shadow-2xs"
            title="Auto-detect Category, Division, Packaging and Company from title"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span>Auto-Detect</span>
          </Button>
          
          <Button 
            onClick={save}
            disabled={busy}
            className="h-10 px-6 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-widest hover:bg-slate-800 shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
          >
            {busy ? <Loader2 className="animate-spin h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5 text-emerald-400" />}
            Save Product
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-8 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Main Configuration */}
          <div className="lg:col-span-8 space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-6">
                <Button 
                  variant={activeTab === "details" ? "default" : "outline"} 
                  onClick={() => setActiveTab("details")}
                  className={cn("h-10 rounded-xl font-bold text-xs uppercase tracking-widest gap-2", activeTab !== "details" && "border-slate-200 text-slate-500")}
                >
                  <Package className="h-3.5 w-3.5" />
                  Product Master
                </Button>
                <Button 
                  variant={activeTab === "valuation" ? "default" : "outline"} 
                  onClick={() => setActiveTab("valuation")}
                  className={cn("h-10 rounded-xl font-bold text-xs uppercase tracking-widest gap-2", activeTab !== "valuation" && "border-slate-200 text-slate-500")}
                >
                  <PhilippinePeso className="h-3.5 w-3.5" />
                  Valuation & Freight Costs
                </Button>
              </div>

              <TabsContent value="details" className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
                {/* 1. Core Identity & Company */}
                <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 bg-[#FCFCFD] flex items-center justify-between">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none">Core Identity & Company</p>
                     <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => runAutoDetectAll()}
                        className="h-7 px-2 text-[11px] text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded-lg gap-1 font-bold"
                     >
                       <Sparkles className="h-3 w-3 text-amber-500" />
                       Auto-Detect All
                     </Button>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Trade Title</Label>
                        <span className="text-[10px] text-slate-400 font-medium">Standard trading name with weight suffix</span>
                      </div>
                      <Input 
                        className="h-14 rounded-2xl border-slate-200 bg-white font-bold text-lg px-6 shadow-none focus:border-brand-primary/40 focus:ring-4 focus:ring-brand-primary/5 transition-all" 
                        value={edit.name ?? ""} 
                        placeholder="e.g. Bharat Turmeric Powder 500g Jar"
                        onChange={e => handleNameChange(e.target.value)} 
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* FMCG Company Selector */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            FMCG Company
                          </Label>
                          {currentCompany && (
                            <span className="text-[9px] font-bold uppercase text-slate-400">Code: {currentCompany.short_code}</span>
                          )}
                        </div>
                        <Select 
                          value={edit.company_id || "none"} 
                          onValueChange={v => {
                            const cid = v === "none" ? null : v;
                            const comp = companies.find(c => c.id === cid);
                            setEdit(prev => ({ 
                              ...prev, 
                              company_id: cid,
                              brand: comp ? comp.name : prev.brand 
                            }));
                          }}
                        >
                          <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-6 font-bold shadow-sm">
                            <SelectValue placeholder="Select FMCG Company..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-slate-200 shadow-xl max-h-72">
                            <SelectItem value="none" className="font-medium text-slate-400">No Company Linked</SelectItem>
                            {companies.map(c => (
                              <SelectItem key={c.id} value={c.id} className="font-bold">
                                <div className="flex items-center gap-2">
                                  <span 
                                    className="w-2.5 h-2.5 rounded-full inline-block" 
                                    style={{ backgroundColor: c.accent_hex || "#4F46E5" }} 
                                  />
                                  <span>{c.name}</span>
                                  {c.short_code && (
                                    <span className="text-[10px] text-slate-400 font-mono">({c.short_code})</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Parent Brand */}
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Brand / Supplier</Label>
                        <Input 
                          className="h-14 rounded-2xl border-slate-200 bg-white font-bold px-6 shadow-sm" 
                          value={edit.brand ?? ""} 
                          placeholder="e.g. Bharat Masala" 
                          onChange={e => setEdit({...edit, brand: e.target.value})} 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">SKU Identifier</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] text-brand-primary font-bold gap-1"
                            onClick={() => {
                              if (!edit.name) return toast.error("Enter product name first");
                              const newSku = generateSku(edit.name, currentCompany?.short_code, edit.division_category, currentCompany?.name || edit.brand);
                              setEdit(prev => ({ ...prev, sku: newSku }));
                              toast.success(`Generated SKU: ${newSku}`);
                            }}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Regenerate
                          </Button>
                        </div>
                        <Input 
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50/50 font-extrabold uppercase text-slate-900 shadow-sm" 
                          value={edit.sku ?? ""} 
                          placeholder="SKU-CODE"
                          onChange={(e) => setEdit(prev => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">HSN Classification</Label>
                        <Input 
                          className="h-14 rounded-2xl border-slate-200 bg-white font-mono font-bold px-6 shadow-sm" 
                          value={edit.hsn ?? ""} 
                          placeholder="e.g. 09109100 / 33074100" 
                          onChange={e => {
                            const val = e.target.value;
                            setEdit(prev => {
                              const updates: Partial<Product> = { hsn: val };
                              const clean = val.trim();
                              if (clean.length >= 2) {
                                const hsnMatch = lookupHsnTaxonomy(clean);
                                if (hsnMatch) {
                                  const isDefaultOrSpecial = !prev.division_category || 
                                    prev.division_category === "Spices" || 
                                    prev.division_category === "Other" || 
                                    prev.division_category === "SPECIAL PRODUCTS" || 
                                    prev.division_category === "BASIC SPICES" || 
                                    prev.division_category === "BLENDED SPICES";

                                  if (isDefaultOrSpecial && hsnMatch.category) {
                                    updates.division_category = hsnMatch.category;
                                    updates.division = hsnMatch.division;
                                    if (hsnMatch.subCategory && !prev.sub_category) {
                                      updates.sub_category = hsnMatch.subCategory;
                                    }
                                  }
                                  if (prev.gst_rate === undefined || prev.gst_rate === 0 || prev.gst_rate === null) {
                                    const tax = computeTaxBreakdown(hsnMatch.defaultGstRate);
                                    updates.gst_rate = tax.gst_rate;
                                    updates.cgst_rate = tax.cgst_rate;
                                    updates.sgst_rate = tax.sgst_rate;
                                    updates.igst_rate = tax.igst_rate;
                                  }
                                }
                              }
                              return { ...prev, ...updates };
                            });
                          }} 
                        />
                        {edit.hsn && lookupHsnTaxonomy(edit.hsn) && (
                          <div className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-1.5 mt-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>HSN {edit.hsn}: {lookupHsnTaxonomy(edit.hsn)?.category} ({lookupHsnTaxonomy(edit.hsn)?.subCategory}) • GST {lookupHsnTaxonomy(edit.hsn)?.defaultGstRate}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* 2. Commercial Pricing & Margins */}
                <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 bg-[#FCFCFD] flex items-center justify-between">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none">Commercial Pricing & Valuation</p>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">INR (₹) Rates</span>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Retail MRP (₹)</Label>
                        <Input 
                          type="number"
                          step="any"
                          className="h-14 rounded-2xl border-slate-200 bg-white font-black text-lg px-6 shadow-sm text-slate-900" 
                          placeholder="0.00" 
                          value={edit.mrp !== undefined && edit.mrp !== null ? edit.mrp : ""} 
                          onChange={e => setEdit({...edit, mrp: e.target.value === "" ? 0 : Number(e.target.value)})} 
                        />
                        <p className="text-[10px] text-slate-400 font-medium ml-1">Maximum Retail Price printed on pack</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Standard Selling Price (₹)</Label>
                        <Input 
                          type="number"
                          step="any"
                          className="h-14 rounded-2xl border-slate-200 bg-white font-bold text-lg px-6 shadow-sm text-slate-900" 
                          placeholder="0.00" 
                          value={edit.selling_price !== undefined && edit.selling_price !== null ? edit.selling_price : ""} 
                          onChange={e => setEdit({...edit, selling_price: e.target.value === "" ? 0 : Number(e.target.value)})} 
                        />
                        <p className="text-[10px] text-slate-400 font-medium ml-1">Base trade selling price</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Purchase / Cost Price (₹)</Label>
                        <Input 
                          type="number"
                          step="any"
                          className="h-14 rounded-2xl border-slate-200 bg-white font-bold text-lg px-6 shadow-sm text-slate-900" 
                          placeholder="0.00" 
                          value={edit.cost_price !== undefined && edit.cost_price !== null ? edit.cost_price : ""} 
                          onChange={e => setEdit({...edit, cost_price: e.target.value === "" ? 0 : Number(e.target.value)})} 
                        />
                        <p className="text-[10px] text-slate-400 font-medium ml-1">Base purchase unit landed cost</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 3. Taxonomy: Category & Business Division */}
                <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 bg-[#FCFCFD] flex items-center justify-between">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none">Taxonomy & Classification</p>
                     <span className="text-[10px] font-bold text-slate-400 uppercase">Auto-Inferrable</span>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Product Category */}
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-slate-400" />
                          Product Category
                        </Label>
                        <Select 
                          value={edit.division_category || "Spices"} 
                          onValueChange={v => {
                            setEdit(prev => ({
                              ...prev, 
                              division_category: v,
                              division: prev.division || inferTaxonomyDivision(v)
                            }));
                          }}
                        >
                          <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-6 font-bold shadow-sm">
                            <SelectValue placeholder="Select category..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-slate-200 shadow-xl max-h-72">
                            {categories.map(c => (
                              <SelectItem key={c} value={c} className="font-bold">{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Business Division */}
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                          <Boxes className="h-3.5 w-3.5 text-slate-400" />
                          Business Division
                        </Label>
                        <Select 
                          value={edit.division || "Spices & Seasonings"} 
                          onValueChange={v => setEdit({...edit, division: v})}
                        >
                          <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-6 font-bold shadow-sm">
                            <SelectValue placeholder="Select division..." />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-slate-200 shadow-xl">
                            {FMCG_DIVISIONS.map(d => (
                              <SelectItem key={d} value={d} className="font-bold">{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Sub-Category</Label>
                        <Input 
                          className="h-14 rounded-2xl border-slate-200 bg-white font-bold px-6 shadow-sm" 
                          value={edit.sub_category ?? ""} 
                          placeholder="e.g. Turmeric (Haldi)" 
                          onChange={e => setEdit({...edit, sub_category: e.target.value})} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Min Stock Threshold</Label>
                        <Input 
                          type="number"
                          className="h-14 rounded-2xl border-slate-200 bg-white font-bold px-6 shadow-sm" 
                          placeholder="50"
                          value={edit.min_stock !== undefined && edit.min_stock !== null ? edit.min_stock : ""} 
                          onChange={e => setEdit({...edit, min_stock: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value)})} 
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* 3. Taxation Rates (Auto-calculated & Linked) */}
                <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 bg-[#FCFCFD] flex items-center justify-between">
                     <div className="flex items-center gap-2">
                       <Percent className="h-4 w-4 text-slate-400" />
                       <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none">Tax Rates & GST Breakdown</p>
                     </div>
                     <div className="flex items-center gap-1">
                       {[0, 5, 12, 18, 28].map(rate => (
                         <button
                           key={rate}
                           type="button"
                           onClick={() => handleGstChange(rate)}
                           className={cn(
                             "px-2.5 py-1 text-[10px] font-black rounded-lg transition-all",
                             edit.gst_rate === rate 
                               ? "bg-slate-900 text-white shadow-2xs" 
                               : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                           )}
                         >
                           {rate}%
                         </button>
                       ))}
                     </div>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Total GST (%)</Label>
                        <Input 
                          type="number"
                          step="any"
                          className="h-14 rounded-2xl border-slate-200 bg-white font-black text-slate-900 px-6 shadow-sm text-lg" 
                          placeholder="5"
                          value={edit.gst_rate !== undefined && edit.gst_rate !== null ? edit.gst_rate : ""} 
                          onChange={e => handleGstChange(e.target.value)} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">CGST (%)</Label>
                        <Input 
                          type="number"
                          step="any"
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50 font-bold px-6 shadow-sm" 
                          placeholder="2.5"
                          value={edit.cgst_rate !== undefined && edit.cgst_rate !== null ? edit.cgst_rate : ""} 
                          onChange={e => handleCgstSgstChange(e.target.value, edit.sgst_rate || 0)} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">SGST (%)</Label>
                        <Input 
                          type="number"
                          step="any"
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50 font-bold px-6 shadow-sm" 
                          placeholder="2.5"
                          value={edit.sgst_rate !== undefined && edit.sgst_rate !== null ? edit.sgst_rate : ""} 
                          onChange={e => handleCgstSgstChange(edit.cgst_rate || 0, e.target.value)} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">IGST (%)</Label>
                        <Input 
                          type="number"
                          step="any"
                          className="h-14 rounded-2xl border-slate-200 bg-slate-50 font-bold px-6 shadow-sm" 
                          placeholder="5"
                          value={edit.igst_rate !== undefined && edit.igst_rate !== null ? edit.igst_rate : ""} 
                          onChange={e => setEdit({...edit, igst_rate: Number(e.target.value) || 0})} 
                        />
                      </div>
                    </div>
                  </div>
                </section>

                {/* 4. Logistics & Packaging Multipliers */}
                <section className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-slate-100 bg-[#FEFCE8]/40 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <Truck className="h-4 w-4 text-yellow-600" />
                       <p className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-800/80 leading-none">Logistics & Packaging Architecture</p>
                     </div>
                     <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100/70 px-3 py-1 rounded-full">
                       1 Case = {ppc} Pkt ({upc} Units)
                     </span>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div className="space-y-6">
                         <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-100 space-y-4">
                            <Label className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Packaging Hierarchy Multipliers</Label>
                            <div className="grid grid-cols-2 gap-4">
                               <div className="space-y-2">
                                  <span className="text-[9px] font-bold text-amber-700 uppercase ml-1">Units / Packet</span>
                                  <Input 
                                    type="number" 
                                    min="1"
                                    placeholder="1"
                                    className="h-12 border-amber-200/70 bg-white font-black text-lg rounded-xl px-4 shadow-sm text-slate-900" 
                                    value={edit.units_per_packet !== undefined && edit.units_per_packet !== null ? edit.units_per_packet : ""} 
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEdit(prev => ({
                                        ...prev, 
                                        units_per_packet: val === "" ? ("" as unknown as number) : Number(val)
                                      }));
                                    }} 
                                  />
                                  <p className="text-[9px] text-amber-800/60 font-medium ml-1">Units per inner pack</p>
                               </div>
                               <div className="space-y-2">
                                  <span className="text-[9px] font-bold text-amber-700 uppercase ml-1">Pkts / Case</span>
                                  <Input 
                                    type="number" 
                                    min="1"
                                    placeholder="1"
                                    className="h-12 border-amber-200/70 bg-white font-black text-lg rounded-xl px-4 shadow-sm text-slate-900" 
                                    value={edit.packets_per_case !== undefined && edit.packets_per_case !== null ? edit.packets_per_case : ""} 
                                    onChange={e => {
                                      const val = e.target.value;
                                      setEdit(prev => ({
                                        ...prev, 
                                        packets_per_case: val === "" ? ("" as unknown as number) : Number(val)
                                      }));
                                    }} 
                                  />
                                  <p className="text-[9px] text-amber-800/60 font-medium ml-1">Packets per shipper</p>
                               </div>
                            </div>
                         </div>

                         <div className="space-y-2">
                            <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Physical Packaging Format</Label>
                            <Select 
                              value={edit.item_pack_type || "packet"} 
                              onValueChange={v => setEdit({...edit, item_pack_type: v})}
                            >
                              <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-6 font-bold shadow-sm">
                                <SelectValue placeholder="Select pack type..." />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-slate-200 shadow-xl bg-white">
                                <SelectItem value="packet" className="font-bold">Packet / Pouch (Pkt)</SelectItem>
                                <SelectItem value="jar" className="font-bold">Jar / Container (Jar)</SelectItem>
                                <SelectItem value="bottle" className="font-bold">Bottle / Flask (Btl)</SelectItem>
                                <SelectItem value="can" className="font-bold">Can / Tin (Can)</SelectItem>
                                <SelectItem value="box" className="font-bold">Box / Carton (Box)</SelectItem>
                                <SelectItem value="strip" className="font-bold">Strip / Blister (Strip)</SelectItem>
                                <SelectItem value="bag" className="font-bold">Bag / Sack (Bag)</SelectItem>
                                <SelectItem value="unit" className="font-bold">Discrete Unit (Pcs)</SelectItem>
                              </SelectContent>
                            </Select>
                         </div>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-2">
                          <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Base unit of measure</Label>
                          <Select value={edit.unit_type || "pcs"} onValueChange={v => setEdit({...edit, unit_type: v})}>
                            <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-6 font-bold shadow-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-200 shadow-xl bg-white">
                              <SelectItem value="pcs" className="font-bold">Pieces / General</SelectItem>
                              <SelectItem value="kg" className="font-bold">Weighted (Kg/g)</SelectItem>
                              <SelectItem value="ltr" className="font-bold">Liquid (L/ml)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                           <Label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Pack Size & Unit</Label>
                           <div className="grid grid-cols-2 gap-3">
                             <Input 
                               type="number"
                               step="any"
                               placeholder="e.g. 500"
                               className="h-14 rounded-2xl border-slate-200 bg-white px-6 font-bold shadow-sm text-slate-900"
                               value={edit.pack_size_value !== undefined && edit.pack_size_value !== null ? edit.pack_size_value : ""}
                               onChange={e => {
                                 const val = e.target.value;
                                 const num = val === "" ? null : Number(val);
                                 setEdit(prev => ({
                                   ...prev, 
                                   pack_size_value: num,
                                   weight_per_unit_grams: computeWeightPerUnit(num, prev.pack_size_unit || "g")
                                 }));
                               }}
                             />
                             <Select 
                               value={edit.pack_size_unit || "g"} 
                               onValueChange={v => setEdit(prev => ({
                                 ...prev, 
                                 pack_size_unit: v, 
                                 display_weight_unit: v as Product["display_weight_unit"],
                                 weight_per_unit_grams: computeWeightPerUnit(prev.pack_size_value ?? null, v)
                               }))}
                             >
                               <SelectTrigger className="h-14 rounded-2xl border-slate-200 bg-white px-6 font-bold shadow-sm">
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent className="rounded-2xl border-slate-200 shadow-xl bg-white">
                                 <SelectItem value="g" className="font-bold">Grams (g)</SelectItem>
                                 <SelectItem value="kg" className="font-bold">Kilograms (kg)</SelectItem>
                                 <SelectItem value="ml" className="font-bold">Milliliters (ml)</SelectItem>
                                 <SelectItem value="ltr" className="font-bold">Liters (L)</SelectItem>
                                 <SelectItem value="pcs" className="font-bold">Pieces (pcs)</SelectItem>
                               </SelectContent>
                             </Select>
                           </div>
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-tight">Active Status</span>
                            <span className="text-xs font-bold text-slate-600 mt-1">Visible in catalogs and order entry</span>
                          </div>
                          <Switch 
                            checked={edit.is_active ?? true} 
                            onCheckedChange={checked => setEdit({...edit, is_active: checked})} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </TabsContent>

              {/* TAB 2: Valuation, Freight & Landed Cost Breakdown */}
              <TabsContent value="valuation" className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                {/* Landed Cost Breakdown Matrix */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Invoiced Unit Cost</span>
                    <p className="text-2xl font-black text-slate-900">{fmtINR(baseCost)}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Base purchase invoice price per unit</p>
                  </div>
                  <div className="p-6 bg-white rounded-3xl border border-slate-200 shadow-xs space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">Allocated Inbound Freight</span>
                    <p className="text-2xl font-black text-amber-700">{fmtINR(Math.max(0, avgLanded - baseCost))}</p>
                    <p className="text-[10px] text-amber-800/60 font-medium">Freight & handling allocated per unit</p>
                  </div>
                  <div className="p-6 bg-slate-900 rounded-3xl text-white shadow-xs space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Average Landed Cost (WAC)</span>
                    <p className="text-2xl font-black text-white">{fmtINR(avgLanded)}</p>
                    <p className="text-[10px] text-slate-400 font-medium">True landed cost used in margin computation</p>
                  </div>
                </div>

                {/* Packaging Tier Landed Rates */}
                <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-[#FCFCFD] flex items-center justify-between">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none">Landed Cost Across Packaging Tiers</p>
                     <Badge className="bg-emerald-50 text-emerald-700 border-none font-bold text-[10px]">Freight Factored</Badge>
                  </div>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                        <span className="text-[9px] font-black uppercase text-slate-400">Per Discrete Unit (Pcs)</span>
                        <p className="text-lg font-black text-slate-900">{fmtINR(avgLanded)}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                        <span className="text-[9px] font-black uppercase text-slate-400">
                          {isDozen ? "Per Dozen (12 Pcs)" : `Per Inner Pack (${upp} Units)`}
                        </span>
                        <p className="text-lg font-black text-slate-900">{fmtINR(landedPerPacket)}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                        <span className="text-[9px] font-black uppercase text-slate-400">
                          {isDozen && upc === 12 ? "Per Outer (12 Pcs)" : `Per Shipper Case (${upc} Units)`}
                        </span>
                        <p className="text-lg font-black text-slate-900">{fmtINR(landedPerCase)}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                        <span className="text-[9px] font-black uppercase text-slate-400">Per Kilogram (Kg)</span>
                        <p className="text-lg font-black text-slate-900">{landedPerKg ? fmtINR(landedPerKg) : "N/A"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Inventory Batches with Freight Allocation */}
                <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-[#FCFCFD] flex items-center justify-between">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none">Inbound Receiving Batches & Landed Costs</p>
                     <span className="text-[10px] font-bold text-slate-400">{batches.length} Received Batches</span>
                  </div>
                  <CardContent className="p-0">
                    {batches.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 font-medium text-xs">
                        No receiving batches recorded for this product yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              <TableHead className="pl-6">Batch No</TableHead>
                              <TableHead>Warehouse</TableHead>
                              <TableHead>Received</TableHead>
                              <TableHead className="text-right">Remaining</TableHead>
                              <TableHead className="text-right">Invoiced Cost</TableHead>
                              <TableHead className="text-right pr-6">Landed Cost</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {batches.map(b => (
                              <TableRow key={b.id} className="text-xs">
                                <TableCell className="font-mono font-bold text-slate-800 pl-6">
                                  {b.batch_number || "NO-BATCH"}
                                </TableCell>
                                <TableCell className="font-medium text-slate-600">
                                  {b.warehouse?.name || "Primary Central"}
                                </TableCell>
                                <TableCell className="text-slate-500 font-medium">
                                  {fmtDate(b.received_at)}
                                </TableCell>
                                <TableCell className="text-right font-black text-slate-900">
                                  {b.remaining_qty}
                                </TableCell>
                                <TableCell className="text-right text-slate-600 font-medium">
                                  {fmtINR(b.cost_price || 0)}
                                </TableCell>
                                <TableCell className="text-right pr-6 font-black text-emerald-600">
                                  {fmtINR(b.landed_cost || b.cost_price || 0)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Valuation Trajectory Chart */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                       <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target vs Realized Margin</p>
                         <h3 className="text-base font-black text-slate-900 mt-0.5">Pricing Profitability</h3>
                       </div>
                    </div>
                    <CardContent className="p-6 space-y-6">
                       {(() => {
                          const wac = avgLanded || 0;
                          const targetMgn = categoryMargins[edit.division_category || ""] || 15;
                          const suggested = wac > 0 ? wac / (1 - (targetMgn / 100)) : 0;
                          const currentPrice = edit.mrp || 0;
                          const actualMargin = currentPrice > 0 ? ((currentPrice - wac) / currentPrice) * 100 : 0;
                          
                          return (
                            <div className="space-y-4">
                              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                                 <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Suggested MRP @ {targetMgn}% Margin</p>
                                 <div className="flex items-center justify-between">
                                    <span className="text-xl font-black text-slate-900">{fmtINR(suggested)}</span>
                                    {suggested > currentPrice && currentPrice > 0 && (
                                      <div className="flex items-center gap-1.5 text-rose-500">
                                        <TrendingUp size={14} className="animate-pulse" />
                                        <span className="text-[10px] font-black uppercase">+Adjust Required</span>
                                      </div>
                                    )}
                                 </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-2xl border border-slate-100">
                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Realized Margin</p>
                                   <p className={cn("text-lg font-black mt-1", actualMargin >= targetMgn ? "text-emerald-600" : "text-rose-600")}>
                                     {actualMargin.toFixed(1)}%
                                   </p>
                                </div>
                                <div className="p-4 rounded-2xl border border-slate-100">
                                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Profit per Unit</p>
                                   <p className="text-lg font-black text-slate-900 mt-1">
                                     {fmtINR(Math.max(0, currentPrice - wac))}
                                   </p>
                                </div>
                              </div>
                            </div>
                          );
                       })()}
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                       <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valuation Trend</p>
                         <h3 className="text-base font-black text-slate-900 mt-0.5">Cost Trajectory</h3>
                       </div>
                       <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                         <BarChart3 size={18} />
                       </div>
                    </div>
                    <CardContent className="p-6 flex-1 flex flex-col">
                       {wacHistoryData.length > 1 ? (
                         <div className="h-[200px] w-full mt-2">
                            <RechartsContainer width="100%" height="100%">
                              <AreaChart data={wacHistoryData}>
                                <defs>
                                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ff6b00" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#ff6b00" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis 
                                  dataKey="date" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 700}} 
                                  dy={10}
                                />
                                <YAxis 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{fontSize: 10, fill: '#94a3b8', fontWeight: 700}}
                                  tickFormatter={(v) => `₹${v}`}
                                />
                                <Tooltip 
                                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px', fontWeight: 'bold'}}
                                  formatter={(v: number) => [fmtINR(v), 'Cost']}
                                />
                                <Area 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke="#ff6b00" 
                                  strokeWidth={3} 
                                  fillOpacity={1} 
                                  fill="url(#colorValue)" 
                                />
                              </AreaChart>
                            </RechartsContainer>
                         </div>
                       ) : (
                         <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-40">
                           <Activity className="h-10 w-10 text-slate-200 mb-3" />
                           <p className="text-xs font-black uppercase tracking-widest text-slate-400">Not enough history</p>
                           <p className="text-[10px] font-bold text-slate-300 mt-1">Trends will appear as additional invoices are received.</p>
                         </div>
                       )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* RIGHT COLUMN: Stats & Secondary Actions */}
          <div className="lg:col-span-4 space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Real-time Inventory Card */}
            <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-xl shadow-slate-200/40">
              <div className="p-6 bg-slate-900 text-white">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Grid size={16} className="text-brand-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Global Stock</span>
                  </div>
                  <Badge className="bg-white/10 text-brand-primary border-none text-[10px] font-black">LIVE</Badge>
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                   <h3 className="text-4xl font-black tabular-nums">{inventoryStock.toLocaleString()}</h3>
                   <span className="text-xs font-bold opacity-40 uppercase tracking-widest">{edit.unit_type === 'pcs' ? 'units' : (edit.unit_type || 'units')}</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                   <div 
                     style={{ width: `${Math.min(100, (inventoryStock / (edit.min_stock || 100)) * 100)}%` }}
                     className={cn(
                       "h-full rounded-full transition-all duration-1000",
                       inventoryStock <= (edit.min_stock || 0) ? "bg-rose-500" : "bg-emerald-500"
                     )}
                   />
                </div>
                <div className="flex items-center justify-between mt-3">
                   <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Min trigger: {edit.min_stock || 0}</span>
                   {inventoryStock <= (edit.min_stock || 0) && (
                     <span className="text-[10px] font-bold text-rose-400 animate-pulse">CRITICAL LOW</span>
                   )}
                </div>
              </div>
            </Card>

            {/* Pricing & Valuation Benchmark Card */}
            <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm bg-white">
               <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                 <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Pricing Benchmarks</p>
                 <Badge className="bg-slate-100 text-slate-600 border-none font-bold text-[10px]">{edit.division_category || "General"}</Badge>
               </div>
               <div className="p-6 space-y-6">
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Retail MRP</Label>
                     <p className="text-xl font-black text-slate-900 mt-1">{fmtINR(edit.mrp || 0)}</p>
                   </div>
                   <div>
                     <Label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Avg Landed Cost</Label>
                     <p className="text-xl font-black text-emerald-600 mt-1">{fmtINR(avgLanded)}</p>
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">GST Rate</span>
                      <p className="text-sm font-black text-slate-900">{edit.gst_rate ?? 0}%</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">CGST / SGST</span>
                      <p className="text-sm font-black text-slate-600">{edit.cgst_rate ?? 0}% / {edit.sgst_rate ?? 0}%</p>
                    </div>
                 </div>

                 <Button 
                    variant="outline" 
                    className="w-full h-12 rounded-xl border-slate-100 font-bold text-xs gap-2 text-slate-600 hover:bg-slate-50 hover:text-brand-primary transition-all"
                    onClick={() => navigate('/products/price-tiers')}
                  >
                   <Settings2 size={16} />
                   Configure Tier Discounts
                 </Button>
               </div>
            </Card>

            {/* Change History Card */}
            <Card className="rounded-3xl border-slate-200 overflow-hidden shadow-sm bg-white">
               <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                 <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">Activity Log</p>
                 <History size={14} className="text-slate-300" />
               </div>
               <div className="p-6 max-h-[300px] overflow-y-auto no-scrollbar">
                  {history.length === 0 ? (
                    <div className="text-center py-8">
                       <p className="text-[10px] font-bold text-slate-300 uppercase italic">No recent activity</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                       {history.map((h, i) => (
                         <div key={h.id} className="relative pl-6 pb-2 last:pb-0">
                            {i !== history.length - 1 && <div className="absolute left-[3px] top-4 bottom-0 w-[2px] bg-slate-100" />}
                            <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-brand-primary ring-4 ring-white" />
                            <div className="flex flex-col gap-1">
                               <p className="text-[11px] font-bold text-slate-800 leading-tight">
                                  {h.field_changed.replace('_', ' ')} <span className="text-slate-400 font-normal">updated to</span> {String(h.new_value)}
                                </p>
                               <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-medium text-slate-400 uppercase">{fmtDate(h.changed_at)}</span>
                                  <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{h.profile?.full_name?.split(' ')[0] || 'SYSTEM'}</span>
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  )}
               </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
