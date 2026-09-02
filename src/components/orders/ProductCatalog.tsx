import { toast } from "sonner";
import { useState, useMemo, useEffect } from "react";
import { Search, Plus, X, Loader2, Filter, ShoppingBag, Check, Sparkles, Calendar, Building2, Tag, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtINR, formatDivisionCategory, statusColor, statusLabel } from "@/lib/format";
import { resolveDisplayUnit } from "@/lib/unitLabel";
import { resolveCompanyInfo, resolveProductDivisionCategory } from "@/lib/company-helpers";
import { Batch, Product, Line, Shop, NewOrderPackType } from "@/types";
import { useRecommendedBatches } from "@/hooks/useRecommendedBatches";
import { useIsCompact } from "@/lib/responsive";
import { Badge } from "@/components/ui/badge";
import { ResponsiveGrid } from "@/components/ui/responsive-ui";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "motion/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ProductCatalogProps {
  warehouseId: string;
  lines: Line[];
  onAdd: (p: Product, b?: Batch & { isFifoPriority?: boolean }) => void;
  onRemove: (productId: string, batchId?: string) => void;
  onUpdateQty: (productId: string, qty: number, batchId?: string) => void;
  onUpdatePackType: (productId: string, packType: NewOrderPackType, batchId?: string) => void;
  onUpdatePrice: (productId: string, price: number, batchId?: string) => void;
  resolvePrice: (p: Product) => { price: number; source: string };
  totals: { subtotal: number; total: number };
  onClose?: () => void;
  onViewReview?: () => void;
  className?: string;
  isSheet?: boolean;
  isEditing?: boolean;
  shop?: Shop;
  orderNumber?: string;
  status?: string;
  orderDate?: string;
  onUpdateDate?: (date: string) => void;
}

