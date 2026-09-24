import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Upload, Plus, Sparkles, Loader2, 
  ChevronDown, ChevronUp, Check, Building2, Box, Trash2,
  AlertCircle, Camera, X, CheckCircle2, ShieldCheck, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContextCore";
import { sanitizeProductForDb, isProductDozenPackaging, type PackType } from "@/lib/packaging";
import { persistProductToSupabase } from "@/lib/productPersistence";
import { ensureSku } from "@/lib/skuGenerator";
import { 
  matchProduct, 
  buildNormalizedCatalog, 
  type MatchStatus, 
  type MatchResult 
} from "@/lib/grnMatcher";
import { getLearnedMap, recordCorrection, normalizeAliasKey } from "@/lib/supplierMappings";
import { 
  useStockImport, 
  type StockItem, 
  type Warehouse, 
  mmyyToIsoExpiryDate, 
  addMonthsMMYY 
} from "@/hooks/useStockImport";
import { type ExtractedItem } from "@/services/geminiService";
import { LandedCostFields } from "@/components/stock/LandedCostFields";
import { SupplierCombobox } from "@/components/stock/SupplierCombobox";
import { Product, Company } from "@/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ProductMappingCombobox } from "@/components/stock/ProductMappingCombobox";
import { CompanyResolutionModal } from "@/components/stock/CompanyResolutionModal";
import { GeminiApiKeyModal } from "@/components/stock/GeminiApiKeyModal";
import { 
  BRAND_VALIDATION_RULES, 
  validateItemForBrand, 
  isValidGSTIN,
  parseDateString,
  BrandValidationRule 
} from "@/lib/invoiceFieldMapping";
import { inferTaxonomyCategory, inferTaxonomyDivision, inferSubCategory, inferCompanyMatch, normalizeDivisionCategory } from "@/lib/taxonomy";
import { lookupHsnTaxonomy } from "@/lib/hsnTaxonomy";

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

