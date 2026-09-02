import * as React from "react";
import { type Product, type ProductAlias } from "@/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  Check, 
  History, 
  Plus, 
  Trash2, 
  Tag, 
  Sparkles, 
  Building2, 
  Hash, 
  Layers, 
  IndianRupee, 
  Percent, 
  Bell, 
  Package, 
  Box, 
  ShieldAlert, 
  Boxes, 
  FolderKanban, 
  CheckCircle2, 
  CircleDollarSign,
  Barcode
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { useCompanies } from "@/hooks/useCompanies";
import { sanitizeProductForDb, persistProductToSupabase } from "@/lib/packaging";
import { generateSku } from "@/lib/skuGenerator";
import { deleteProductAndStock } from "@/lib/productDeletion";
import { useQueryClient } from "@tanstack/react-query";
import { 
  DEFAULT_CATEGORY_NAMES, 
  PRODUCT_TAXONOMY, 
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProductDrawerProps {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

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

export const ProductDrawer = ({ productId, open, onOpenChange, onSaved }: ProductDrawerProps) => {
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [edit, setEdit] = React.useState<Partial<Product>>({});
  const [original, setOriginal] = React.useState<Product | null>(null);
  const [divisions, setDivisions] = React.useState<string[]>(DEFAULT_CATEGORY_NAMES);
  const [isAddingCustomCategory, setIsAddingCustomCategory] = React.useState(false);
  const [customCategory, setCustomCategory] = React.useState("");
  const [stockStats, setStockStats] = React.useState({ global: 0, min: 0, batches: 0 });
  const [initialStock, setInitialStock] = React.useState<number | "">("");

  // Aliases and external codes
  const [aliases, setAliases] = React.useState<ProductAlias[]>([]);
  const [isAddingAlias, setIsAddingAlias] = React.useState(false);
  const [newSupplierName, setNewSupplierName] = React.useState("");
  const [newExternalCode, setNewExternalCode] = React.useState("");
  const [newCodeType, setNewCodeType] = React.useState("basepack");
  const [newHsn, setNewHsn] = React.useState("");
  const [newCompanyId, setNewCompanyId] = React.useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const { data: companies } = useCompanies();
  const queryClient = useQueryClient();

  const invalidateAllProductCaches = () => {
    queryClient.invalidateQueries({ queryKey: ["products-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["stock-movement"] });
    queryClient.invalidateQueries({ queryKey: ["v_stock_ledger_details"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["companies"] });
  };

  const loadAliases = React.useCallback(async (pId: string) => {
    try {
      const { data, error } = await supabase
        .from("grn_product_aliases")
        .select("*, company:company_id(*)")
        .eq("product_id", pId)
        .order("use_count", { ascending: false });

      if (!error && data) {
        setAliases(data as unknown as ProductAlias[]);
      }
    } catch (err) {
      console.warn("Could not load aliases:", err);
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setInitialStock("");
    setAliases([]);
    setIsAddingAlias(false);
    setIsAddingCustomCategory(false);
    setCustomCategory("");
    try {
      // Seed taxonomy categories + merge existing database categories
      const { data: divData } = await supabase.from("products").select("division_category");
      const dbDivs = (divData?.map(d => normalizeDivisionCategory(d.division_category)).filter(Boolean) as string[]) || [];
      const mergedDivs = Array.from(new Set([...DEFAULT_CATEGORY_NAMES, ...dbDivs]))
        .filter(c => c !== "SPECIAL PRODUCTS" && c !== "BASIC SPICES" && c !== "BLENDED SPICES")
        .sort();
      setDivisions(mergedDivs);

      if (productId === "new" || !productId || productId.startsWith("clone:")) {
        const sourceId = productId?.startsWith("clone:") ? productId.split(":")[1] : null;
        
        let initialData: Partial<Product> = {
          name: "",
          sku: "",
          division_category: "Spices",
          mrp: 0,
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
          brand: "General",
          min_stock: 50,
        };

        if (sourceId) {
          const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", sourceId)
            .single();
          
          if (data && !error) {
            const { id: _id, created_at: _ca, sku: _sku, ...rest } = data;
            initialData = { 
              ...rest, 
              name: `${data.name} (Copy)`,
              sku: `${data.sku}-COPY`
            } as Partial<Product>;
          }
        }
        
        setEdit(initialData);
        setStockStats({ global: 0, min: initialData.min_stock || 50, batches: 0 });
      } else {
        const { data, error } = await supabase
          .from("v_product_stock")
          .select("*")
          .eq("id", productId)
          .single();
        
        if (error) throw error;
        
        const { data: batchData } = await supabase
          .from("inventory_batches")
          .select("id, remaining_qty")
          .eq("product_id", productId)
          .gt("remaining_qty", 0);

        const globalStock = batchData?.reduce((sum, b) => sum + (Number(b.remaining_qty) || 0), 0) || 0;
        
        const prodRecord = data as Product;
        const currentHsn = prodRecord.hsn ? String(prodRecord.hsn).trim() : null;
        let normCat = prodRecord.division_category;
        if (!normCat || normCat === "SPECIAL PRODUCTS" || normCat === "Other" || normCat === "BASIC SPICES" || normCat === "BLENDED SPICES" || (normCat === "Spices" && Boolean(currentHsn && !currentHsn.startsWith("09")))) {
          normCat = inferTaxonomyCategory(prodRecord.name, mergedDivs, currentHsn);
        } else {
          normCat = normalizeDivisionCategory(normCat, prodRecord.name, currentHsn);
        }

        let currentGst = Number(prodRecord.gst_rate) || 0;
        if (currentGst === 0 && currentHsn) {
          const hsnMatch = lookupHsnTaxonomy(currentHsn);
          if (hsnMatch && hsnMatch.defaultGstRate != null) {
            currentGst = hsnMatch.defaultGstRate;
          }
        }
        const taxBreakdown = computeTaxBreakdown(currentGst);
        const normProduct: Product = {
          ...prodRecord,
          division_category: normCat,
          division: inferTaxonomyDivision(normCat || prodRecord.name),
          gst_rate: currentGst,
          cgst_rate: prodRecord.cgst_rate != null && Number(prodRecord.cgst_rate) > 0 ? Number(prodRecord.cgst_rate) : taxBreakdown.cgst_rate,
          sgst_rate: prodRecord.sgst_rate != null && Number(prodRecord.sgst_rate) > 0 ? Number(prodRecord.sgst_rate) : taxBreakdown.sgst_rate,
          igst_rate: prodRecord.igst_rate != null && Number(prodRecord.igst_rate) > 0 ? Number(prodRecord.igst_rate) : taxBreakdown.igst_rate,
        };

        setEdit(normProduct);
        setOriginal(normProduct);
        setStockStats({ 
          global: globalStock, 
          min: data.min_stock || 0, 
          batches: batchData?.length || 0 
        });

        // Load aliases for this product
        loadAliases(productId);
      }
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [productId, loadAliases]);

  React.useEffect(() => {
    if (open) {
      load();
    } else {
      setEdit({});
      setOriginal(null);
    }
  }, [open, load]);

  const handleHsnChange = (hsnValue: string) => {
    const clean = hsnValue.trim();
    setEdit(prev => {
      const updates: Partial<Product> = { hsn: hsnValue };
      if (clean.length >= 2) {
        const hsnMatch = lookupHsnTaxonomy(clean);
        if (hsnMatch) {
          // If category is default/unset or legacy special, auto update to HSN category
          const isDefaultCat = !prev.division_category || 
            prev.division_category === "Spices" || 
            prev.division_category === "Other" ||
            prev.division_category === "SPECIAL PRODUCTS" ||
            prev.division_category === "BASIC SPICES" ||
            prev.division_category === "BLENDED SPICES";

          if (isDefaultCat && hsnMatch.category) {
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
  };

  const handleNameChange = (name: string) => {
    const weight = extractWeight(name);
    const inferredCategory = inferTaxonomyCategory(name, divisions);

    setEdit(prev => {
      const updates: Partial<Product> = { name };
      
      // Auto infer & select category smartly if new product or default/unset
      const isDefaultCat = !prev.division_category || prev.division_category === "Spices" || prev.division_category === "Other";
      if ((!original?.id || isDefaultCat) && inferredCategory) {
        updates.division_category = inferredCategory;
      }

      const activeCat = updates.division_category || prev.division_category;

      // Auto generate SKU if new product and SKU was empty or default
      if (!original?.id && (!prev.sku || prev.sku.length < 3 || prev.sku.startsWith("ITEM-") || prev.sku.startsWith("PROD-") || prev.sku.startsWith("GEN-"))) {
        const selectedCompany = companies?.find(c => c.id === prev.company_id);
        updates.sku = generateSku(name, selectedCompany?.short_code, activeCat, selectedCompany?.name || prev.brand);
      }

      if (weight) {
        updates.pack_size_value = weight.value;
        updates.pack_size_unit = weight.unit;
        updates.case_qty_unit = "kg";
        if (!prev.preferred_sell_unit || prev.preferred_sell_unit === 'packet' || prev.preferred_sell_unit === 'unit') {
          updates.preferred_sell_unit = "kg";
        }
      }
      return { ...prev, ...updates };
    });
  };

  const handleAutoDetectCategory = () => {
    if (!edit.name?.trim()) return toast.error("Please enter a product name first");
    const inferredCat = inferTaxonomyCategory(edit.name, divisions);
    const inferredDiv = inferTaxonomyDivision(inferredCat || edit.name);
    const inferredSub = inferSubCategory(edit.name, inferredCat);
    const matchedComp = inferCompanyMatch(edit.name, edit.brand, companies);

    setEdit(prev => {
      const updates: Partial<Product> = {
        division_category: inferredCat,
        division: inferredDiv,
        sub_category: inferredSub || prev.sub_category,
      };

      if (matchedComp && !prev.company_id) {
        updates.company_id = matchedComp.id;
        if (!prev.brand || prev.brand === "General") {
          updates.brand = matchedComp.name;
        }
      }

      // Infer packaging type
      const lower = edit.name!.toLowerCase();
      if (lower.includes("jar") || lower.includes("dabba")) updates.item_pack_type = "jar";
      else if (lower.includes("bottle") || lower.includes("btl")) updates.item_pack_type = "bottle";
      else if (lower.includes("can") || lower.includes("tin")) updates.item_pack_type = "can";
      else if (lower.includes("box") || lower.includes("carton")) updates.item_pack_type = "box";
      else if (lower.includes("bag") || lower.includes("bori") || lower.includes("sack")) updates.item_pack_type = "bag";
      else if (lower.includes("pouch") || lower.includes("packet") || lower.includes("pkt")) updates.item_pack_type = "packet";

      return { ...prev, ...updates };
    });

    toast.success("Auto-Detected Attributes", {
      description: `Category: ${inferredCat} • Division: ${inferredDiv} ${matchedComp ? `• Company: ${matchedComp.name}` : ''}`
    });
  };

  const handleGstRateChange = (rateVal: number | "") => {
    if (rateVal === "" || rateVal === 0) {
      setEdit(prev => ({
        ...prev,
        gst_rate: 0,
        cgst_rate: 0,
        sgst_rate: 0,
        igst_rate: 0
      }));
      return;
    }
    const numRate = Number(rateVal);
    const half = Number((numRate / 2).toFixed(2));
    setEdit(prev => ({
      ...prev,
      gst_rate: numRate,
      cgst_rate: half,
      sgst_rate: half,
      igst_rate: numRate
    }));
  };

  const handleRegenerateSku = () => {
    if (!edit.name) return toast.error("Enter product name first");
    const selectedCompany = companies?.find(c => c.id === edit.company_id);
    const newSku = generateSku(edit.name, selectedCompany?.short_code, edit.division_category, selectedCompany?.name || edit.brand);
    setEdit(prev => ({ ...prev, sku: newSku }));
    toast.success(`Generated SKU: ${newSku}`);
  };

  const handleAddCustomCategory = () => {
    const trimmed = customCategory.trim();
    if (!trimmed) return;
    if (!divisions.includes(trimmed)) {
      setDivisions(prev => [...prev, trimmed].sort());
    }
    setEdit(prev => ({ ...prev, division_category: trimmed }));
    setCustomCategory("");
    setIsAddingCustomCategory(false);
    toast.success(`Category "${trimmed}" selected`);
  };

  const handleAddAlias = async () => {
    if (!productId || productId === "new" || productId.startsWith("clone:")) {
      return toast.error("Please save the product first before adding supplier codes");
    }
    if (!newExternalCode.trim()) {
      return toast.error("Please enter a code (e.g. Basepack / SKU7)");
    }

    try {
      const { data, error } = await supabase
        .from("grn_product_aliases")
        .insert({
          product_id: productId,
          external_code: newExternalCode.trim(),
          raw_name: edit.name || newExternalCode.trim(),
          supplier_name: newSupplierName.trim() || null,
          company_id: newCompanyId || edit.company_id || null,
          code_type: newCodeType,
          hsn: newHsn.trim() || edit.hsn || null,
          use_count: 1
        })
        .select("*, company:company_id(*)")
        .single();

      if (error) throw error;
      setAliases(prev => [data as unknown as ProductAlias, ...prev]);
      setNewExternalCode("");
      setNewSupplierName("");
      setNewHsn("");
      setIsAddingAlias(false);
      toast.success("Supplier code linked successfully");
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const handleDeleteAlias = async (aliasId: string) => {
    try {
      const { error } = await supabase
        .from("grn_product_aliases")
        .delete()
        .eq("id", aliasId);

      if (error) throw error;
      setAliases(prev => prev.filter(a => a.id !== aliasId));
      toast.success("Alias removed");
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const save = async () => {
    if (!edit.name?.trim()) return toast.error("Product name is required");
    
    // Auto-generate SKU if not provided
    if (!edit.sku?.trim()) {
      const selectedCompany = companies?.find(c => c.id === edit.company_id);
      edit.sku = generateSku(edit.name, selectedCompany?.short_code, edit.division_category, selectedCompany?.name || edit.brand);
    }

    setBusy(true);

    try {
      const isNew = !productId || productId === "new" || productId.startsWith("clone:");

      if (isNew && edit.sku) {
        // Check for duplicate SKU
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("sku", edit.sku)
          .maybeSingle();

        if (existing) {
          edit.sku = `${edit.sku}-${Math.floor(10 + Math.random() * 90)}`;
        }
      }

      const { data: savedProduct, error: saveError } = await persistProductToSupabase(edit, isNew ? null : productId);
      if (saveError) throw saveError;

      if (isNew) {
        // If initial stock was provided, create initial inventory batch
        const stockQty = Number(initialStock) || 0;
        if (stockQty > 0 && savedProduct?.id) {
          const costVal = Number(edit.mrp) > 0 ? Number(edit.mrp) * 0.7 : 0;
          await supabase.from("inventory_batches").insert({
            product_id: savedProduct.id,
            initial_qty: stockQty,
            received_qty: stockQty,
            remaining_qty: stockQty,
            cost_price: costVal,
            landed_cost: costVal,
            batch_number: `INIT-${edit.sku || "PROD"}-${Date.now() % 10000}`,
            received_at: new Date().toISOString()
          });
        }

        toast.success(stockQty > 0 ? `Product created with ${stockQty} initial stock` : "Product created");
      } else {
        toast.success("Product updated");
      }
      
      invalidateAllProductCaches();
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!productId || productId === "new" || productId.startsWith("clone:")) return;
    setIsDeleting(true);
    const toastId = toast.loading("Deleting product and clearing related stock...");
    try {
      await deleteProductAndStock(productId);
      toast.success("Product and associated stock deleted successfully", { id: toastId });
      invalidateAllProductCaches();
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error("Failed to delete product:", err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedCompany = companies?.find(c => c.id === edit.company_id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-slate-50 border-l border-slate-200 shadow-2xl overflow-hidden z-50">
        <SheetHeader className="p-6 pr-12 bg-white border-b border-slate-200 shrink-0">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-xl font-black text-slate-900 tracking-tight line-clamp-1">
                {edit.name?.trim() 
                  ? edit.name.trim() 
                  : (productId === "new" ? "New Product" : "Untitled Product")}
              </SheetTitle>
              {selectedCompany && (
                <Badge 
                  style={{ backgroundColor: selectedCompany.accent_hex || '#6366F1' }}
                  className="text-white text-[10px] font-bold uppercase border-none tracking-wide shadow-xs shrink-0"
                >
                  {selectedCompany.short_code}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {edit.sku && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SKU:</span>
                  <span className="text-xs font-mono font-bold uppercase text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {edit.sku}
                  </span>
                </div>
              )}
              {edit.division_category && (
                <Badge variant="outline" className="text-[10px] font-bold text-slate-600 bg-slate-50 border-slate-200">
                  {edit.division_category}
                </Badge>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar pb-32">
          {/* Stats Bar */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col items-center">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1">
                <Boxes className="h-3 w-3 text-emerald-600" />
                Global Stock
              </span>
              <span className="text-lg font-black text-emerald-600 tabular-nums">{stockStats.global}</span>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col items-center">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-amber-600" />
                Min Stock
              </span>
              <span className="text-lg font-black text-slate-900 tabular-nums">{stockStats.min}</span>
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex flex-col items-center">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center gap-1">
                <Layers className="h-3 w-3 text-blue-600" />
                Active Batches
              </span>
              <span className="text-lg font-black text-slate-900 tabular-nums">{stockStats.batches}</span>
            </div>
          </div>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="bg-slate-200/60 p-1 rounded-xl h-12 w-full grid grid-cols-3 mb-6 border border-slate-200">
              <TabsTrigger value="details" className="rounded-lg font-bold text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
                General & Codes
              </TabsTrigger>
              <TabsTrigger value="logistics" className="rounded-lg font-bold text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
                Packaging & Logistics
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg font-bold text-xs h-9 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-xs">
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6">
              {/* Basic Info Section */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-slate-100 pb-2">
                  General Product Identification
                </h3>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-blue-600" />
                      Product Name <span className="text-red-500">*</span>
                    </Label>
                    <span className="text-[10px] text-slate-400 font-medium">Official retail title</span>
                  </div>
                  <Input 
                    className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 shadow-2xs focus:bg-white focus:border-blue-500 text-slate-900"
                    placeholder="e.g. Bharat Turmeric Powder (Haldi) [1 Kg Bag]"
                    value={edit.name || ""}
                    onChange={e => handleNameChange(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Barcode className="h-3.5 w-3.5 text-indigo-600" />
                        SKU Code
                      </Label>
                      <button
                        type="button"
                        onClick={handleRegenerateSku}
                        className="text-[10px] text-blue-600 font-bold hover:underline flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded-full"
                        title="Regenerate SKU automatically"
                      >
                        <Sparkles className="h-3 w-3" /> Auto SKU
                      </button>
                    </div>
                    <Input 
                      className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-mono font-bold uppercase px-4 shadow-2xs focus:bg-white text-slate-900"
                      placeholder="e.g. BM-TURMERIC-1KG-BAG"
                      value={edit.sku || ""}
                      onChange={e => setEdit({...edit, sku: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 text-slate-600" />
                        HSN Tax Code
                      </Label>
                      <span className="text-[10px] text-slate-400 font-medium">GST Tariff Code</span>
                    </div>
                    <Input 
                      className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-mono font-bold px-4 shadow-2xs focus:bg-white text-slate-900"
                      placeholder="e.g. 09103030 / 33074100"
                      value={edit.hsn || ""}
                      onChange={e => handleHsnChange(e.target.value)}
                    />
                    {edit.hsn && lookupHsnTaxonomy(edit.hsn) && (
                      <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-emerald-600" />
                        HSN {edit.hsn}: {lookupHsnTaxonomy(edit.hsn)?.category}{lookupHsnTaxonomy(edit.hsn)?.subCategory ? ` (${lookupHsnTaxonomy(edit.hsn)?.subCategory})` : ""} • GST {lookupHsnTaxonomy(edit.hsn)?.defaultGstRate}%
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <FolderKanban className="h-3.5 w-3.5 text-purple-600" />
                        Brand
                      </Label>
                      <span className="text-[10px] text-slate-400 font-medium">Sub-brand or Label</span>
                    </div>
                    <Input 
                      className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 shadow-2xs focus:bg-white text-slate-900"
                      placeholder="e.g. Bharat Masala / Parle"
                      value={edit.brand || ""}
                      onChange={e => setEdit({...edit, brand: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-blue-600" />
                        Category / Division
                      </Label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAutoDetectCategory}
                          className="text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors"
                          title="Auto-detect category from product name"
                        >
                          <Sparkles className="h-3 w-3 text-emerald-600" /> Auto-Detect
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAddingCustomCategory(!isAddingCustomCategory)}
                          className="text-[10px] text-blue-600 font-bold hover:underline"
                        >
                          {isAddingCustomCategory ? "Standard" : "+ Custom"}
                        </button>
                      </div>
                    </div>

                    {isAddingCustomCategory ? (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Type custom category name..."
                          className="h-12 rounded-xl bg-white border-slate-300 font-bold text-xs text-slate-900"
                          value={customCategory}
                          onChange={e => setCustomCategory(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddCustomCategory();
                            }
                          }}
                        />
                        <Button 
                          type="button" 
                          size="sm" 
                          className="h-12 px-4 rounded-xl bg-blue-600 text-white font-bold text-xs shrink-0"
                          onClick={handleAddCustomCategory}
                        >
                          Add
                        </Button>
                      </div>
                    ) : (
                      <Select 
                        value={edit.division_category || "Spices"} 
                        onValueChange={v => setEdit({...edit, division_category: v})}
                      >
                        <SelectTrigger className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 shadow-2xs focus:bg-white text-slate-900">
                          <SelectValue placeholder="Select Category Taxonomy..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-slate-200 shadow-2xl bg-white max-h-72">
                          <div className="p-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Taxonomy Categories
                          </div>
                          {divisions.map(d => (
                            <SelectItem key={d} value={d} className="font-bold py-2.5 cursor-pointer">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">🏷️</span>
                                <span className="text-slate-900">{d}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-blue-600" />
                      Distribution Partner / FMCG Company
                    </Label>
                    <span className="text-[10px] text-slate-400 font-medium">Principal manufacturer</span>
                  </div>
                  <Select 
                    value={edit.company_id || "none"} 
                    onValueChange={v => {
                      const newCompId = v === "none" ? null : v;
                      const selectedComp = companies?.find(c => c.id === newCompId);
                      setEdit(prev => {
                        const isAutoSku = !prev.sku || prev.sku.startsWith("ITEM-") || prev.sku.startsWith("PROD-") || prev.sku.startsWith("GEN-") || /-[0-9]{3,}$/.test(prev.sku);
                        const nextSku = (isAutoSku && prev.name) 
                          ? generateSku(prev.name, selectedComp?.short_code, prev.division_category, selectedComp?.name || prev.brand)
                          : prev.sku;
                        return {
                          ...prev,
                          company_id: newCompId,
                          brand: (!prev.brand || prev.brand === "General" || prev.brand === "General / Independent Brand") && selectedComp ? selectedComp.name : prev.brand,
                          sku: nextSku
                        };
                      });
                    }}
                  >
                    <SelectTrigger className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 shadow-2xs focus:bg-white text-slate-900">
                      <SelectValue placeholder="No Partner Association" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-slate-200 shadow-2xl bg-white">
                      <SelectItem value="none" className="font-bold py-2.5">
                        <span className="text-slate-500">No Partner Association (Independent)</span>
                      </SelectItem>
                      {companies?.map(c => (
                        <SelectItem key={c.id} value={c.id} className="font-bold py-2.5">
                          <span className="flex items-center gap-2">
                            <span 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: c.accent_hex || '#6366F1' }}
                            />
                            <span className="text-slate-900">{c.name}</span>
                            <span className="text-[10px] font-mono font-bold text-slate-400">({c.short_code})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Pricing & GST Tax Breakdown Section */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] flex items-center gap-1.5">
                    <CircleDollarSign className="h-3.5 w-3.5 text-emerald-600" />
                    Pricing & Tax Rate (IGST, CGST, SGST)
                  </h3>
                  <div className="flex items-center gap-1">
                    {[0, 5, 12, 18, 28].map(slab => (
                      <button
                        key={slab}
                        type="button"
                        onClick={() => handleGstRateChange(slab)}
                        className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-bold transition-all",
                          Number(edit.gst_rate) === slab
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        {slab}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
                      Maximum Retail Price (MRP ₹)
                    </Label>
                    <Input 
                      type="number"
                      step="any"
                      className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-black text-slate-900 px-4 shadow-2xs focus:bg-white text-base"
                      placeholder="0.00"
                      value={edit.mrp !== undefined && edit.mrp !== null ? edit.mrp : ""}
                      onChange={e => setEdit({...edit, mrp: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value)})}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                      <Bell className="h-3.5 w-3.5 text-amber-600" />
                      Min Stock Alert (Units)
                    </Label>
                    <Input 
                      type="number"
                      className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold text-slate-900 px-4 shadow-2xs focus:bg-white text-base"
                      placeholder="50"
                      value={edit.min_stock !== undefined && edit.min_stock !== null ? edit.min_stock : ""}
                      onChange={e => setEdit({...edit, min_stock: e.target.value === "" ? ("" as unknown as number) : Number(e.target.value)})}
                    />
                  </div>
                </div>

                {/* Tax Inputs Breakdown Grid */}
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Tax Rates Breakdown (Intra-state & Inter-state)
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      Total GST: {edit.gst_rate || 0}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-700 uppercase">
                        GST Rate (%)
                      </Label>
                      <Input 
                        type="number"
                        step="any"
                        className="h-10 rounded-lg bg-white border-slate-200 font-bold text-slate-900 text-sm"
                        placeholder="0"
                        value={edit.gst_rate !== undefined && edit.gst_rate !== null ? edit.gst_rate : ""}
                        onChange={e => handleGstRateChange(e.target.value === "" ? "" : Number(e.target.value))}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-700 uppercase">
                        CGST Rate (%)
                      </Label>
                      <Input 
                        type="number"
                        step="any"
                        className="h-10 rounded-lg bg-white border-slate-200 font-bold text-slate-900 text-sm"
                        placeholder="0"
                        value={edit.cgst_rate !== undefined && edit.cgst_rate !== null ? edit.cgst_rate : ""}
                        onChange={e => setEdit({...edit, cgst_rate: e.target.value === "" ? 0 : Number(e.target.value)})}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-700 uppercase">
                        SGST Rate (%)
                      </Label>
                      <Input 
                        type="number"
                        step="any"
                        className="h-10 rounded-lg bg-white border-slate-200 font-bold text-slate-900 text-sm"
                        placeholder="0"
                        value={edit.sgst_rate !== undefined && edit.sgst_rate !== null ? edit.sgst_rate : ""}
                        onChange={e => setEdit({...edit, sgst_rate: e.target.value === "" ? 0 : Number(e.target.value)})}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-700 uppercase">
                        IGST Rate (%)
                      </Label>
                      <Input 
                        type="number"
                        step="any"
                        className="h-10 rounded-lg bg-white border-slate-200 font-bold text-slate-900 text-sm"
                        placeholder="0"
                        value={edit.igst_rate !== undefined && edit.igst_rate !== null ? edit.igst_rate : ""}
                        onChange={e => setEdit({...edit, igst_rate: e.target.value === "" ? 0 : Number(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>

                {(!productId || productId === "new" || productId.startsWith("clone:")) && (
                  <div className="space-y-2 bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5 text-emerald-600" />
                        Initial Stock Quantity (Optional)
                      </Label>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">Creates Batch</span>
                    </div>
                    <Input 
                      type="number"
                      className="h-12 rounded-xl bg-white border-emerald-300 font-bold text-emerald-900 px-4 shadow-2xs focus:border-emerald-500 text-base"
                      placeholder="0 (e.g. 50 pcs)"
                      value={initialStock}
                      onChange={e => setInitialStock(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                )}
              </div>

              {/* External & Supplier Codes Section (Flattened directly into Details) */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-blue-600" />
                      Supplier & External Codes ({aliases.length})
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Basepack codes, SKU7, Material IDs, or Barcodes from supplier invoices
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-bold gap-1 rounded-xl border-slate-200 hover:bg-slate-50"
                    onClick={() => setIsAddingAlias(!isAddingAlias)}
                  >
                    <Plus className="h-3 w-3" /> Add Code
                  </Button>
                </div>

                {isAddingAlias && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="text-[11px] font-bold text-slate-700">Link New Supplier Code</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500">External Code (Basepack/SKU7)</Label>
                        <Input
                          placeholder="e.g. 68472910"
                          className="h-9 bg-white text-xs font-mono font-bold"
                          value={newExternalCode}
                          onChange={e => setNewExternalCode(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500">Code Type</Label>
                        <Select value={newCodeType} onValueChange={setNewCodeType}>
                          <SelectTrigger className="h-9 bg-white text-xs font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white">
                            <SelectItem value="basepack">Basepack Code</SelectItem>
                            <SelectItem value="sku7">SKU7 Code</SelectItem>
                            <SelectItem value="barcode">Barcode / EAN</SelectItem>
                            <SelectItem value="article_no">Article No</SelectItem>
                            <SelectItem value="external">External Ref</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500">Supplier Name</Label>
                        <Input
                          placeholder="e.g. Hindustan Unilever"
                          className="h-9 bg-white text-xs font-bold"
                          value={newSupplierName}
                          onChange={e => setNewSupplierName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500">Company Link</Label>
                        <Select value={newCompanyId || "default"} onValueChange={v => setNewCompanyId(v === "default" ? null : v)}>
                          <SelectTrigger className="h-9 bg-white text-xs font-bold">
                            <SelectValue placeholder="Use Product Company" />
                          </SelectTrigger>
                          <SelectContent className="bg-white">
                            <SelectItem value="default">Use Product Company</SelectItem>
                            {companies?.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setIsAddingAlias(false)}>Cancel</Button>
                      <Button size="sm" className="h-8 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700" onClick={handleAddAlias}>Save Code</Button>
                    </div>
                  </div>
                )}

                {aliases.length === 0 ? (
                  <div className="text-center py-5 text-slate-400 space-y-1 border border-dashed border-slate-200 rounded-xl">
                    <Hash className="h-6 w-6 mx-auto opacity-30" />
                    <p className="text-xs font-medium">No external supplier codes linked yet</p>
                    <p className="text-[10px] text-slate-400">Codes are captured here or automatically learned during invoice imports</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                    {aliases.map(alias => (
                      <div key={alias.id} className="py-2.5 flex items-center justify-between group">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                              {alias.external_code || alias.raw_name}
                            </span>
                            <Badge variant="outline" className="text-[9px] uppercase font-bold text-slate-500">
                              {alias.code_type || "code"}
                            </Badge>
                            {alias.company && (
                              <Badge 
                                style={{ backgroundColor: alias.company.accent_hex || '#6366F1' }}
                                className="text-white text-[9px] font-bold uppercase border-none"
                              >
                                {alias.company.short_code}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-slate-400">
                            {alias.supplier_name && <span>Supplier: <strong className="text-slate-600">{alias.supplier_name}</strong></span>}
                            {alias.hsn && <span>HSN: <strong className="text-slate-600">{alias.hsn}</strong></span>}
                            <span>Matched <strong className="text-slate-600">{alias.use_count || 1}x</strong></span>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDeleteAlias(alias.id)}
                          title="Remove alias"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status & Flags Section */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] border-b border-slate-100 pb-2">
                  Visibility & Channel Rules
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <div 
                     className={cn(
                       "flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer select-none",
                       edit.is_active ? "bg-emerald-50/50 border-emerald-200 text-emerald-900 shadow-2xs" : "bg-slate-50 border-slate-200 text-slate-400"
                     )} 
                     onClick={() => setEdit({...edit, is_active: !edit.is_active})}
                   >
                     <div className="space-y-0.5">
                       <p className="text-xs font-bold uppercase tracking-wider">Active Status</p>
                       <p className="text-[10px] text-slate-500 font-normal">Available for orders & sales invoices</p>
                     </div>
                     <div className={cn("h-6 w-6 rounded-full flex items-center justify-center border", edit.is_active ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 bg-white")}>
                       {edit.is_active && <Check className="h-3.5 w-3.5" />}
                     </div>
                   </div>

                   <div 
                     className={cn(
                       "flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer select-none",
                       edit.is_chain_item ? "bg-blue-50/50 border-blue-200 text-blue-900 shadow-2xs" : "bg-slate-50 border-slate-200 text-slate-400"
                     )} 
                     onClick={() => setEdit({...edit, is_chain_item: !edit.is_chain_item})}
                   >
                     <div className="space-y-0.5">
                       <p className="text-xs font-bold uppercase tracking-wider">Chain Store Eligible</p>
                       <p className="text-[10px] text-slate-500 font-normal">Eligible for Modern Trade & Chain outlets</p>
                     </div>
                     <div className={cn("h-6 w-6 rounded-full flex items-center justify-center border", edit.is_chain_item ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white")}>
                       {edit.is_chain_item && <Check className="h-3.5 w-3.5" />}
                     </div>
                   </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="logistics" className="space-y-6">
               <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-xs">
                 <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Packaging Hierarchy & Multipliers</Label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Units per Packet / Strip</Label>
                            <span className="text-[10px] font-medium text-slate-400">Inner Pack Multiplier</span>
                          </div>
                          <Input 
                            type="number"
                            min="1"
                            placeholder="1"
                            className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 text-slate-900"
                            value={edit.units_per_packet !== undefined && edit.units_per_packet !== null ? edit.units_per_packet : ""}
                            onChange={e => {
                              const val = e.target.value;
                              setEdit(prev => ({
                                ...prev, 
                                units_per_packet: val === "" ? ("" as unknown as number) : Number(val)
                              }));
                            }}
                          />
                       </div>

                       <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Packets per Case / Shipper</Label>
                            <span className="text-[10px] font-medium text-slate-400">Outer Shipper Multiplier</span>
                          </div>
                          <Input 
                            type="number"
                            min="1"
                            placeholder="1"
                            className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 text-slate-900"
                            value={edit.packets_per_case !== undefined && edit.packets_per_case !== null ? edit.packets_per_case : ""}
                            onChange={e => {
                              const val = e.target.value;
                              setEdit(prev => ({
                                ...prev, 
                                packets_per_case: val === "" ? ("" as unknown as number) : Number(val)
                              }));
                            }}
                          />
                       </div>
                    </div>
                 </div>

                 {/* Pack Format & Units */}
                 <div className="space-y-4 pt-4 border-t border-slate-100">
                    <Label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Format & Measure Units</Label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Item Physical Form</Label>
                          <Select 
                            value={edit.item_pack_type || "packet"} 
                            onValueChange={v => setEdit({...edit, item_pack_type: v})}
                          >
                            <SelectTrigger className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 text-slate-900">
                              <SelectValue placeholder="Select type..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-200 shadow-2xl bg-white">
                              <SelectItem value="packet" className="font-bold py-2">Packet / Pouch (Pkt)</SelectItem>
                              <SelectItem value="jar" className="font-bold py-2">Jar / Container (Jar)</SelectItem>
                              <SelectItem value="bottle" className="font-bold py-2">Bottle / Flask (Btl)</SelectItem>
                              <SelectItem value="can" className="font-bold py-2">Can / Tin (Can)</SelectItem>
                              <SelectItem value="box" className="font-bold py-2">Box / Carton (Box)</SelectItem>
                              <SelectItem value="strip" className="font-bold py-2">Strip / Blister (Strip)</SelectItem>
                              <SelectItem value="bag" className="font-bold py-2">Bag / Sack (Bag)</SelectItem>
                              <SelectItem value="unit" className="font-bold py-2">Discrete Unit (Pcs)</SelectItem>
                            </SelectContent>
                          </Select>
                       </div>

                       <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Base Unit of Measure</Label>
                          <Select 
                            value={edit.unit_type || "pcs"} 
                            onValueChange={v => setEdit({...edit, unit_type: v as "pcs" | "packet" | "kg_g"})}
                          >
                            <SelectTrigger className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 text-slate-900">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-200 shadow-2xl bg-white">
                              <SelectItem value="pcs" className="font-bold py-2">Pieces / General (pcs)</SelectItem>
                              <SelectItem value="kg_g" className="font-bold py-2">Weighted (Kg / g)</SelectItem>
                              <SelectItem value="packet" className="font-bold py-2">Packet Hierarchy</SelectItem>
                            </SelectContent>
                          </Select>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Pack Size & Measure Unit</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <Input 
                              type="number"
                              step="any"
                              placeholder="e.g. 500"
                              className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 text-slate-900"
                              value={edit.pack_size_value !== undefined && edit.pack_size_value !== null ? edit.pack_size_value : ""}
                              onChange={e => {
                                const val = e.target.value;
                                setEdit(prev => ({
                                  ...prev, 
                                  pack_size_value: val === "" ? ("" as unknown as number) : Number(val)
                                }));
                              }}
                            />
                            <Select 
                              value={edit.pack_size_unit || "g"} 
                              onValueChange={v => setEdit({...edit, pack_size_unit: v, display_weight_unit: v as Product["display_weight_unit"]})}
                            >
                              <SelectTrigger className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 text-slate-900">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl border-slate-200 shadow-2xl bg-white">
                                <SelectItem value="g" className="font-bold py-2">Grams (g)</SelectItem>
                                <SelectItem value="kg" className="font-bold py-2">Kilograms (kg)</SelectItem>
                                <SelectItem value="ml" className="font-bold py-2">Milliliters (ml)</SelectItem>
                                <SelectItem value="ltr" className="font-bold py-2">Liters (L)</SelectItem>
                                <SelectItem value="pcs" className="font-bold py-2">Pieces (pcs)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                       </div>

                       <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-800 uppercase tracking-wide">Preferred Selling Unit</Label>
                          <Select 
                            value={edit.preferred_sell_unit || "packet"} 
                            onValueChange={v => setEdit({...edit, preferred_sell_unit: v})}
                          >
                            <SelectTrigger className="h-12 rounded-xl bg-slate-50/70 border-slate-200 font-bold px-4 text-slate-900">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-slate-200 shadow-2xl bg-white">
                              <SelectItem value="pcs" className="font-bold py-2">Piece / Unit</SelectItem>
                              <SelectItem value="doz" className="font-bold py-2">Dozen (12 Pcs)</SelectItem>
                              <SelectItem value="packet" className="font-bold py-2">Packet (Pkt)</SelectItem>
                              <SelectItem value="case" className="font-bold py-2">Case (Carton)</SelectItem>
                              <SelectItem value="kg" className="font-bold py-2">Kilogram (Kg)</SelectItem>
                              <SelectItem value="ltr" className="font-bold py-2">Liter (Ltr)</SelectItem>
                            </SelectContent>
                          </Select>
                       </div>
                    </div>
                 </div>
               </div>
            </TabsContent>
            
            <TabsContent value="history" className="space-y-4">
               {productId === "new" ? (
                 <div className="flex flex-col items-center justify-center py-20 opacity-30 gap-4">
                    <History className="h-12 w-12" />
                    <p className="text-xs font-black uppercase tracking-widest">No history for new items</p>
                 </div>
               ) : (
                 <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs p-5">
                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest pb-2 border-b border-slate-100">
                      Product Inward History
                    </div>
                    <div className="py-4 text-xs text-slate-500 leading-relaxed">
                      View recent batches in Stock Movements or the Batch Ledger on the Stock page.
                    </div>
                 </div>
               )}
            </TabsContent>
          </Tabs>
        </div>

        <SheetFooter className="p-6 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
          {productId && productId !== "new" && !productId.startsWith("clone:") && (
            <Button
              variant="outline"
              type="button"
              className="h-12 px-4 rounded-xl font-bold text-xs border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 gap-1.5 shrink-0"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={busy || isDeleting}
            >
              <Trash2 className="h-4 w-4" />
              Delete Product
            </Button>
          )}
          <div className="flex-1 flex gap-2 justify-end">
            <Button 
              variant="outline" 
              className="h-12 px-5 rounded-xl font-bold text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() => onOpenChange(false)}
            >
              Discard
            </Button>
            <Button 
              className="h-12 px-6 rounded-xl font-bold text-xs bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 text-white"
              onClick={save}
              disabled={busy || isDeleting}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="rounded-3xl border border-border shadow-2xl max-w-md bg-white">
          <AlertDialogHeader>
            <div className="h-14 w-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-2">
              <Trash2 className="h-7 w-7" />
            </div>
            <AlertDialogTitle className="text-xl font-bold tracking-tight text-slate-900">
              Delete Product & Stock?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-slate-600 text-xs leading-relaxed space-y-2">
                <p>
                  Are you sure you want to permanently delete <strong>{edit.name || "this product"}</strong> ({edit.sku})?
                </p>
                <p className="p-2.5 bg-red-50 text-red-700 rounded-xl font-medium border border-red-100">
                  This will delete the product, clear all current inventory batches, remove stock movements, and unbind learned aliases. This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            {!isDeleting && (
              <AlertDialogCancel className="h-11 rounded-xl font-bold text-xs border">
                Cancel
              </AlertDialogCancel>
            )}
            <AlertDialogAction
              className="h-11 rounded-xl font-bold text-xs bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
              onClick={handleDeleteProduct}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Yes, Delete Product & Stock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
};