export const ProductCatalog = ({
  warehouseId,
  lines,
  onAdd,
  onRemove,
  onUpdateQty,
  onUpdatePackType,
  onUpdatePrice,
  resolvePrice,
  totals,
  onClose,
  onViewReview,
  className,
  isSheet = false,
  isEditing = false,
  shop,
  orderNumber,
  status,
  orderDate,
  onUpdateDate
}: ProductCatalogProps) => {
  const isCompact = useIsCompact();
  const [prodQ, setProdQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Dual-dimension filtering: Company and Category/Division
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>("All");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("All");
  const [quickFilterMode, setQuickFilterMode] = useState<"category" | "company">("category");
  const [popoverTab, setPopoverTab] = useState<"category" | "company" | "sort">("category");
  const [sortBy, setSortBy] = useState<"margin" | "newest" | "alphabetical">("alphabetical");

  // Keep a stable record of batch details we've seen
  const [batchCache, setBatchCache] = useState<Record<string, Batch>>({});

  // Debounce search and manage suggestions visibility
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(prodQ);
      setShowSuggestions(prodQ.length > 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [prodQ]);

  const {
    data: batchData,
    isLoading: isBatchesLoading
  } = useRecommendedBatches(warehouseId, debouncedQ, !warehouseId || warehouseId === "all" || warehouseId !== "null");

  const isLoading = isBatchesLoading;

  const batches = useMemo(() => {
    const fetched = batchData?.pages.flatMap(page => page.data) ?? [];
    return fetched;
  }, [batchData]);

  // Update cache whenever we see new batches
  useEffect(() => {
    if (batches.length > 0) {
      setBatchCache(prev => {
        const next = { ...prev };
        batches.forEach(b => {
          if (b.id) next[b.id] = b;
        });
        return next;
      });
    }
  }, [batches]);

  // Group search suggestions by product ID to avoid duplicate products in the search dropdown
  interface GroupedBatchItem {
    id: string;
    product_id: string;
    batch_number: string | null;
    expiry_date: string | null;
    remaining_qty: number;
    product: Product | null;
    primaryBatch: Batch;
    isFifoPriority?: boolean;
    companyInfo?: { id: string; name: string; short_code: string; accent_hex: string };
    categoryName?: string;
  }

  const groupedSuggestions = useMemo(() => {
    const map = new Map<string, GroupedBatchItem>();
    batches.forEach(b => {
      if (!b || !b.product_id || !b.product) return;
      const prodId = b.product_id;
      if (!map.has(prodId)) {
        const comp = resolveCompanyInfo(b.product);
        const cat = resolveProductDivisionCategory(b.product);
        map.set(prodId, {
          id: prodId,
          product_id: prodId,
          batch_number: b.batch_number,
          expiry_date: b.expiry_date,
          remaining_qty: 0,
          product: b.product,
          primaryBatch: b,
          companyInfo: comp,
          categoryName: cat
        });
      }
      
      const item = map.get(prodId)!;
      item.remaining_qty += (b.remaining_qty || 0);
      
      // Keep the one with earliest expiry date
      const currentExpiry = item.expiry_date || "9999-12-31";
      const bExpiry = b.expiry_date || "9999-12-31";
      if (bExpiry < currentExpiry) {
        item.expiry_date = b.expiry_date;
        item.batch_number = b.batch_number;
        item.primaryBatch = b;
      }
    });
    return Array.from(map.values()).map(item => ({
      ...item,
      primaryBatch: {
        ...item.primaryBatch,
        remaining_qty: item.remaining_qty
      }
    }));
  }, [batches]);

  // All unique available products (combining warehouse stock & cart items)
  const allAvailableProducts = useMemo(() => {
    const map = new Map<string, Product>();

    // From warehouse batches with positive stock
    batches.forEach(b => {
      if (b && b.product_id && b.product && (b.remaining_qty || 0) > 0) {
        if (!map.has(b.product_id)) {
          map.set(b.product_id, b.product);
        }
      }
    });

    // From active cart lines
    lines.forEach(l => {
      if (!l.isRemoved && l.product_id) {
        if (!map.has(l.product_id)) {
          map.set(l.product_id, {
            id: l.product_id,
            name: l.name,
            sku: l.sku,
            mrp: l.mrp,
            division_category: l.division_category,
            brand: l.brand,
            company_id: l.company_id
          } as Product);
        }
      }
    });

    return Array.from(map.values());
  }, [batches, lines]);

  // All unique available categories with item count
  const categoriesListWithCounts = useMemo(() => {
    const catMap = new Map<string, number>();

    allAvailableProducts.forEach(prod => {
      const cat = resolveProductDivisionCategory(prod);
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    });

    const entries = Array.from(catMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return [
      { name: "All", count: allAvailableProducts.length },
      ...entries.map(([name, count]) => ({ name, count }))
    ];
  }, [allAvailableProducts]);

  // All unique available companies with item count & metadata
  const companiesListWithCounts = useMemo(() => {
    const compMap = new Map<string, { company: { id: string; name: string; short_code: string; accent_hex: string }; count: number }>();

    allAvailableProducts.forEach(prod => {
      const comp = resolveCompanyInfo(prod);
      const key = comp.name;
      if (!compMap.has(key)) {
        compMap.set(key, { company: comp, count: 0 });
      }
      compMap.get(key)!.count += 1;
    });

    const entries = Array.from(compMap.values()).sort((a, b) => a.company.name.localeCompare(b.company.name));
    return [
      { 
        company: { id: "all", name: "All", short_code: "ALL", accent_hex: "#6366F1" }, 
        count: allAvailableProducts.length 
      },
      ...entries
    ];
  }, [allAvailableProducts]);

  // The "Main List" shows all unique products, aggregating stock across their active batches
  const filteredBatches = useMemo(() => {
    // 1. Group all warehouse batches by product_id
    const batchesByProduct = new Map<string, Batch[]>();
    batches.forEach(b => {
      if (!b || !b.product_id || !b.product) return;
      if (!batchesByProduct.has(b.product_id)) {
        batchesByProduct.set(b.product_id, []);
      }
      batchesByProduct.get(b.product_id)!.push(b);
    });

    // 2. Map cart lines to find added product quantities
    const cartLines = lines.filter(l => !l.isRemoved);
    const cartQtyByProduct = new Map<string, number>();
    cartLines.forEach(l => {
      cartQtyByProduct.set(l.product_id, (cartQtyByProduct.get(l.product_id) || 0) + l.quantity);
    });

    // 3. For each product, build a single card item
    const productCardsMap = new Map<string, GroupedBatchItem>();

    // Process all warehouse batches
    batchesByProduct.forEach((productBatches, prodId) => {
      // Sort batches by expiry date ascending to ensure FIFO order
      const sortedBatches = [...productBatches].sort((a, b) => {
        const dateA = a.expiry_date || "9999-12-31";
        const dateB = b.expiry_date || "9999-12-31";
        return dateA.localeCompare(dateB);
      });

      const primaryBatch = sortedBatches[0];
      const totalStock = sortedBatches.reduce((sum, b) => sum + (b.remaining_qty || 0), 0);

      // Include product if there is positive stock or if it's currently in the cart
      if (totalStock > 0 || cartQtyByProduct.has(prodId)) {
        const product = primaryBatch.product!;
        const comp = resolveCompanyInfo(product);
        const cat = resolveProductDivisionCategory(product);
        
        // Apply Company filter
        if (selectedCompanyFilter !== "All") {
          if (comp.name !== selectedCompanyFilter && comp.short_code !== selectedCompanyFilter) {
            return;
          }
        }

        // Apply Category/Division filter
        if (selectedCategoryFilter !== "All") {
          if (cat !== selectedCategoryFilter) {
            return;
          }
        }

        productCardsMap.set(prodId, {
          id: prodId,
          primary_batch_id: primaryBatch.id,
          batch_number: primaryBatch.batch_number,
          product_id: prodId,
          expiry_date: primaryBatch.expiry_date,
          remaining_qty: totalStock,
          product: product,
          isFifoPriority: true,
          companyInfo: comp,
          categoryName: cat,
          primaryBatch: {
            ...primaryBatch,
            remaining_qty: totalStock
          }
        });
      }
    });

    // Reconstruct cart products that might not have active warehouse batches
    cartLines.forEach(line => {
      if (!productCardsMap.has(line.product_id)) {
        const cached = line.batch_id ? batchCache[line.batch_id] : null;
        const product = {
          id: line.product_id,
          name: line.name,
          sku: line.sku,
          mrp: line.mrp,
          division_category: line.division_category || "",
          unit_type: line.unit_type,
          pack_size_value: line.pack_size_value,
          pack_size_unit: line.pack_size_unit,
          units_per_packet: line.units_per_packet || 1,
          packets_per_case: line.packets_per_case || 1,
          units_per_case: line.units_per_case || 1,
          item_pack_type: line.item_pack_type || "",
          company_id: line.company_id,
          brand: line.brand
        } as Product;

        const comp = resolveCompanyInfo(product);
        const cat = resolveProductDivisionCategory(product);

        if (selectedCompanyFilter !== "All") {
          if (comp.name !== selectedCompanyFilter && comp.short_code !== selectedCompanyFilter) {
            return;
          }
        }

        if (selectedCategoryFilter !== "All") {
          if (cat !== selectedCategoryFilter) {
            return;
          }
        }

        productCardsMap.set(line.product_id, {
          id: line.product_id,
          primary_batch_id: line.batch_id || line.product_id,
          batch_number: line.batch_number || line.sku || "N/A",
          product_id: line.product_id,
          expiry_date: cached?.expiry_date || "N/A",
          remaining_qty: line.stock,
          product: product,
          isFifoPriority: true,
          companyInfo: comp,
          categoryName: cat,
          primaryBatch: cached || {
            id: line.batch_id || line.product_id,
            batch_number: line.batch_number || "N/A",
            expiry_date: cached?.expiry_date || "N/A",
            remaining_qty: line.stock,
            product_id: line.product_id,
            warehouse_id: warehouseId,
            product: product
          }
        });
      }
    });

    const combined = Array.from(productCardsMap.values());

    // Apply selected sorting criteria
    if (sortBy === "alphabetical") {
      combined.sort((a, b) => (a.product?.name || "").localeCompare(b.product?.name || ""));
    } else if (sortBy === "margin") {
      combined.sort((a, b) => (b.product?.mrp || 0) - (a.product?.mrp || 0));
    } else if (sortBy === "newest") {
      combined.sort((a, b) => {
        const idA = a.id || "";
        const idB = b.id || "";
        return idB.localeCompare(idA);
      });
    }

    return combined;
  }, [lines, batches, batchCache, selectedCompanyFilter, selectedCategoryFilter, sortBy, warehouseId]);

  const handleAdd = (p: Product, b?: Batch) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(40);
    }
    onAdd(p, b);
    toast.success(`Added ${p.name}${b ? ` (Batch: ${b.batch_number})` : ''}`, {
      duration: 1500,
      position: isCompact ? "top-center" : "bottom-right"
    });
  };

  const hasActiveFilters = selectedCompanyFilter !== "All" || selectedCategoryFilter !== "All";

  const clearAllFilters = () => {
    setSelectedCompanyFilter("All");
    setSelectedCategoryFilter("All");
  };

  return (
    <div className={cn("flex-1 min-h-0 flex flex-col relative overflow-hidden bg-white rounded-t-2xl md:rounded-t-3xl border border-slate-100 shadow-sm", className)}>
      {/* Header Area */}
      <div className={cn("px-4 py-1.5 shrink-0 flex items-center justify-between")}>
          <div className="flex items-center gap-4 flex-1">
            {!isCompact && (
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight shrink-0">Product Catalog</h2>
                <span className="text-xs text-slate-400 font-medium">({filteredBatches.length} items)</span>
              </div>
            )}
         </div>
          <div className="flex items-center gap-3 ml-4">
            {onClose && !isEditing && (
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl h-10 w-10 hover:bg-slate-100 transition-colors">
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>
      </div>
      
      {/* Search & Filter Bar */}
      <div className={cn("px-4 py-2 bg-transparent shrink-0 relative")}>
        {isEditing && orderNumber && (
          <div className="flex flex-col gap-3 mb-4 px-1">
             {/* Line 1: Order ID */}
             <div className="w-full flex items-center justify-between">
                <span className="text-base sm:text-2xl font-black text-slate-900 tracking-tight">
                  #{orderNumber}
                </span>
                {status && (
                  <Badge className={cn(
                    "rounded-md px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest border-none whitespace-nowrap shadow-none",
                    statusColor[status as keyof typeof statusColor]
                  )}>
                    {statusLabel[status as keyof typeof statusLabel] || status}
                  </Badge>
                )}
             </div>

              {/* Line 2: Date Picker */}
              {orderDate && (
                <div className="flex items-center gap-2 text-xs text-slate-500 pt-1 border-t border-slate-50">
                  <Calendar size={13} className="text-slate-400" />
                  {isEditing && onUpdateDate ? (
                    <input 
                      type="date" 
                      className="bg-transparent border-none p-0 h-5 text-slate-800 font-semibold focus:ring-0 outline-none text-xs"
                      value={orderDate}
                      onChange={(e) => onUpdateDate?.(e.target.value)}
                    />
                  ) : (
                    <span className="font-semibold text-slate-700">{orderDate}</span>
                  )}
                </div>
              )}
          </div>
        )}

        <div className="flex gap-2 sm:gap-3 items-center">
          <div className="relative group flex-1 bg-slate-50/80 rounded-2xl border border-slate-200/80 shadow-2xs transition-all focus-within:bg-white focus-within:border-brand-primary/40 focus-within:ring-4 focus-within:ring-brand-primary/5">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors" />
            <Input 
              className="pl-11 pr-10 h-11 sm:h-12 border-none bg-transparent font-bold text-sm shadow-none focus-visible:ring-0 placeholder:text-slate-400 placeholder:font-normal transition-all" 
              placeholder="Search products by name, SKU, or batch..." 
              value={prodQ} 
              onChange={e=>setProdQ(e.target.value)} 
              onFocus={() => prodQ.length > 0 && setShowSuggestions(true)}
            />
            {prodQ && (
              <button 
                type="button"
                onClick={() => {
                  setProdQ("");
                  setShowSuggestions(false);
                }}
                className="absolute right-10 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {isLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-brand-primary opacity-60" />
              </div>
            )}
          </div>
          
          {/* Enhanced Filter Popover with Company & Category Tabs */}
          <Popover>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className={cn(
                  "h-11 sm:h-12 px-3 sm:px-4 rounded-2xl border border-slate-200 bg-white font-bold text-xs active:scale-95 transition-all shrink-0 flex items-center gap-1.5",
                  hasActiveFilters && "bg-brand-primary/10 border-brand-primary/40 text-brand-primary"
                )}
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse shrink-0" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className={cn("p-0 rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden", isCompact ? "w-[calc(100vw-2rem)] mx-4" : "w-80")} align={isCompact ? "center" : "end"}>
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-brand-primary" /> Filter & Sort Catalog
                </span>
                {hasActiveFilters && (
                  <button 
                    type="button"
                    onClick={clearAllFilters}
                    className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                )}
              </div>

              {/* Popover Tab Switcher */}
              <div className="grid grid-cols-3 bg-slate-100 p-1 m-2.5 rounded-xl text-xs font-bold gap-1">
                <button
                  type="button"
                  onClick={() => setPopoverTab("category")}
                  className={cn(
                    "py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 text-[11px]",
                    popoverTab === "category" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <Tag className="h-3 w-3" /> Category
                </button>
                <button
                  type="button"
                  onClick={() => setPopoverTab("company")}
                  className={cn(
                    "py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 text-[11px]",
                    popoverTab === "company" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <Building2 className="h-3 w-3" /> Company
                </button>
                <button
                  type="button"
                  onClick={() => setPopoverTab("sort")}
                  className={cn(
                    "py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 text-[11px]",
                    popoverTab === "sort" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  <Sparkles className="h-3 w-3" /> Sort
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                {popoverTab === "category" && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">
                      Product Categories / Division
                    </p>
                    {categoriesListWithCounts.map((cat) => (
                      <button 
                        key={cat.name}
                        type="button"
                        onClick={() => setSelectedCategoryFilter(cat.name)} 
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left", 
                          selectedCategoryFilter === cat.name 
                            ? "bg-brand-primary/10 text-brand-primary font-bold" 
                            : "hover:bg-slate-50 text-slate-700"
                        )}
                      >
                        <span className="truncate">{cat.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-mono font-bold shrink-0 ml-2">
                          {cat.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {popoverTab === "company" && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">
                      Companies & Brands
                    </p>
                    {companiesListWithCounts.map((item) => (
                      <button 
                        key={item.company.id + item.company.name}
                        type="button"
                        onClick={() => setSelectedCompanyFilter(item.company.name)} 
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left", 
                          selectedCompanyFilter === item.company.name 
                            ? "bg-brand-primary/10 text-brand-primary font-bold" 
                            : "hover:bg-slate-50 text-slate-700"
                        )}
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          {item.company.name !== "All" && (
                            <span 
                              className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                              style={{ 
                                backgroundColor: item.company.accent_hex + '20', 
                                color: item.company.accent_hex 
                              }}
                            >
                              {item.company.short_code}
                            </span>
                          )}
                          <span className="truncate">{item.company.name}</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-mono font-bold shrink-0">
                          {item.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {popoverTab === "sort" && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">
                      Sort Products By
                    </p>
                    <button 
                      type="button"
                      onClick={() => setSortBy("alphabetical")} 
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors", 
                        sortBy === "alphabetical" ? "bg-brand-primary/10 text-brand-primary font-bold" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <span>Alphabetical (A to Z)</span>
                      {sortBy === "alphabetical" && <Check className="h-4 w-4" />}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSortBy("margin")} 
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors", 
                        sortBy === "margin" ? "bg-brand-primary/10 text-brand-primary font-bold" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <span>Highest MRP First</span>
                      {sortBy === "margin" && <Check className="h-4 w-4" />}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSortBy("newest")} 
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors", 
                        sortBy === "newest" ? "bg-brand-primary/10 text-brand-primary font-bold" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <span>Newest / Recent Additions</span>
                      {sortBy === "newest" && <Check className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Search Results Dropdown */}
        <AnimatePresence>
          {showSuggestions && (
            <>
              <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowSuggestions(false)} />
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                className="absolute left-4 right-4 top-[calc(100%-4px)] z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[360px]"
              >
                {isLoading ? (
                  <div className="p-10 text-center flex flex-col items-center">
                     <Loader2 className="h-6 w-6 animate-spin text-brand-primary mb-3" />
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Searching Inventory</p>
                  </div>
                ) : groupedSuggestions.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-sm font-bold text-slate-900 mb-1">No products found</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Try a different search term</p>
                  </div>
                ) : (
                  <div className="overflow-y-auto overscroll-contain divide-y divide-slate-100">
                    <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10 border-b border-slate-100 flex items-center justify-between">
                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Matching Items ({groupedSuggestions.length})</span>
                    </div>
                    {groupedSuggestions.map((b) => {
                      const comp = b.companyInfo || resolveCompanyInfo(b.product);
                      const cat = b.categoryName || resolveProductDivisionCategory(b.product);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          className="w-full p-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between group active:bg-slate-100 text-left"
                          onClick={() => {
                            if (b.product) {
                              handleAdd(b.product, b.primaryBatch);
                              setProdQ("");
                              setShowSuggestions(false);
                            }
                          }}
                        >
                          <div className="flex-1 min-w-0 pr-3">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span 
                                className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                                style={{ 
                                  backgroundColor: comp.accent_hex + '20', 
                                  color: comp.accent_hex 
                                }}
                              >
                                {comp.short_code}
                              </span>
                              <Badge variant="outline" className="h-4 border-none px-1.5 rounded bg-slate-100 text-slate-600 text-[8px] font-bold">
                                {cat}
                              </Badge>
                            </div>
                            <h5 className="font-bold text-slate-900 text-xs sm:text-sm leading-tight mb-1 group-hover:text-brand-primary transition-colors truncate">
                              {b.product?.name}
                            </h5>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-medium">
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">
                                Stock: {b.remaining_qty}
                              </span>
                              {b.expiry_date && (
                                <span className="text-slate-400 font-mono text-[9px]">
                                  EXP: {b.expiry_date}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="h-8 w-8 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-all shadow-2xs shrink-0">
                            <Plus size={16} className="stroke-[3]" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Filter Switcher Bar & Horizontal Pills */}
      <div className="shrink-0 px-4 py-2 border-b border-slate-100/80 bg-slate-50/50 space-y-2">
        {/* Toggle Mode: Category vs Company */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-xl gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setQuickFilterMode("category")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all",
                quickFilterMode === "category" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Tag className="h-3 w-3" />
              <span>By Category</span>
            </button>
            <button
              type="button"
              onClick={() => setQuickFilterMode("company")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all",
                quickFilterMode === "company" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Building2 className="h-3 w-3" />
              <span>By Company</span>
            </button>
          </div>

          {/* Active Filter Badges with Quick Reset */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 overflow-hidden">
              {selectedCategoryFilter !== "All" && (
                <Badge variant="secondary" className="text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                  Cat: {selectedCategoryFilter}
                  <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setSelectedCategoryFilter("All")} />
                </Badge>
              )}
              {selectedCompanyFilter !== "All" && (
                <Badge variant="secondary" className="text-[9px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                  Comp: {selectedCompanyFilter}
                  <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setSelectedCompanyFilter("All")} />
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Quick Filter Horizontal Scroll Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5">
          {quickFilterMode === "category" ? (
            categoriesListWithCounts.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setSelectedCategoryFilter(cat.name)}
                className={cn(
                  "h-7 px-3 rounded-full text-xs font-semibold transition-all duration-200 shrink-0 flex items-center gap-1.5",
                  selectedCategoryFilter === cat.name
                    ? "bg-brand-primary text-white shadow-2xs"
                    : "bg-white border border-slate-200/80 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                )}
              >
                <span>{cat.name}</span>
                <span className={cn(
                  "text-[9px] px-1 py-0.2 rounded-full font-mono",
                  selectedCategoryFilter === cat.name ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {cat.count}
                </span>
              </button>
            ))
          ) : (
            companiesListWithCounts.map((item) => (
              <button
                key={item.company.id + item.company.name}
                type="button"
                onClick={() => setSelectedCompanyFilter(item.company.name)}
                className={cn(
                  "h-7 px-3 rounded-full text-xs font-semibold transition-all duration-200 shrink-0 flex items-center gap-1.5",
                  selectedCompanyFilter === item.company.name
                    ? "bg-brand-primary text-white shadow-2xs"
                    : "bg-white border border-slate-200/80 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                )}
              >
                {item.company.name !== "All" && (
                  <span 
                    className="w-1.5 h-1.5 rounded-full" 
                    style={{ backgroundColor: item.company.accent_hex }} 
                  />
                )}
                <span>{item.company.name}</span>
                <span className={cn(
                  "text-[9px] px-1 py-0.2 rounded-full font-mono",
                  selectedCompanyFilter === item.company.name ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {item.count}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">
          <div className="space-y-6 pb-28 pt-3 px-4">

            {/* Catalog Grid */}
            {filteredBatches.length === 0 ? (
              <div className="py-20 text-center space-y-4 flex flex-col items-center justify-center min-h-[35vh]">
                <div className="h-16 w-16 rounded-2xl bg-slate-100 border border-border/40 flex items-center justify-center mx-auto text-slate-400">
                  <ShoppingBag className="h-7 w-7" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-1">
                    No matching products found
                  </h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    {hasActiveFilters 
                      ? "Try clearing active company or category filters, or search for another keyword."
                      : "Use the search bar above to find and add products to your order."}
                  </p>
                  {hasActiveFilters && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={clearAllFilters} 
                      className="mt-3 rounded-xl font-bold text-xs"
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {selectedCompanyFilter !== "All" ? selectedCompanyFilter : "All Companies"} • {selectedCategoryFilter !== "All" ? selectedCategoryFilter : "All Categories"}
                  </span>
                  <Badge variant="outline" className="h-5 border-slate-200 text-[10px] font-bold text-slate-500 bg-white">
                    {filteredBatches.length} items
                  </Badge>
                </div>

                <ResponsiveGrid cols={{ base: 2, sm: 2, lg: 3, xl: 4 }} gap={isCompact ? 2.5 : 3.5}>
                  {filteredBatches.map((b, bIdx) => {
                    if (!b.product) return null;
                    const stock = b.remaining_qty;
                    const isAdded = lines.some(l => l.product_id === b.id && !l.isRemoved);
                    const quantity = lines.filter(l => l.product_id === b.id && !l.isRemoved).reduce((sum, l) => sum + l.quantity, 0);
                    const comp = b.companyInfo || resolveCompanyInfo(b.product);
                    const cat = b.categoryName || resolveProductDivisionCategory(b.product);

                    return (
                      <motion.div
                        key={`${b.id}-${bIdx}`}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileTap={{ scale: 0.98 }}
                        className="h-full"
                      >
                        <Card 
                          className={cn(
                            "group overflow-hidden rounded-2xl border border-slate-200/80 transition-all flex flex-col h-full cursor-pointer bg-white shadow-2xs hover:shadow-md relative", 
                            isAdded && "border-brand-primary/40 bg-brand-primary/[0.02] ring-1 ring-brand-primary/20",
                            stock <= 0 && "opacity-60 grayscale"
                          )} 
                          onClick={() => {
                            if (stock > 0) handleAdd(b.product!, b.primaryBatch);
                          }}
                        >
                          <div className="p-3 sm:p-4 flex flex-col h-full justify-between gap-2.5">
                            <div className="flex flex-col gap-1.5 flex-1">
                               {/* Badges: Company Code + Category Badge + FIFO */}
                               <div className="flex items-center justify-between gap-1 border-b border-slate-100 pb-1.5">
                                 <div className="flex items-center gap-1 min-w-0">
                                   <span 
                                     className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                                     style={{ 
                                       backgroundColor: comp.accent_hex + '20', 
                                       color: comp.accent_hex 
                                     }}
                                   >
                                     {comp.short_code}
                                   </span>
                                   <span className="text-[9px] font-semibold text-slate-500 truncate max-w-[85px] bg-slate-100 px-1.5 py-0.5 rounded">
                                     {cat}
                                   </span>
                                 </div>

                                 {(b as Batch & { isFifoPriority?: boolean }).isFifoPriority && (
                                   <span className="text-[7px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-1 py-0.5 rounded shrink-0">
                                     FIFO
                                   </span>
                                 )}
                               </div>
                               
                               <h4 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug group-hover:text-brand-primary transition-colors line-clamp-2">
                                 {b.product.name}
                               </h4>
                               
                               {/* Stock & Expiry Information */}
                               <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1">
                                  <Badge 
                                     variant="outline" 
                                     className="h-4 border-none px-1.5 rounded-md bg-emerald-50 text-emerald-700 text-[8px] sm:text-[9px] font-bold"
                                   >
                                     Stk: {b.remaining_qty}
                                   </Badge>
                                   
                                   {b.expiry_date && (
                                     <span className="text-[8px] sm:text-[9px] font-mono text-slate-400">
                                       EXP: {b.expiry_date}
                                     </span>
                                   )}
                               </div>
                            </div>

                            {/* Action footer */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                               <div className="flex flex-col">
                                 {b.product.mrp && Number(b.product.mrp) > 0 ? (
                                   <span className="text-[10px] font-bold text-slate-600 tabular-nums">
                                     MRP: {fmtINR(b.product.mrp)}
                                   </span>
                                 ) : (
                                   <span className="text-[9px] text-slate-400 font-mono">
                                     #{b.batch_number?.slice(-6) || b.product.sku?.slice(-6) || "N/A"}
                                   </span>
                                 )}
                               </div>
                              
                               {isAdded ? (
                                <div className="flex items-center gap-1.5">
                                   <div className="flex flex-col items-end">
                                      <span className="text-[7px] font-bold text-slate-400 uppercase">Qty</span>
                                      <span className="text-xs font-bold text-brand-primary tabular-nums">
                                        {quantity} {(() => {
                                          const itemLine = lines.find(l => l.product_id === b.id);
                                          return itemLine ? resolveDisplayUnit(itemLine.packType, b as unknown as Product, { short: true }) : 'Pcs';
                                        })()}
                                      </span>
                                   </div>
                                   <div className="h-7 w-7 rounded-xl bg-brand-primary text-white flex items-center justify-center shadow-sm active:scale-95 transition-all">
                                      <Check size={13} className="stroke-[3]" />
                                   </div>
                                </div>
                              ) : (
                                <div className="h-7 w-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center group-hover:bg-brand-primary group-hover:text-white transition-all shadow-2xs active:scale-95">
                                  <Plus size={13} className="stroke-[3]" />
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </ResponsiveGrid>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