export default function StockImport() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase.from("products").select("*, inventory(quantity)").order("name");
      if (data) setProducts((data as unknown) as Product[]);
      setLoading(false);
    };
    fetchProducts();
  }, []);

  const {
    items,
    invoiceNumber,
    setInvoiceNumber,
    supplierName,
    setSupplierName,
    supplierGstn,
    setSupplierGstn,
    companyId,
    setCompanyId,
    invoiceDate,
    setInvoiceDate,
    totalFreight,
    setTotalFreight,
    totalHandling,
    setTotalHandling,
    globalPackedDate,
    updateAllPackedDate,
    defaultBatchNumber,
    updateAllBatchNumber,
    warehouseId,
    setWarehouseId,
    availableWarehouses,
    availableCompanies,
    companyPromptOpen,
    setCompanyPromptOpen,
    inferredBrand,
    suggestedCompanyName,
    suggestedCompanyCode,
    handleCompanyCreated,
    stats,
    parsing,
    handleFileUpload,
    onPasteExtract,
    addPendingItemsToStaging,
    handleImport,
    addItem,
    updateItem,
    removeItem,
    pendingItems,
    isBulkImportOpen,
    setIsBulkImportOpen,
    bulkStep,
    setBulkStep,
    apiKeyModalOpen,
    setApiKeyModalOpen
  } = useStockImport(products);

  const companies = availableCompanies || [];
  const activeCompany = companies.find(c => c.id === companyId);

  const { isAdmin } = useAuth();

  const handleProductCreated = (newProd: Product) => {
    setProducts(prev => [newProd, ...prev]);
  };

  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isHeaderOpen, setIsHeaderOpen] = useState(true);

  const editingItem = items.find(it => it.id === editingItemId);

  if (loading) return <div className="h-screen w-full flex items-center justify-center"><Loader2 className="animate-spin text-zinc-300" /></div>;
  if (!isAdmin) return <div className="p-8 text-center font-bold text-zinc-400">Admin access required</div>;

  return (
    <div className="mx-auto max-w-[420px] lg:max-w-4xl bg-[#F5F4F0] min-h-screen pb-16 font-sans select-none overflow-x-hidden">
      <div className="sticky top-0 z-50 bg-white border-b border-black/5 px-4 py-3 flex items-center justify-between shadow-sm backdrop-blur-md bg-opacity-90">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigate("/stock")} 
            className="h-8 w-8 -ml-1.5 rounded-full flex items-center justify-center text-zinc-600 hover:text-black hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
            title="Back to Stock"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-bold uppercase tracking-tight text-zinc-900">Inward GRN Import</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="h-7 px-2.5 bg-[#EFF6FF] text-[#2563EB] border-none hover:bg-blue-100 font-medium text-[10px] gap-1.5 rounded-full"
            onClick={() => {
              setBulkStep(1);
              setIsBulkImportOpen(true);
            }}
            disabled={parsing}
          >
            {parsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            AI IMPORT
          </Button>
          {items.length > 0 && (
            <Button 
              size="sm"
              className="h-7 px-3 bg-black hover:bg-zinc-800 text-white font-bold text-[10px] uppercase rounded-full shadow-sm"
              onClick={() => handleImport(() => navigate("/stock"))}
            >
              Finalize ({items.length})
            </Button>
          )}
        </div>
        <input 
          id="smart-import-file"
          type="file" 
          className="hidden" 
          accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv" 
          onChange={handleFileUpload} 
        />
      </div>

      <div className="p-4 space-y-4">
        <Collapsible open={isHeaderOpen} onOpenChange={setIsHeaderOpen} className="bg-white border border-black/5 rounded-xl transition-all duration-300 overflow-hidden">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 transition-colors">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Header & Supplier Details</span>
              {isHeaderOpen ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="p-4 pt-0 space-y-4 border-t border-black/5">
            <div className="space-y-1.5">
              <Label className="uppercase text-[9px] font-bold text-zinc-500 tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-blue-600" />
                  Receiving Warehouse
                </span>
                <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">Required for Stock Entry</span>
              </Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-11 md:h-10 text-[13px] border-zinc-200 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all font-bold bg-zinc-50/50">
                  <SelectValue placeholder="Select target warehouse..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableWarehouses.map(w => (
                    <SelectItem key={w.id} value={w.id} className="text-xs font-bold">
                      🏢 {w.name} {w.code ? `(${w.code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Invoice No</Label>
                <Input 
                  value={invoiceNumber} 
                  onChange={e => setInvoiceNumber(e.target.value)} 
                  placeholder="INV-001"
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all uppercase font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Supplier Name</Label>
                <SupplierCombobox 
                  value={supplierName} 
                  onChange={setSupplierName} 
                  placeholder="Supplier Name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider flex items-center justify-between">
                  <span>Supplier GSTIN</span>
                  {supplierGstn && (
                    <span className={cn("text-[8px] px-1 py-0.2 rounded font-bold uppercase", isValidGSTIN(supplierGstn) ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50")}>
                      {isValidGSTIN(supplierGstn) ? "✓ Valid GSTIN" : "Check Format"}
                    </span>
                  )}
                </Label>
                <Input 
                  value={supplierGstn} 
                  onChange={e => setSupplierGstn(e.target.value.toUpperCase())} 
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all font-mono uppercase font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Invoice Date</Label>
                <Input 
                  type="date"
                  value={invoiceDate} 
                  onChange={e => setInvoiceDate(e.target.value)} 
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all block w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Freight (₹)</Label>
                <Input 
                  type="number"
                  value={totalFreight} 
                  onChange={e => setTotalFreight(e.target.value)} 
                  placeholder="0.00"
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Handling (₹)</Label>
                <Input 
                  type="number"
                  value={totalHandling} 
                  onChange={e => setTotalHandling(e.target.value)} 
                  placeholder="0.00"
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all font-medium"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Packed MMYY</Label>
                <Input 
                  maxLength={4}
                  value={globalPackedDate} 
                  onChange={e => updateAllPackedDate(e.target.value.replace(/\D/g, "").slice(0, 4))} 
                  placeholder="MMYY (e.g. 0524)"
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all font-mono font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="uppercase text-[9px] font-bold text-zinc-400 tracking-wider">Default Batch No.</Label>
                <Input 
                  value={defaultBatchNumber} 
                  onChange={e => updateAllBatchNumber(e.target.value)} 
                  placeholder="Auto (B-INV-MMYY)"
                  className="h-11 md:h-10 text-[13px] border-zinc-100 rounded-lg focus:ring-1 focus:ring-zinc-200 transition-all font-mono font-medium uppercase"
                />
              </div>
            </div>

            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div 
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white uppercase shrink-0 shadow-xs"
                  style={{ backgroundColor: activeCompany?.accent_hex || '#4B5563' }}
                >
                  {activeCompany?.short_code ? activeCompany.short_code.slice(0, 3) : "GEN"}
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Assigned Brand / Company</span>
                  <p className="text-xs font-bold text-zinc-900 truncate">
                    {activeCompany ? activeCompany.name : "Multi-Brand / General Inward"}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-[11px] font-bold bg-white hover:bg-zinc-100 rounded-lg shrink-0"
                onClick={() => setCompanyPromptOpen(true)}
              >
                {activeCompany ? "Change Brand" : "🏢 Assign Brand"}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Total Units", value: stats.totalBaseUnits },
            { label: "Line Items", value: items.length },
            { label: "Total Weight", value: `${stats.totalWeight.toFixed(2)} KG` },
            { label: "Est. Margin", value: `${stats.avgProfit.toFixed(1)}%`, color: stats.avgProfit > 0 ? "text-[#10B981]" : "text-red-500" },
          ].map((stat, i) => (
            <div key={i} className="bg-white border border-black/5 p-3 rounded-lg flex flex-col justify-between h-16 shadow-none">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{stat.label}</span>
              <span className={cn("text-base font-bold text-zinc-900 leading-none", stat.color)}>{stat.value}</span>
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 bg-white border border-black/10 border-dashed rounded-xl shadow-inner-sm">
            <Box className="h-12 w-12 text-zinc-200 mb-4" strokeWidth={1.5} />
            <p className="text-sm font-medium text-zinc-400 mb-6">No items added yet</p>
            <div className="flex gap-2">
              <Button 
                onClick={() => { setEditingItemId(null); setIsAddItemOpen(true); }}
                className="bg-black text-white rounded-full h-10 px-6 text-xs font-bold hover:bg-zinc-800 transition-all active:scale-95"
              >
                + Add item
              </Button>
              <Button 
                variant="outline"
                onClick={() => { setBulkStep(1); setIsBulkImportOpen(true); }}
                className="rounded-full h-10 px-6 text-xs font-bold border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-all active:scale-95"
              >
                Bulk import
              </Button>
            </div>
          </div>
        )}

        <ImportPreviewTable 
          items={items} 
          products={products} 
          totalFreight={Number(totalFreight) || 0}
          totalHandling={Number(totalHandling) || 0}
          onEdit={(id) => { setEditingItemId(id); setIsAddItemOpen(true); }}
          onRemove={removeItem}
        />

        {items.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex justify-center">
              <Button variant="ghost" className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest h-9" onClick={() => { setEditingItemId(null); setIsAddItemOpen(true); }}>
                <Plus className="mr-1.5 h-3 w-3" /> Add more items
              </Button>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-black/5 shadow-xs flex flex-col sm:flex-row items-center gap-3">
              <Button 
                variant="outline"
                className="w-full sm:w-auto h-12 px-6 rounded-xl text-xs font-bold text-zinc-700 border-zinc-200 hover:bg-zinc-50 shrink-0 gap-1.5 shadow-xs"
                onClick={() => navigate("/stock")}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Stock
              </Button>
              <Button 
                className="w-full flex-1 bg-black hover:bg-zinc-800 text-white h-12 rounded-xl text-sm font-bold shadow-md active:scale-[0.98] transition-all"
                onClick={() => handleImport(() => navigate("/stock"))}
              >
                Finalize {items.length} items to GRN & Warehouse Stock
              </Button>
            </div>
          </div>
        )}
      </div>

      <AddItemDrawer 
        open={isAddItemOpen}
        onOpenChange={setIsAddItemOpen}
        products={products}
        editingItem={editingItem}
        onAdd={addItem}
        onUpdate={(field, val) => editingItemId && updateItem(editingItemId, field, val)}
        onProductCreated={handleProductCreated}
        onClose={() => setIsAddItemOpen(false)}
      />

      <BulkImportWizard 
        open={isBulkImportOpen}
        onOpenChange={setIsBulkImportOpen}
        step={bulkStep}
        setStep={setBulkStep}
        onFileUpload={handleFileUpload}
        parsing={parsing}
        onPasteExtract={onPasteExtract}
        pendingItems={pendingItems}
        products={products}
        onProductCreated={handleProductCreated}
        onConfirm={addPendingItemsToStaging}
        supplierName={supplierName}
        setSupplierName={setSupplierName}
        supplierGstn={supplierGstn}
        setSupplierGstn={setSupplierGstn}
        companyId={companyId}
        setCompanyId={setCompanyId}
        availableCompanies={availableCompanies}
        warehouseId={warehouseId}
        setWarehouseId={setWarehouseId}
        availableWarehouses={availableWarehouses}
        totalWeight={stats.totalWeight}
        avgProfit={stats.avgProfit}
        totalFreight={totalFreight}
        totalHandling={totalHandling}
        onOpenCompanyModal={() => setCompanyPromptOpen(true)}
        onOpenApiKeyModal={() => setApiKeyModalOpen(true)}
      />

      <GeminiApiKeyModal
        open={apiKeyModalOpen}
        onOpenChange={setApiKeyModalOpen}
      />

      <CompanyResolutionModal
        open={companyPromptOpen}
        onOpenChange={setCompanyPromptOpen}
        supplierName={supplierName}
        inferredBrand={inferredBrand}
        suggestedName={suggestedCompanyName}
        suggestedCode={suggestedCompanyCode}
        availableCompanies={availableCompanies}
        selectedCompanyId={companyId}
        onSelectCompany={(comp) => setCompanyId(comp ? comp.id : null)}
        onCompanyCreated={handleCompanyCreated}
      />
    </div>
  );
}

function ImportPreviewTable({ 
  items, 
  products, 
  totalFreight, 
  totalHandling,
  onEdit, 
  onRemove 
}: {
  items: StockItem[];
  products: Product[];
  totalFreight: number;
  totalHandling: number;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-xs overflow-hidden">
      <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-700">
          Staged Manifest ({items.length} Lines)
        </span>
      </div>
      <div className="divide-y divide-zinc-100 max-h-[400px] overflow-y-auto">
        {items.map((item) => {
          const p = products.find(px => px.id === item.productId);
          const lineNet = item.netValue !== undefined ? item.netValue : ((Number(item.quantity) || 0) * (Number(item.unitCost) || 0));
          const effGst = item.taxPct !== undefined ? item.taxPct : (p?.gst_rate || 0);
          const lineTax = item.taxAmount !== undefined ? item.taxAmount : (lineNet * (effGst / 100));
          const lineGross = item.grossValue !== undefined ? item.grossValue : (lineNet + lineTax);

          return (
            <div key={item.id} className="p-3.5 flex items-center justify-between hover:bg-zinc-50/60 transition-colors">
              <div className="min-w-0 flex-1 pr-3">
                <div className="flex items-center gap-2">
                  <p className="text-[12px] font-bold text-zinc-900 uppercase truncate">{item.name}</p>
                  {effGst > 0 && (
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] h-4 font-bold">
                      GST {effGst}%
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-zinc-500 font-mono">
                  <span>SKU: {item.sku || p?.sku}</span>
                  {item.external_code && item.external_code !== item.sku && (
                    <span className="text-indigo-600 font-semibold">Code: {item.external_code}</span>
                  )}
                  {item.hsn && <span>HSN: {item.hsn}</span>}
                  <span>Qty: <strong className="text-zinc-800">{item.quantity} {item.packType.toUpperCase()}</strong></span>
                  <span>Rate: {fmtINR(item.unitCost)}</span>
                  {lineTax > 0 && (
                    <span className="text-amber-700 font-semibold">Tax: +{fmtINR(lineTax)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-[12px] font-bold text-zinc-900 font-mono">{fmtINR(lineGross)}</p>
                  <span className="text-[10px] font-mono text-zinc-400 block">Net {fmtINR(lineNet)}</span>
                  <button onClick={() => onEdit(item.id)} className="text-[10px] font-bold text-blue-600 hover:underline">Edit</button>
                </div>
                <button 
                  onClick={() => onRemove(item.id)}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddItemDrawer({ open, onOpenChange, products, editingItem, onAdd, onUpdate, onProductCreated, onClose }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  editingItem?: StockItem;
  onAdd: (p: Product) => void;
  onUpdate: (field: keyof StockItem, val: unknown) => void;
  onProductCreated?: (p: Product) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.sku.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8);

  const handleQuickCreate = async () => {
    if (!search.trim()) return;
    setCreating(true);
    try {
      const cleanSku = search.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
      const rand = Math.floor(100 + Math.random() * 900);
      const sku = `${cleanSku || 'ITEM'}-${rand}`;

      const inferredCategory = inferTaxonomyCategory(search.trim());
      const inferredDivision = inferTaxonomyDivision(inferredCategory);
      const inferredSub = inferSubCategory(search.trim(), inferredCategory);

      const payload = sanitizeProductForDb({
        name: search.trim(),
        sku,
        mrp: 0,
        selling_price: 0,
        unit: "packet",
        preferred_sell_unit: "packet",
        division_category: inferredCategory,
        division: inferredDivision,
        sub_category: inferredSub || undefined,
        is_active: true,
        units_per_packet: 1,
        packets_per_case: 1,
        units_per_case: 1,
      });

      const { data, error } = await supabase
        .from("products")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      toast.success(`Created "${search.trim()}"`);
      if (onProductCreated) onProductCreated(data as Product);
      onAdd(data as Product);
      setSearch("");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-t-0 p-0 shadow-2xl overflow-x-hidden">
        <div className="mx-auto max-w-[420px] lg:max-w-2xl pb-10">
          <SheetHeader className="p-6 border-b border-black/5 bg-zinc-50/50">
            <SheetTitle className="text-sm font-bold tracking-tight uppercase text-center">
              {editingItem ? "Edit Item" : "Add Item to GRN"}
            </SheetTitle>
          </SheetHeader>

          <div className="p-6 space-y-6">
            {!editingItem ? (
              <div className="space-y-4">
                <div className="relative">
                  <Input 
                    className="pl-3 pr-10 h-11 rounded-xl border-zinc-100 bg-zinc-50/50"
                    placeholder="Search product..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button 
                      onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-zinc-300 hover:text-zinc-600 transition-colors"
                      title="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {filteredProducts.map(p => (
                    <div 
                      key={p.id} 
                      className="p-3 bg-white border border-black/5 rounded-xl active:bg-zinc-50 transition-colors flex justify-between items-center cursor-pointer"
                      onClick={() => onAdd(p)}
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-[12px] font-bold text-zinc-900 uppercase leading-normal mb-1">{p.name}</p>
                        <p className="text-[9px] font-mono text-zinc-400 mt-1 uppercase tracking-tighter">{p.sku}</p>
                      </div>
                      <Plus className="h-4 w-4 text-zinc-300" />
                    </div>
                  ))}

                  {filteredProducts.length === 0 && search.trim() && (
                    <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl space-y-3 text-center">
                      <p className="text-xs font-semibold text-blue-950">No catalog product found matching "{search}"</p>
                      <Button 
                        size="sm"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 rounded-xl gap-2 shadow-sm"
                        onClick={handleQuickCreate}
                        disabled={creating}
                      >
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Create & Add "{search}" to GRN
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                 <div className="bg-zinc-50 p-4 rounded-xl border border-black/5">
                    <p className="text-[12px] font-bold text-zinc-900 uppercase leading-normal mb-1">{editingItem.name}</p>
                    <p className="text-[9px] font-mono text-zinc-400 uppercase tracking-tighter">{editingItem.sku}</p>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Qty</Label>
                      <Input 
                        type="number"
                        className="h-11 rounded-lg border-zinc-100 bg-white"
                        value={editingItem.quantity}
                        onChange={e => onUpdate("quantity", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Pack Type</Label>
                      <Select value={editingItem.packType} onValueChange={(v) => onUpdate("packType", v)}>
                        <SelectTrigger className="h-11 rounded-lg border-zinc-100 bg-white uppercase text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="unit">UNIT / PCS</SelectItem>
                          <SelectItem value="doz">DOZEN (12 PCS)</SelectItem>
                          <SelectItem value="packet">PACKET</SelectItem>
                          <SelectItem value="case">CASE</SelectItem>
                          <SelectItem value="kg">KG</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                       <LandedCostFields 
                         product={{ 
                           id: editingItem.productId, 
                           units_per_packet: editingItem.unitsPerPacket, 
                           packets_per_case: editingItem.packetsPerCase,
                           pack_size_value: editingItem.pack_size_value,
                           pack_size_unit: editingItem.pack_size_unit,
                           mrp: editingItem.mrp,
                           unit_type: editingItem.unit_type
                         }}
                         packType={editingItem.packType}
                         qty={editingItem.quantity}
                         unitCost={editingItem.unitCost}
                         freightTotal={editingItem.freightTotal || 0}
                         handlingTotal={editingItem.handlingTotal || 0}
                         taxPct={editingItem.taxPct || 0}
                         onFreightChange={(v) => onUpdate("freightTotal", v)}
                         onHandlingChange={(v) => onUpdate("handlingTotal", v)}
                         onTaxChange={(v) => onUpdate("taxPct", v)}
                       />
                    </div>
                    <div className="space-y-1.5">
                       <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Expiry (MMYY)</Label>
                       <Input 
                         maxLength={4}
                         placeholder="0524"
                         className="h-11 rounded-lg border-zinc-100 bg-white"
                         value={editingItem.packedDate || ""}
                         onChange={e => {
                           const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                           onUpdate("packedDate", val);
                           if (val.length === 4) {
                             const exp = mmyyToIsoExpiryDate(addMonthsMMYY(val, 12));
                             if (exp) onUpdate("expiryDate", exp);
                           }
                         }}
                       />
                    </div>
                 </div>
                 <Button className="w-full bg-black text-white h-12 rounded-xl text-sm font-bold" onClick={onClose}>Update item</Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BulkImportWizard({ 
  open, 
  onOpenChange, 
  step, 
  setStep, 
  onFileUpload, 
  parsing, 
  onPasteExtract, 
  pendingItems,
  products,
  onProductCreated,
  onConfirm,
  supplierName,
  setSupplierName,
  supplierGstn,
  setSupplierGstn,
  companyId,
  setCompanyId,
  availableCompanies,
  warehouseId,
  setWarehouseId,
  availableWarehouses,
  totalWeight,
  avgProfit,
  totalFreight,
  totalHandling,
  onOpenCompanyModal,
  onOpenApiKeyModal
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: 1 | 2 | 3;
  setStep: (step: 1 | 2 | 3) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  parsing: boolean;
  onPasteExtract: (text: string) => Promise<void>;
  pendingItems: ExtractedItem[];
  products: Product[];
  onProductCreated: (p: Product) => void;
  onConfirm: (items: Omit<StockItem, "id">[]) => void;
  supplierName: string;
  setSupplierName: (name: string) => void;
  supplierGstn: string;
  setSupplierGstn: (gstn: string) => void;
  companyId: string | null;
  setCompanyId: (id: string | null) => void;
  availableCompanies: Company[];
  warehouseId?: string;
  setWarehouseId?: (id: string) => void;
  availableWarehouses?: Warehouse[];
  totalWeight: number;
  avgProfit: number;
  totalFreight: string;
  totalHandling: string;
  onOpenCompanyModal?: () => void;
  onOpenApiKeyModal?: () => void;
}) {
  const companies = availableCompanies || [];
  const [selectedBrandCode, setSelectedBrandCode] = useState<string>("DEFAULT");
  const [pastedText, setPastedText] = useState("");
  const [creatingProduct, setCreatingProduct] = useState<string | null>(null);
  const [autoCreating, setAutoCreating] = useState(false);
  const [mappings, setMappings] = useState<(ExtractedItem & { 
    matchedProduct: Product | null; 
    match_status: MatchStatus;
    match_score: number;
    suggestions: MatchResult['suggestions'];
    accepted?: boolean;
    id: string;
  })[]>([]);

  const brandButtons = useMemo(() => {
    const list = (availableCompanies || []).map(c => ({
      code: (c.short_code || c.name.slice(0, 3)).toUpperCase(),
      label: c.name
    }));
    list.push({ code: "DEFAULT", label: "Other / Gen" });
    return list;
  }, [availableCompanies]);

  // Sync selectedBrandCode when companyId changes or vice versa
  useEffect(() => {
    if (companyId) {
      const comp = availableCompanies.find(c => c.id === companyId);
      if (comp && comp.short_code) {
        setSelectedBrandCode(comp.short_code.toUpperCase());
      }
    }
  }, [companyId, availableCompanies]);

  const activeBrandRule = BRAND_VALIDATION_RULES[selectedBrandCode] || BRAND_VALIDATION_RULES.DEFAULT;

  const handleBrandSelect = (code: string) => {
    setSelectedBrandCode(code);
    const comp = availableCompanies.find(c => c.short_code?.toUpperCase() === code);
    if (comp) {
      setCompanyId(comp.id);
    }
  };

  useEffect(() => {
    if (step === 2 && pendingItems.length > 0) {
      const runMatching = async () => {
        const { nameMap, codeMap } = await getLearnedMap(supplierName || "");
        const normalizedCatalog = buildNormalizedCatalog(products);
        
        const initial = pendingItems.map((item) => {
          const extCode = (item.external_code || item.basepack_code || item.sku_code || "").trim().toUpperCase();
          const cleanItemName = item.sku_or_name.toLowerCase().trim();
          const inferredCat = item.category || inferTaxonomyCategory(item.sku_or_name, undefined, item.hsn);
          const inferredDiv = item.division || inferTaxonomyDivision(inferredCat || item.sku_or_name);
          
          let cgstVal = item.cgst_rate !== undefined ? item.cgst_rate : 0;
          let sgstVal = item.sgst_rate !== undefined ? item.sgst_rate : 0;
          let igstVal = item.igst_rate !== undefined ? item.igst_rate : 0;
          let gstVal = item.gst_rate !== undefined ? item.gst_rate : 0;

          // GST = CGST + SGST + IGST
          if (cgstVal > 0 && sgstVal > 0) {
            gstVal = cgstVal + sgstVal;
          } else if (cgstVal > 0 && sgstVal === 0 && igstVal === 0) {
            sgstVal = cgstVal;
            gstVal = cgstVal + sgstVal;
          } else if (sgstVal > 0 && cgstVal === 0 && igstVal === 0) {
            cgstVal = sgstVal;
            gstVal = cgstVal + sgstVal;
          } else if (igstVal > 0 && cgstVal === 0 && sgstVal === 0) {
            gstVal = igstVal;
          } else if (gstVal > 0 && cgstVal === 0 && sgstVal === 0 && igstVal === 0) {
            cgstVal = gstVal / 2;
            sgstVal = gstVal / 2;
            igstVal = gstVal;
          }

          const qty = Number(item.quantity) || 1;
          const cost = Number(item.cost_per_pack) || 0;
          const netVal = item.net_value !== undefined ? item.net_value : Number((qty * cost).toFixed(2));
          const taxAmt = item.tax_amount !== undefined ? item.tax_amount : Number((netVal * (gstVal / 100)).toFixed(2));
          const grossVal = item.gross_value !== undefined ? item.gross_value : Number((netVal + taxAmt).toFixed(2));

          const baseProps = {
            ...item,
            category: inferredCat,
            division: inferredDiv,
            gst_rate: gstVal,
            cgst_rate: cgstVal,
            sgst_rate: sgstVal,
            igst_rate: igstVal,
            net_value: netVal,
            tax_amount: taxAmt,
            gross_value: grossVal,
            cgst_amount: item.cgst_amount ?? (cgstVal > 0 ? Number((netVal * (cgstVal / 100)).toFixed(2)) : 0),
            sgst_amount: item.sgst_amount ?? (sgstVal > 0 ? Number((netVal * (sgstVal / 100)).toFixed(2)) : 0),
            igst_amount: item.igst_amount ?? (igstVal > 0 ? Number((netVal * (igstVal / 100)).toFixed(2)) : 0),
          };

          // 1. Check learned aliases from previous imports
          const normItemAlias = normalizeAliasKey(item.sku_or_name);
          const learnedByCode = extCode ? codeMap.get(extCode) : null;
          const learnedByName = nameMap.get(cleanItemName) || nameMap.get(normItemAlias);
          const learnedId = learnedByCode || learnedByName;
          const learnedProduct = learnedId ? products.find(p => p.id === learnedId) : null;

          if (learnedProduct) {
            return {
              ...baseProps,
              matchedProduct: learnedProduct,
              match_status: "MATCHED" as const,
              match_score: 500,
              suggestions: [],
              accepted: true,
              id: crypto.randomUUID()
            };
          }

          // 2. Check exact SKU / Barcode in catalog
          if (extCode) {
            const skuExact = products.find(p => p.sku && p.sku.toUpperCase().trim() === extCode);
            if (skuExact) {
              return {
                ...baseProps,
                matchedProduct: skuExact,
                match_status: "MATCHED" as const,
                match_score: 400,
                suggestions: [],
                accepted: true,
                id: crypto.randomUUID()
              };
            }
          }

          // 3. Check exact Product Name in catalog (or normalized alphanumeric equivalent)
          const nameExact = products.find(p => 
            p.name.toLowerCase().trim() === cleanItemName || 
            (normItemAlias.length > 3 && normalizeAliasKey(p.name) === normItemAlias)
          );
          if (nameExact) {
            return {
              ...baseProps,
              matchedProduct: nameExact,
              match_status: "MATCHED" as const,
              match_score: 350,
              suggestions: [],
              accepted: true,
              id: crypto.randomUUID()
            };
          }

          // 4. Run smart fuzzy matching algorithm
          const result = matchProduct(item.sku_or_name, normalizedCatalog);
          const matchedProd = result.matched_product ? products.find(p => p.id === result.matched_product?.id) || null : null;

          return { 
            ...baseProps, 
            matchedProduct: matchedProd, 
            match_status: result.match_status, 
            match_score: result.match_score, 
            suggestions: result.suggestions,
            accepted: result.match_status === "MATCHED" && !!matchedProd,
            id: crypto.randomUUID()
          };
        });
        setMappings(prev => {
          if (prev.length === initial.length && prev.some(m => m.match_status === 'MATCHED' && m.matchedProduct)) {
            return initial.map((item, idx) => {
              const existing = prev[idx];
              if (existing && existing.match_status === 'MATCHED' && existing.matchedProduct) {
                return existing;
              }
              return item;
            });
          }
          return initial;
        });
      };
      runMatching();
    }
  }, [step, pendingItems, products, supplierName]);

  const readyCount = mappings.filter(m => m.match_status === "MATCHED" && m.matchedProduct !== null).length;
  const unmappedCount = mappings.length - readyCount;

  const getProductSku = (itemRow: { sku_or_name: string; sku_code?: string; basepack_code?: string; external_code?: string }) => {
    if (itemRow.sku_code && itemRow.sku_code.trim().length >= 2) {
      return itemRow.sku_code.trim().toUpperCase();
    }
    if (itemRow.basepack_code && itemRow.basepack_code.trim().length >= 2) {
      return itemRow.basepack_code.trim().toUpperCase();
    }
    if (itemRow.external_code && itemRow.external_code.trim().length >= 2) {
      return itemRow.external_code.trim().toUpperCase();
    }
    const selectedCompany = companies.find(c => c.id === companyId);
    const compCode = selectedCompany?.short_code || activeBrandRule.companyShortCode || activeBrandRule.skuPrefix || supplierName;
    return ensureSku(null, itemRow.sku_or_name, compCode, activeBrandRule.name || supplierName);
  };

  const createSingleProduct = async (itemRow: typeof mappings[0]) => {
    setCreatingProduct(itemRow.id);
    try {
      const preferredSku = (itemRow.sku_code || itemRow.basepack_code || itemRow.external_code || "").trim().toUpperCase();
      const basepack = (itemRow.basepack_code || "").trim().toUpperCase();
      let cleanName = itemRow.sku_or_name ? itemRow.sku_or_name.trim() : "";
      
      const isPlaceholderName = !cleanName || ['unknown', 'unknown product', 'unknown item', 'null', 'undefined', 'n/a', 'na', 'item'].includes(cleanName.toLowerCase());
      if (isPlaceholderName) {
        const brandPrefix = activeBrandRule.name || supplierName || 'Bharat Masala';
        if (preferredSku) {
          cleanName = `${brandPrefix} Item [${preferredSku}]`;
        } else if (basepack) {
          cleanName = `${brandPrefix} Item [${basepack}]`;
        } else if (itemRow.category) {
          cleanName = `${brandPrefix} ${itemRow.category} ${itemRow.mrp ? `₹${itemRow.mrp}` : ''}`.trim();
        } else {
          cleanName = `${brandPrefix} New Product`;
        }
      }

      // Check if product already exists in memory or DB
      let targetProd: Product | null = products.find(p => 
        (preferredSku && p.sku?.toUpperCase() === preferredSku) || 
        (basepack && p.sku?.toUpperCase() === basepack) ||
        p.name.toLowerCase().trim() === cleanName.toLowerCase()
      ) || null;

      if (!targetProd) {
        const { data: dbExisting } = await supabase
          .from("products")
          .select("*")
          .or(`name.ilike.${cleanName}${preferredSku ? `,sku.eq.${preferredSku}` : ''}${basepack ? `,sku.eq.${basepack}` : ''}`)
          .limit(1)
          .maybeSingle();

        if (dbExisting) {
          targetProd = dbExisting as unknown as Product;
        }
      }

      const skuCandidate = preferredSku || basepack || getProductSku({ ...itemRow, sku_or_name: cleanName });
      const isDozen = itemRow.pack_type === "doz" || isProductDozenPackaging({ 
        name: cleanName, 
        hsn: itemRow.hsn, 
        sku: skuCandidate, 
        preferred_sell_unit: itemRow.pack_type 
      });
      const isKg = itemRow.pack_type === "kg";
      const costPerUnit = Number(itemRow.cost_per_pack) || 0;
      const baseCostPrice = isDozen ? Number((costPerUnit / 12).toFixed(4)) : costPerUnit;
      const calculatedMrp = itemRow.mrp || (isDozen ? Math.ceil((costPerUnit * 1.3) / 12) * 12 : Math.ceil(costPerUnit * 1.25));

      const itemCgst = itemRow.cgst_rate !== undefined ? itemRow.cgst_rate : 0;
      const itemSgst = itemRow.sgst_rate !== undefined ? itemRow.sgst_rate : 0;
      const itemIgst = itemRow.igst_rate !== undefined ? itemRow.igst_rate : 0;
      let itemGst = itemRow.gst_rate !== undefined ? itemRow.gst_rate : (targetProd?.gst_rate || 0);
      if (itemCgst > 0 && itemSgst > 0) {
        itemGst = itemCgst + itemSgst;
      } else if (itemIgst > 0 && itemGst === 0) {
        itemGst = itemIgst;
      } else if (itemGst === 0 && itemRow.hsn) {
        const hsnMatch = lookupHsnTaxonomy(itemRow.hsn);
        if (hsnMatch && hsnMatch.defaultGstRate) {
          itemGst = hsnMatch.defaultGstRate;
        }
      }

      const rawCategory = itemRow.category || inferTaxonomyCategory(cleanName, undefined, itemRow.hsn);
      const inferredCategory = normalizeDivisionCategory(rawCategory, cleanName, itemRow.hsn);
      const inferredDivision = itemRow.division || inferTaxonomyDivision(inferredCategory || cleanName);
      const inferredSub = inferSubCategory(cleanName, inferredCategory);

      let resolvedBrandName = activeBrandRule.name;
      if (!resolvedBrandName || resolvedBrandName === "General / Independent Brand" || resolvedBrandName === "General") {
        if (companyId) {
          const comp = companies.find(c => c.id === companyId);
          if (comp) resolvedBrandName = comp.name;
        }
        if ((!resolvedBrandName || resolvedBrandName === "General / Independent Brand" || resolvedBrandName === "General") && supplierName) {
          resolvedBrandName = supplierName;
        }
      }
      if (!resolvedBrandName || resolvedBrandName === "General / Independent Brand" || resolvedBrandName === "General") {
        const itemMatch = resolveCompany(supplierName || cleanName, companies, [{ sku_or_name: cleanName }]);
        if (itemMatch.company) {
          resolvedBrandName = itemMatch.company.name;
        } else if (isDozen || cleanName.toLowerCase().includes("madhukunj") || cleanName.toLowerCase().includes("mk ") || itemRow.hsn === "33074100" || cleanName.toLowerCase().includes("agarbatti") || cleanName.toLowerCase().includes("dhoop")) {
          resolvedBrandName = "Madhukunj";
        } else if (supplierName && supplierName.trim() && !["general", "unknown"].includes(supplierName.toLowerCase())) {
          resolvedBrandName = supplierName.trim();
        } else {
          resolvedBrandName = "Madhukunj";
        }
      }

      const resolvedCompId = companyId || targetProd?.company_id || (companies.find(c => c.name.toLowerCase() === (resolvedBrandName || "").toLowerCase() || c.short_code.toLowerCase() === (resolvedBrandName || "").toLowerCase())?.id);

      const prodPayload: Record<string, unknown> = {
        name: cleanName,
        sku: skuCandidate,
        mrp: calculatedMrp,
        selling_price: calculatedMrp,
        cost_price: baseCostPrice,
        units_per_packet: isDozen ? 12 : (itemRow.extracted_multipliers?.units_per_packet || 1),
        packets_per_case: itemRow.extracted_multipliers?.packets_per_case || 1,
        units_per_case: isDozen ? 12 : 1,
        item_pack_type: isDozen ? "pouch" : isKg ? "kg" : "packet",
        preferred_sell_unit: isDozen ? "doz" : isKg ? "kg" : "packet",
        unit: isDozen ? "doz" : isKg ? "kg" : "packet",
        unit_type: isKg ? "kg_g" : "pcs",
        division_category: inferredCategory,
        division: inferredDivision,
        sub_category: inferredSub || undefined,
        brand: resolvedBrandName,
        company_id: resolvedCompId || undefined,
        hsn: itemRow.hsn || targetProd?.hsn || (isDozen ? "33074100" : "09109929"),
        gst_rate: itemGst,
        cgst_rate: itemCgst || (itemGst > 0 ? itemGst / 2 : 0),
        sgst_rate: itemSgst || (itemGst > 0 ? itemGst / 2 : 0),
        igst_rate: itemIgst || itemGst,
        min_stock: 5,
        is_active: true
      };

      const { data: savedData, error: saveErr } = await persistProductToSupabase(
        prodPayload,
        targetProd?.id || undefined
      );

      if (saveErr) throw saveErr;
      if (savedData) {
        targetProd = savedData as unknown as Product;
      }

      if (targetProd) {
        onProductCreated(targetProd);
        if (preferredSku) {
          await recordCorrection(itemRow.sku_or_name, targetProd.id, supplierName || "", {
            externalCode: preferredSku,
            codeType: "SKU7",
            hsn: itemRow.hsn || targetProd.hsn || null
          });
        }
        if (basepack && basepack !== preferredSku) {
          await recordCorrection(itemRow.sku_or_name, targetProd.id, supplierName || "", {
            externalCode: basepack,
            codeType: "BASEPACK",
            hsn: itemRow.hsn || targetProd.hsn || null
          });
        }

        setMappings(prev => prev.map(m => m.id === itemRow.id ? {
          ...m,
          matchedProduct: targetProd,
          match_status: "MATCHED" as const,
          match_score: 500,
          accepted: true
        } : m));

        toast.success(`Created & linked: ${targetProd.name}`);
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(friendlyError(err));
    } finally {
      setCreatingProduct(null);
    }
  };

  const autoCreateAllUnmapped = async (proceedToReview = false) => {
    const unmapped = mappings.filter(m => m.match_status !== "MATCHED" || !m.matchedProduct);
    if (unmapped.length === 0) {
      if (proceedToReview) setStep(3);
      return;
    }

    setAutoCreating(true);
    const toastId = toast.loading(`Auto-creating ${unmapped.length} products with brand intelligence...`);
    try {
      const createdMappings = [...mappings];
      const sessionCreatedBySku = new Map<string, Product>();
      const sessionCreatedByName = new Map<string, Product>();

      for (const row of unmapped) {
        const preferredSku = (row.sku_code || row.basepack_code || row.external_code || "").trim().toUpperCase();
        const basepack = (row.basepack_code || "").trim().toUpperCase();
        let cleanName = row.sku_or_name ? row.sku_or_name.trim() : "";
        
        const isPlaceholderName = !cleanName || ['unknown', 'unknown product', 'unknown item', 'null', 'undefined', 'n/a', 'na', 'item'].includes(cleanName.toLowerCase());
        if (isPlaceholderName) {
          const brandPrefix = activeBrandRule.name || supplierName || 'Bharat Masala';
          if (preferredSku) {
            cleanName = `${brandPrefix} Item [${preferredSku}]`;
          } else if (basepack) {
            cleanName = `${brandPrefix} Item [${basepack}]`;
          } else if (row.category) {
            cleanName = `${brandPrefix} ${row.category} ${row.mrp ? `₹${row.mrp}` : ''}`.trim();
          } else {
            cleanName = `${brandPrefix} New Product`;
          }
        }

        const normName = cleanName.toLowerCase();

        // 1. Check session map first
        let targetProd: Product | null = 
          (preferredSku ? sessionCreatedBySku.get(preferredSku) : null) ||
          (basepack ? sessionCreatedBySku.get(basepack) : null) ||
          sessionCreatedByName.get(normName) ||
          null;

        // 2. Check props array
        if (!targetProd) {
          targetProd = products.find(p => 
            (preferredSku && p.sku?.toUpperCase() === preferredSku) || 
            (basepack && p.sku?.toUpperCase() === basepack) ||
            p.name.toLowerCase().trim() === normName
          ) || null;
        }

        // 3. Check DB
        if (!targetProd) {
          const { data: dbExisting } = await supabase
            .from("products")
            .select("*")
            .or(`name.ilike.${cleanName}${preferredSku ? `,sku.eq.${preferredSku}` : ''}${basepack ? `,sku.eq.${basepack}` : ''}`)
            .limit(1)
            .maybeSingle();

          if (dbExisting) {
            targetProd = dbExisting as unknown as Product;
          }
        }

        const skuCandidate = preferredSku || basepack || getProductSku({ ...row, sku_or_name: cleanName });
        const isDozen = row.pack_type === "doz";
        const isKg = row.pack_type === "kg";
        const costPerUnit = Number(row.cost_per_pack) || 0;
        const baseCostPrice = isDozen ? Number((costPerUnit / 12).toFixed(4)) : costPerUnit;
        const calculatedMrp = row.mrp || (isDozen ? Math.ceil((costPerUnit * 1.3) / 12) * 12 : Math.ceil(costPerUnit * 1.25));
        let rowGst = row.gst_rate !== undefined ? row.gst_rate : (targetProd?.gst_rate || 0);
        if (rowGst === 0 && row.hsn) {
          const hsnMatch = lookupHsnTaxonomy(row.hsn);
          if (hsnMatch && hsnMatch.defaultGstRate) {
            rowGst = hsnMatch.defaultGstRate;
          }
        }
        const rowCgst = row.cgst_rate !== undefined ? row.cgst_rate : (rowGst > 0 ? rowGst / 2 : 0);
        const rowSgst = row.sgst_rate !== undefined ? row.sgst_rate : (rowGst > 0 ? rowGst / 2 : 0);
        const rowIgst = row.igst_rate !== undefined ? row.igst_rate : rowGst;
        const rawCategory = row.category || inferTaxonomyCategory(cleanName, undefined, row.hsn);
        const inferredCategory = normalizeDivisionCategory(rawCategory, cleanName, row.hsn);
        const inferredDivision = row.division || inferTaxonomyDivision(inferredCategory || cleanName);
        const inferredSub = inferSubCategory(cleanName, inferredCategory);

        let resolvedBrandName = activeBrandRule.name;
        if (!resolvedBrandName || resolvedBrandName === "General / Independent Brand" || resolvedBrandName === "General") {
          if (companyId) {
            const comp = companies.find(c => c.id === companyId);
            if (comp) resolvedBrandName = comp.name;
          }
          if ((!resolvedBrandName || resolvedBrandName === "General / Independent Brand" || resolvedBrandName === "General") && supplierName) {
            resolvedBrandName = supplierName;
          }
        }
        if (!resolvedBrandName || resolvedBrandName === "General / Independent Brand" || resolvedBrandName === "General") {
          const itemMatch = resolveCompany(supplierName || cleanName, companies, [{ sku_or_name: cleanName }]);
          if (itemMatch.company) {
            resolvedBrandName = itemMatch.company.name;
          } else if (isDozen || cleanName.toLowerCase().includes("madhukunj") || cleanName.toLowerCase().includes("mk ") || row.hsn === "33074100" || cleanName.toLowerCase().includes("agarbatti") || cleanName.toLowerCase().includes("dhoop")) {
            resolvedBrandName = "Madhukunj";
          } else if (supplierName && supplierName.trim() && !["general", "unknown"].includes(supplierName.toLowerCase())) {
            resolvedBrandName = supplierName.trim();
          } else {
            resolvedBrandName = "Madhukunj";
          }
        }

        const resolvedCompId = companyId || targetProd?.company_id || (companies.find(c => c.name.toLowerCase() === (resolvedBrandName || "").toLowerCase() || c.short_code.toLowerCase() === (resolvedBrandName || "").toLowerCase())?.id);

        const newProdPayload: Record<string, unknown> = {
          name: cleanName,
          sku: skuCandidate,
          mrp: calculatedMrp,
          selling_price: calculatedMrp,
          cost_price: baseCostPrice,
          units_per_packet: isDozen ? 12 : (row.extracted_multipliers?.units_per_packet || 1),
          packets_per_case: row.extracted_multipliers?.packets_per_case || 1,
          units_per_case: isDozen ? 12 : 1,
          item_pack_type: isDozen ? "doz" : isKg ? "kg" : "packet",
          preferred_sell_unit: isDozen ? "doz" : isKg ? "kg" : "packet",
          unit: isDozen ? "doz" : isKg ? "kg" : "packet",
          unit_type: isKg ? "kg_g" : "pcs",
          division_category: inferredCategory,
          division: inferredDivision,
          sub_category: inferredSub || undefined,
          brand: resolvedBrandName,
          company_id: resolvedCompId || undefined,
          hsn: row.hsn || targetProd?.hsn || "33074100",
          gst_rate: rowGst,
          cgst_rate: rowCgst,
          sgst_rate: rowSgst,
          igst_rate: rowIgst,
          min_stock: 5,
          is_active: true
        };

        const { data: savedData, error: saveErr } = await persistProductToSupabase(
          newProdPayload,
          targetProd?.id || undefined
        );

        if (!saveErr && savedData) {
          targetProd = savedData as unknown as Product;
        }

        if (targetProd) {
          // Register in local session lookup
          if (targetProd.sku) sessionCreatedBySku.set(targetProd.sku.toUpperCase(), targetProd);
          if (preferredSku) sessionCreatedBySku.set(preferredSku, targetProd);
          if (basepack) sessionCreatedBySku.set(basepack, targetProd);
          sessionCreatedByName.set(normName, targetProd);

          onProductCreated(targetProd);
          if (preferredSku) {
            await recordCorrection(row.sku_or_name, targetProd.id, supplierName || "", {
              externalCode: preferredSku,
              codeType: "SKU7",
              hsn: row.hsn || targetProd.hsn || null
            });
          }
          if (basepack && basepack !== preferredSku) {
            await recordCorrection(row.sku_or_name, targetProd.id, supplierName || "", {
              externalCode: basepack,
              codeType: "BASEPACK",
              hsn: row.hsn || targetProd.hsn || null
            });
          }
          
          const idx = createdMappings.findIndex(m => m.id === row.id);
          if (idx !== -1) {
            createdMappings[idx] = {
              ...createdMappings[idx],
              matchedProduct: targetProd,
              match_status: "MATCHED" as const,
              match_score: 500,
              accepted: true
            };
          }
        }
      }

      setMappings(createdMappings);
      toast.success("All products auto-created & mapped", { id: toastId });
      if (proceedToReview) {
        setStep(3);
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setAutoCreating(false);
    }
  };

  const finalizeImport = async () => {
    const stockItems: Omit<StockItem, "id">[] = mappings
      .filter((m): m is (typeof m & { matchedProduct: Product }) => m.matchedProduct !== null && m.match_status === "MATCHED")
      .map(m => {
        const qty = Number(m.quantity) || 1;
        const rate = Number(m.cost_per_pack) || 0;
        const netVal = m.net_value !== undefined ? m.net_value : Number((qty * rate).toFixed(2));
        const effGst = m.gst_rate || m.matchedProduct!.gst_rate || 0;
        const taxVal = m.tax_amount !== undefined ? m.tax_amount : Number((netVal * (effGst / 100)).toFixed(2));
        const grossVal = m.gross_value !== undefined ? m.gross_value : Number((netVal + taxVal).toFixed(2));

        return {
          productId: m.matchedProduct!.id,
          name: m.matchedProduct!.name,
          sku: m.matchedProduct!.sku,
          quantity: qty,
          unitCost: rate,
          batchNumber: m.batch_number,
          packedDate: parseDateString(m.packed_date) || m.packed_date,
          expiryDate: parseDateString(m.expiry_date) || m.expiry_date || "",
          packType: m.pack_type || "unit",
          unitsPerPacket: m.extracted_multipliers?.units_per_packet || m.matchedProduct!.units_per_packet || (m.pack_type === "doz" ? 12 : 1),
          packetsPerCase: m.extracted_multipliers?.packets_per_case || m.matchedProduct!.packets_per_case || 1,
          external_code: m.external_code || m.basepack_code || m.sku_code,
          hsn: m.hsn || m.matchedProduct!.hsn || undefined,
          mrp: m.mrp || m.matchedProduct!.mrp,
          taxPct: effGst,
          cgstPct: m.cgst_rate,
          sgstPct: m.sgst_rate,
          igstPct: m.igst_rate,
          netValue: netVal,
          taxAmount: taxVal,
          grossValue: grossVal,
          cgstAmount: m.cgst_amount,
          sgstAmount: m.sgst_amount,
          igstAmount: m.igst_amount
        };
      });

    for (const m of mappings) {
      if (m.matchedProduct) {
        await recordCorrection(
          m.sku_or_name, 
          m.matchedProduct.id, 
          supplierName || "",
          {
            externalCode: m.external_code || m.basepack_code || m.sku_code || null,
            hsn: m.hsn || m.matchedProduct.hsn || null
          }
        );
      }
    }

    onConfirm(stockItems);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-t-0 p-0 shadow-2xl focus:outline-none">
        <div className="mx-auto max-w-[420px] lg:max-w-3xl pb-10">
          <SheetHeader className="p-4 border-b border-black/5 bg-zinc-50/70 backdrop-blur flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <SheetTitle className="text-xs font-bold tracking-widest uppercase text-zinc-700">
                Inward Smart Entry {step === 1 ? "— Brand & Document" : step === 2 ? `— Map & Validate (${readyCount}/${mappings.length})` : `— Review (${readyCount}/${mappings.length})`}
              </SheetTitle>
            </div>
            <div className="flex gap-1.5 items-center">
              {[1, 2, 3].map(s => (
                <div key={s} className={cn("h-1.5 w-6 rounded-full transition-all", step >= s ? "bg-black" : "bg-zinc-200")} />
              ))}
            </div>
          </SheetHeader>

          {step === 1 && (
            <div className="p-4 pt-5 space-y-5">
              {/* Brand Selection Card */}
              <div className="bg-white border border-black/5 rounded-2xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                    Select Brand / Principal Company
                  </Label>
                  <div className="flex items-center gap-1.5">
                    {onOpenCompanyModal && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50/80 rounded-md"
                        onClick={onOpenCompanyModal}
                      >
                        + Detect / Add Brand
                      </Button>
                    )}
                    <span className="text-[9px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-full">
                      {activeBrandRule.name}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {brandButtons.map(b => (
                    <button
                      key={b.code}
                      type="button"
                      onClick={() => handleBrandSelect(b.code)}
                      className={cn(
                        "p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between h-14",
                        selectedBrandCode === b.code
                          ? "border-blue-600 bg-blue-50/70 ring-1 ring-blue-600"
                          : "border-zinc-200 bg-zinc-50/50 hover:bg-zinc-100"
                      )}
                    >
                      <span className="text-[11px] font-black text-zinc-900 leading-none">{b.code === "DEFAULT" ? "GEN" : b.code}</span>
                      <span className="text-[9px] text-zinc-500 font-medium truncate">{b.label}</span>
                    </button>
                  ))}
                </div>

                {/* Brand Rule Indicator */}
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-[11px] space-y-1">
                  <div className="flex items-center gap-1.5 text-zinc-800 font-bold">
                    <span>Validation Profile:</span>
                    <span className="text-blue-700">{activeBrandRule.description}</span>
                  </div>
                  {selectedBrandCode === "HUL" && (
                    <p className="text-[10px] text-amber-800 font-medium">
                      ⚠️ HUL Requirements: <strong>Basepack Code</strong> (e.g. 68472910), <strong>SKU7 Code</strong> (e.g. BATW00A), <strong>HSN</strong>, and <strong>Product Name</strong> are mandatory. Non-product lines (xxxxx, totals) are auto-skipped.
                    </p>
                  )}
                </div>
              </div>

              {/* Warehouse & Supplier GSTIN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableWarehouses && availableWarehouses.length > 0 && setWarehouseId && (
                  <div className="bg-white border border-black/5 rounded-2xl p-3 shadow-xs space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-blue-600" />
                      Receiving Warehouse
                    </Label>
                    <Select value={warehouseId} onValueChange={setWarehouseId}>
                      <SelectTrigger className="h-9 text-xs font-bold rounded-xl border-zinc-200 bg-zinc-50/70">
                        <SelectValue placeholder="Select Warehouse" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {availableWarehouses.map(w => (
                          <SelectItem key={w.id} value={w.id} className="text-xs font-bold">
                            🏢 {w.name} {w.code ? `(${w.code})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="bg-white border border-black/5 rounded-2xl p-3 shadow-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                      Supplier GSTIN
                    </Label>
                    {supplierGstn && (
                      <span className={cn("text-[9px] px-1.5 py-0.2 rounded font-bold uppercase", isValidGSTIN(supplierGstn) ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50")}>
                        {isValidGSTIN(supplierGstn) ? "✓ Valid GSTIN" : "Check Format"}
                      </span>
                    )}
                  </div>
                  <Input 
                    value={supplierGstn} 
                    onChange={e => setSupplierGstn(e.target.value.toUpperCase())} 
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                    className="h-9 text-xs font-mono font-bold rounded-xl border-zinc-200 bg-zinc-50/70 uppercase"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pb-1 px-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-600">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  <span>Accepts PDF, JPG/PNG, Excel (.xlsx/.xls), and CSV</span>
                </div>
                {onOpenApiKeyModal && (
                  <button
                    type="button"
                    onClick={onOpenApiKeyModal}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50/80 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200/60 transition-colors"
                  >
                    <span>🔑 Setup Gemini Key</span>
                  </button>
                )}
              </div>

              <Tabs defaultValue="upload">
                <TabsList className="grid w-full grid-cols-3 h-11 bg-zinc-100 rounded-xl p-1 mb-4">
                  <TabsTrigger value="upload" className="text-[11px] font-bold uppercase transition-all">Upload File</TabsTrigger>
                  <TabsTrigger value="snap" className="text-[11px] font-bold uppercase transition-all">Camera Snap</TabsTrigger>
                  <TabsTrigger value="paste" className="text-[11px] font-bold uppercase transition-all">Paste Text</TabsTrigger>
                </TabsList>
                <TabsContent value="upload">
                   <div 
                    className="border-2 border-dashed border-zinc-200 hover:border-blue-400 bg-zinc-50/50 hover:bg-blue-50/20 transition-all rounded-2xl p-10 flex flex-col items-center justify-center text-center group cursor-pointer"
                    onClick={() => document.getElementById("bulk-upload-file")?.click()}
                  >
                    <Upload className="h-10 w-10 text-zinc-300 group-hover:text-blue-500 transition-colors mb-3" />
                    <p className="text-sm font-bold text-zinc-900 leading-none uppercase">PDF / Image / Excel / CSV</p>
                    <p className="text-[10px] text-zinc-400 font-medium mt-1.5">Intelligently parses HUL Basepack, SKU7, HSN, Tax % (CGST/SGST/IGST)</p>
                    <input id="bulk-upload-file" type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv" onChange={onFileUpload} />
                  </div>
                </TabsContent>
                <TabsContent value="snap">
                   <div 
                    className="border-2 border-dashed border-zinc-200 hover:border-blue-400 bg-zinc-50/50 hover:bg-blue-50/20 transition-all rounded-2xl p-10 flex flex-col items-center justify-center text-center group cursor-pointer"
                    onClick={() => document.getElementById("bulk-snap-file")?.click()}
                  >
                    <Camera className="h-10 w-10 text-zinc-300 group-hover:text-blue-500 transition-colors mb-3" strokeWidth={1.5} />
                    <p className="text-sm font-bold text-zinc-900 leading-none uppercase">Snap Physical Bill</p>
                    <p className="text-[10px] text-zinc-400 font-medium mt-1.5">Take a direct photo using your device camera</p>
                    <input id="bulk-snap-file" type="file" className="hidden" accept="image/*" capture="environment" onChange={onFileUpload} />
                  </div>
                </TabsContent>
                <TabsContent value="paste" className="space-y-4">
                  <textarea 
                    className="w-full h-40 bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-black placeholder:text-zinc-400"
                    placeholder="Paste bill text (e.g. Basepack 68472910 SKU7 BATW00A LIFEBUOY 125G @ 34.00, CGST 9% SGST 9%)..."
                    value={pastedText}
                    onChange={e => setPastedText(e.target.value)}
                  />
                  <Button className="w-full bg-black text-white h-12 rounded-xl text-sm font-bold gap-2" onClick={() => onPasteExtract(pastedText)} disabled={parsing || !pastedText.trim()}>
                    {parsing ? <Loader2 className="animate-spin h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    Extract with Smart AI
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col h-[74vh]">
              {unmappedCount > 0 ? (
                <div className="bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border border-blue-200/90 rounded-2xl p-3.5 mx-4 mt-2 mb-1 flex items-center justify-between gap-3 shadow-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-blue-950 flex items-center gap-1.5 truncate">
                        <Sparkles className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                        Brand: {activeBrandRule.name} ({activeBrandRule.companyShortCode || "GEN"})
                      </p>
                      {onOpenCompanyModal && (
                        <button
                          type="button"
                          onClick={onOpenCompanyModal}
                          className="text-[10px] text-blue-600 underline font-bold hover:text-blue-800 shrink-0"
                        >
                          Change
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-blue-700/90 mt-0.5">
                      {unmappedCount} new products will auto-catalog with taxonomy, GST & unique codes.
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    className="h-8 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl gap-1.5 shrink-0 shadow-sm"
                    onClick={() => autoCreateAllUnmapped(false)}
                    disabled={autoCreating}
                  >
                    {autoCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    Auto-Create All ({unmappedCount})
                  </Button>
                </div>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mx-4 mt-2 mb-1 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-emerald-950 flex items-center gap-1.5 truncate">
                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    All {mappings.length} items mapped to Brand: {activeBrandRule.name}
                  </p>
                  {onOpenCompanyModal && (
                    <button
                      type="button"
                      onClick={onOpenCompanyModal}
                      className="text-[10px] text-emerald-700 underline font-bold hover:text-emerald-900 shrink-0"
                    >
                      Change Brand
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3 pt-2">
                {mappings.map((m) => {
                  const isMatched = m.match_status === "MATCHED" && m.matchedProduct !== null;
                  const isCreatingThis = creatingProduct === m.id;
                  const lineTotal = (Number(m.quantity) || 0) * (Number(m.cost_per_pack) || 0);

                  const validation = validateItemForBrand(selectedBrandCode, {
                    sku_or_name: m.sku_or_name,
                    basepack_code: m.basepack_code,
                    sku_code: m.sku_code,
                    external_code: m.external_code,
                    hsn: m.hsn
                  });

                  return (
                    <div key={m.id} className={cn(
                      "p-3.5 bg-white rounded-xl border transition-all shadow-sm space-y-2.5",
                      !validation.isValid ? "border-amber-300 bg-amber-50/10" : isMatched ? "border-emerald-200/70" : "border-zinc-200"
                    )}>
                      <div className="flex justify-between items-start">
                         <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-2">
                               <p className="text-[12px] font-black text-zinc-900 uppercase leading-snug">{m.sku_or_name}</p>
                              {isMatched ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] h-4 font-bold uppercase">Matched</Badge>
                              ) : (
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] h-4 font-bold uppercase">Unmapped</Badge>
                              )}
                              {!validation.isValid && (
                                <Badge className="bg-red-50 text-red-700 border-red-200 text-[9px] h-4 font-bold uppercase flex items-center gap-1">
                                  <AlertTriangle className="h-2.5 w-2.5" /> Missing {validation.missingFields.join(", ")}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {(m.sku_code || m.external_code) && (
                                <span className="inline-flex items-center text-[10px] font-mono font-bold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                                  SKU: {m.sku_code || m.external_code}
                                </span>
                              )}
                              {m.basepack_code && m.basepack_code !== m.sku_code && (
                                <span className="inline-flex items-center text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-150">
                                  Basepack: {m.basepack_code}
                                </span>
                              )}
                              {(m.category || m.division) && (
                                <span className="inline-flex items-center text-[10px] font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                  Cat: {m.category || m.division}
                                </span>
                              )}
                              {m.batch_number && (
                                <span className="inline-flex items-center text-[10px] font-mono font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  Batch: {m.batch_number}
                                </span>
                              )}
                              {m.expiry_date && (
                                <span className="inline-flex items-center text-[10px] font-mono font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                  PKM/Exp: {m.expiry_date}
                                </span>
                              )}
                              {m.hsn && (
                                <span className="inline-flex items-center text-[10px] font-mono text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200">
                                  HSN: {m.hsn}
                                </span>
                              )}
                              <span className={cn(
                                "inline-flex items-center text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border",
                                m.gst_rate && m.gst_rate > 0 
                                  ? "text-emerald-700 bg-emerald-50 border-emerald-200" 
                                  : "text-zinc-500 bg-zinc-50 border-zinc-200"
                              )}>
                                {m.gst_rate && m.gst_rate > 0 ? (
                                  (m.cgst_rate && m.sgst_rate) 
                                    ? `GST ${m.gst_rate}% (CGST ${m.cgst_rate}% + SGST ${m.sgst_rate}%)` 
                                    : m.igst_rate 
                                      ? `GST ${m.gst_rate}% (IGST ${m.igst_rate}%)` 
                                      : `GST ${m.gst_rate}%`
                                ) : "GST 0%"}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-zinc-600 mt-2 bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                              <span>Qty: <strong className="text-zinc-900">{m.quantity} {m.pack_type?.toUpperCase() || ''}</strong></span>
                              <span>Rate: <strong className="text-zinc-900">{fmtINR(m.cost_per_pack)}</strong></span>
                              <span>Net: <strong className="text-zinc-900">{fmtINR(m.net_value ?? ((Number(m.quantity) || 1) * (Number(m.cost_per_pack) || 0)))}</strong></span>
                              {((m.tax_amount && m.tax_amount > 0) || (m.gst_rate && m.gst_rate > 0)) && (
                                <span>Tax: <strong className="text-amber-700 font-semibold">+{fmtINR(m.tax_amount ?? (((Number(m.quantity) || 1) * (Number(m.cost_per_pack) || 0)) * ((m.gst_rate || 0) / 100)))}</strong></span>
                              )}
                              <span>Gross: <strong className="text-blue-700 font-bold">{fmtINR(m.gross_value ?? (((Number(m.quantity) || 1) * (Number(m.cost_per_pack) || 0)) + (m.tax_amount || 0)))}</strong></span>
                            </div>
                         </div>
                         
                         {!isMatched && (
                           <Button
                             size="sm"
                             variant="outline"
                             className="h-8 px-2.5 text-[10px] font-bold text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100 rounded-lg shrink-0 gap-1"
                             onClick={() => createSingleProduct(m)}
                             disabled={isCreatingThis}
                           >
                             {isCreatingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                             Create
                           </Button>
                         )}
                      </div>

                      {/* Inline quick-edit for codes if missing */}
                      {!validation.isValid && (
                        <div className="grid grid-cols-3 gap-2 bg-amber-50/50 p-2 rounded-lg border border-amber-200 text-xs">
                          <div>
                            <Label className="text-[9px] font-bold text-zinc-500 uppercase">Basepack Code</Label>
                            <Input 
                              value={m.basepack_code || ""} 
                              onChange={e => setMappings(prev => prev.map(mm => mm.id === m.id ? { ...mm, basepack_code: e.target.value } : mm))}
                              placeholder="e.g. 68472910"
                              className="h-7 text-[11px] font-mono bg-white"
                            />
                          </div>
                          <div>
                            <Label className="text-[9px] font-bold text-zinc-500 uppercase">SKU7 Code</Label>
                            <Input 
                              value={m.sku_code || ""} 
                              onChange={e => setMappings(prev => prev.map(mm => mm.id === m.id ? { ...mm, sku_code: e.target.value } : mm))}
                              placeholder="e.g. BATW00A"
                              className="h-7 text-[11px] font-mono bg-white"
                            />
                          </div>
                          <div>
                            <Label className="text-[9px] font-bold text-zinc-500 uppercase">HSN Code</Label>
                            <Input 
                              value={m.hsn || ""} 
                              onChange={e => setMappings(prev => prev.map(mm => mm.id === m.id ? { ...mm, hsn: e.target.value } : mm))}
                              placeholder="e.g. 34011190"
                              className="h-7 text-[11px] font-mono bg-white"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-100 items-center">
                        <div className="col-span-2">
                          <ProductMappingCombobox
                            products={products}
                            selectedProduct={m.matchedProduct}
                            suggestedProducts={m.suggestions}
                            onSelect={(p) => {
                              setMappings(prev => prev.map(mm => mm.id === m.id ? { 
                                ...mm, 
                                matchedProduct: p, 
                                match_status: p ? "MATCHED" : "UNMATCHED",
                                accepted: !!p
                              } : mm));
                            }}
                          />
                        </div>

                        <div>
                          <Select value={m.pack_type || "unit"} onValueChange={(v) => {
                            setMappings(prev => prev.map(mm => mm.id === m.id ? { ...mm, pack_type: v as PackType } : mm));
                          }}>
                            <SelectTrigger className="h-9 rounded-lg text-[11px] font-bold uppercase bg-zinc-50 border-zinc-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="doz" className="text-[11px] font-bold">DOZ (12 Pcs)</SelectItem>
                              <SelectItem value="unit" className="text-[11px] font-bold">UNIT / PCS</SelectItem>
                              <SelectItem value="packet" className="text-[11px] font-bold">PACKET</SelectItem>
                              <SelectItem value="case" className="text-[11px] font-bold">CASE</SelectItem>
                              <SelectItem value="kg" className="text-[11px] font-bold">KG</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <footer className="absolute bottom-0 left-0 w-full bg-white border-t p-4 flex gap-3 shadow-lg">
                <Button variant="outline" className="flex-1 rounded-xl h-11 text-[13px] font-bold" onClick={() => setStep(1)}>Back</Button>
                {readyCount === 0 && unmappedCount > 0 ? (
                  <Button 
                    className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-xl text-[13px] font-bold gap-2 shadow-md" 
                    onClick={() => autoCreateAllUnmapped(true)}
                    disabled={autoCreating}
                  >
                    {autoCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Auto-Create & Review All ({mappings.length})
                  </Button>
                ) : (
                  <Button 
                    className="flex-[2] bg-black text-white h-11 rounded-xl text-[13px] font-bold" 
                    onClick={() => setStep(3)}
                  >
                    Review {readyCount} / {mappings.length} items
                  </Button>
                )}
              </footer>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col h-[74vh]">
              {readyCount === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="h-14 w-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
                    <AlertCircle className="h-7 w-7" />
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <p className="text-sm font-black uppercase tracking-tight text-zinc-900">0 of {mappings.length} Items Mapped</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      All {mappings.length} items from this invoice are new to your product catalog. Click below to auto-create them and stage immediately into GRN.
                    </p>
                  </div>
                  <Button 
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-11 px-6 rounded-xl gap-2 shadow-md"
                    onClick={() => autoCreateAllUnmapped(false)}
                    disabled={autoCreating}
                  >
                    {autoCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Auto-Create All {mappings.length} Products Now
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
                  {availableWarehouses && availableWarehouses.length > 0 && (
                    <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-2.5 flex items-center justify-between text-xs">
                      <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-1.5 uppercase">
                        <Building2 className="h-3.5 w-3.5 text-blue-600" />
                        Target Warehouse:
                      </span>
                      <span className="font-bold text-zinc-900 bg-white px-2.5 py-1 rounded-lg border border-zinc-200 shadow-2xs">
                        🏢 {availableWarehouses.find(w => w.id === warehouseId)?.name || 'Default Warehouse'}
                      </span>
                    </div>
                  )}

                  {mappings.filter(m => m.match_status === "MATCHED" && m.matchedProduct !== null).map((m) => {
                    const isDozen = m.pack_type === "doz";
                    const totalPcs = isDozen ? (m.quantity || 1) * 12 : (m.quantity || 1);
                    const costPerPc = isDozen ? (m.cost_per_pack || 0) / 12 : (m.cost_per_pack || 0);
                    const qty = m.quantity || 1;
                    const rate = m.cost_per_pack || 0;
                    const netVal = m.net_value !== undefined ? m.net_value : (qty * rate);
                    const effGst = m.gst_rate || m.matchedProduct?.gst_rate || 0;
                    const taxVal = m.tax_amount !== undefined ? m.tax_amount : (netVal * (effGst / 100));
                    const grossVal = m.gross_value !== undefined ? m.gross_value : (netVal + taxVal);

                    return (
                       <div key={m.id} className="p-3.5 bg-white border border-black/5 rounded-xl space-y-2 shadow-sm">
                          <div className="flex justify-between items-start">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-bold text-zinc-900 leading-tight uppercase">{m.matchedProduct?.name}</p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {(m.matchedProduct?.sku || m.sku_code || m.external_code) && (
                                  <span className="inline-flex items-center text-[10px] font-mono font-bold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                                    SKU: {m.matchedProduct?.sku || m.sku_code || m.external_code}
                                  </span>
                                )}
                                {m.basepack_code && m.basepack_code !== (m.matchedProduct?.sku || m.sku_code) && (
                                  <span className="inline-flex items-center text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-150">
                                    Basepack: {m.basepack_code}
                                  </span>
                                )}
                                {(m.matchedProduct?.division_category || m.category || m.division) && (
                                  <span className="inline-flex items-center text-[10px] font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                    Cat: {m.matchedProduct?.division_category || m.category || m.division}
                                  </span>
                                )}
                                {m.batch_number && (
                                  <span className="inline-flex items-center text-[10px] font-mono font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    Batch: {m.batch_number}
                                  </span>
                                )}
                                {m.expiry_date && (
                                  <span className="inline-flex items-center text-[10px] font-mono font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                    PKM/Exp: {m.expiry_date}
                                  </span>
                                )}
                                {(m.matchedProduct?.hsn || m.hsn) && (
                                  <span className="inline-flex items-center text-[10px] font-mono text-zinc-500 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-200">
                                    HSN: {m.matchedProduct?.hsn || m.hsn}
                                  </span>
                                )}
                                <span className={cn(
                                  "inline-flex items-center text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border",
                                  effGst > 0
                                    ? "text-emerald-700 bg-emerald-50 border-emerald-200" 
                                    : "text-zinc-500 bg-zinc-50 border-zinc-200"
                                )}>
                                  {effGst > 0 ? (
                                    (m.cgst_rate && m.sgst_rate) 
                                      ? `GST ${effGst}% (CGST ${m.cgst_rate}% + SGST ${m.sgst_rate}%)` 
                                      : `GST ${effGst}%`
                                  ) : "GST 0%"}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[13px] font-black text-zinc-900">{fmtINR(grossVal)}</p>
                              {taxVal > 0 && <span className="text-[10px] font-mono text-zinc-400">Net {fmtINR(netVal)}</span>}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-zinc-600 bg-zinc-50 p-2.5 rounded-lg border border-zinc-100 gap-2">
                            <span>
                              <strong>{m.quantity} {m.pack_type?.toUpperCase()}</strong>
                              {isDozen && <span className="text-blue-600 font-bold ml-1.5">(= {totalPcs} pcs)</span>}
                            </span>
                            <span>
                              @ {fmtINR(m.cost_per_pack)}/{m.pack_type}
                              {isDozen && <span className="text-zinc-400 ml-1">(≈ ₹{costPerPc.toFixed(2)}/pc)</span>}
                            </span>
                            {taxVal > 0 && (
                              <span className="text-amber-700">Tax: +{fmtINR(taxVal)}</span>
                            )}
                          </div>
                       </div>
                    );
                  })}
                </div>
              )}

              <footer className="absolute bottom-0 left-0 w-full bg-white border-t p-4 flex gap-3 shadow-lg">
                <Button variant="outline" className="flex-1 rounded-xl h-11 text-[13px] font-bold" onClick={() => setStep(2)}>
                  Back to Mapping
                </Button>
                {readyCount > 0 ? (
                  <Button className="flex-[2] bg-black text-white h-11 rounded-xl text-[13px] font-bold shadow-md" onClick={finalizeImport}>
                    Confirm & Stage {readyCount} Items
                  </Button>
                ) : (
                  <Button 
                    className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-xl text-[13px] font-bold shadow-md"
                    onClick={() => autoCreateAllUnmapped(false)}
                    disabled={autoCreating}
                  >
                    {autoCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Auto-Create & Stage All
                  </Button>
                )}
              </footer>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
