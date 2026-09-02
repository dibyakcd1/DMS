import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Search, Loader2, ShoppingBag, Store, Package, Trash2, ArrowLeft, Plus, Save, RefreshCw, Layers, Calendar, AlertTriangle, ChevronDown, ScanBarcode, Pencil, X, Check, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { fmtINR } from "@/lib/format";
import { formatStockDisplay, toDbPackType, isProductDozenPackaging } from "@/lib/packaging";
import { resolveEffectiveGstRate } from "@/lib/company-helpers";
import { PricingProduct, PackType, getPackMultiplier } from "@/lib/pricing";
import { useQueryClient } from "@tanstack/react-query";
import { getOrCreateCounterShop, createInstantCustomer } from "@/lib/quickOrder";

import { clampOrderDate } from "@/lib/dates";

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

import { useOrderDraft } from "@/hooks/useOrderDraft";
import { Shop, Product, Line, PriceTierMap, PriceOverrideMap } from "@/types";
import { InlineShopSelector } from "@/components/orders/InlineShopSelector";
import { ProductCatalogSheet } from "@/components/orders/ProductCatalogSheet";
import { ProductCatalog } from "@/components/orders/ProductCatalog";
import { OrderLineItems } from "@/components/orders/OrderLineItems";
import { OrderSummaryCard } from "@/components/orders/OrderSummaryCard";
import { useIsMobile, useIsTablet, useIsLaptop, useIsDesktop } from "@/lib/responsive";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/PageHeader";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
} from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

type Warehouse = {
  id: string;
  name: string;
  code: string;
};

export default function NewOrder() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // Only mobile is truly "compact" (single column with sheets), 
  // Tablet should usually show the dual-pane layout if enough width.
  const isCompact = isMobile;
  const isLaptop = useIsLaptop();
  const isDesktop = useIsDesktop();
  const { id: rawId } = useParams<{ id: string }>();
  const editId = rawId && rawId !== "null" ? rawId : undefined;
  const [searchParams] = useSearchParams();
  const currentUser = useCurrentUser();
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "owner";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    shopId, setShopId,
    warehouseId, setWarehouseId,
    lines, setLines,
    discountAmount, setDiscountAmount,
    discountType, setDiscountType,
    notes, setNotes,
    orderDate, setOrderDate,
    outstandingBalance, setOutstandingBalance,
    priceTiers, setPriceTiers,
    priceOverrides, setPriceOverrides,
    totals,
    loading: loadingDraft,
    persistedId,
    orderNumber,
    originalStatus,
    salespersonId,
    addProduct,
    removeLine,
    updateLineQty,
    updateLinePackType,
    updateLinePrice,
    resolvePackPrice,
    getDefaultPackType,
    resetDraft
  } = useOrderDraft({ editId });

  const handleFullReset = async (keepContext = false) => {
    await resetDraft(keepContext);
    if (editId) {
      navigate('/orders/new', { replace: true });
    }
  };

  // Sync draft ID to URL for session resumption without unmounting or resetting review/checkout screen
  React.useEffect(() => {
    if (persistedId && !editId) {
      window.history.replaceState(null, '', `/orders/${persistedId}/edit`);
    }
  }, [persistedId, editId]);

  const [shops, setShops] = React.useState<Shop[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [warehouses, setWarehouses] = React.useState<Warehouse[]>([]);
  const initialLoadRef = React.useRef(false);
  const [shopOpen, setShopOpen] = React.useState(false);
  const [prodOpen, setProdOpen] = React.useState(false);
  const [stayOpen, setStayOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [limitConfirmOpen, setLimitConfirmOpen] = React.useState(false);
  const [pendingStatus, setPendingStatus] = React.useState<"draft" | "pending_approval" | null>(null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [originalTotal, setOriginalTotal] = React.useState(0);
  const [currentStep, setCurrentStep] = React.useState<"selection" | "catalog" | "checkout" | "success">(
    (editId || searchParams.get("shop") || searchParams.get("shopId")) ? "catalog" : "selection"
  );
  const [lastOrderId, setLastOrderId] = React.useState<string | null>(null);
  const [recentShops, setRecentShops] = React.useState<string[]>([]);
  const [quickCustNameInput, setQuickCustNameInput] = React.useState("");
  const [quickCustPhoneInput, setQuickCustPhoneInput] = React.useState("");
  const [isCreatingQuickCust, setIsCreatingQuickCust] = React.useState(false);
  const [loadingLastOrder, setLoadingLastOrder] = React.useState(false);

  const handleRepeatLastOrder = async (sId: string) => {
    setLoadingLastOrder(true);
    try {
      const { data: lastOrder, error } = await supabase
        .from("orders")
        .select("id")
        .eq("shop_id", sId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          toast.error("No previous orders found for this shop");
          return;
        }
        throw error;
      }

      // Load items from last order
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select(`
          product_id,
          quantity,
          unit_price,
          pack_type,
          gst_rate,
          products (*)
        `)
        .eq("order_id", lastOrder.id);
      
      if (itemsError) throw itemsError;

      if (!items || items.length === 0) {
        toast.error("Previous order has no items");
        return;
      }

      // Transform to lines
      const newLines = items.map(item => {
        const p = (item.products as unknown as Product);
        const packType = (item.pack_type === "unit" ? "pcs" : (item.pack_type || "pcs")) as Database["public"]["Enums"]["pack_type"] | string;
        const itemRec = item as Record<string, unknown>;
        const pRec = (p || {}) as unknown as Record<string, unknown>;
        const effGstRate = resolveEffectiveGstRate({
          gst_rate: item.gst_rate,
          cgst_rate: (itemRec.cgst_rate as number | undefined) ?? (pRec.cgst_rate as number | undefined),
          sgst_rate: (itemRec.sgst_rate as number | undefined) ?? (pRec.sgst_rate as number | undefined),
          igst_rate: (itemRec.igst_rate as number | undefined) ?? (pRec.igst_rate as number | undefined),
          hsn: p.hsn,
          sku: p.sku,
          name: p.name,
          product: p
        });
        return {
          product_id: item.product_id,
          name: p.name,
          sku: p.sku,
          quantity: item.quantity,
          unit_price: item.unit_price,
          packType: packType as Line["packType"],
          gst_rate: effGstRate,
          unit_type: p.unit_type,
          units_per_packet: p.units_per_packet,
          packets_per_case: p.packets_per_case,
          units_per_case: p.units_per_case
        };
      });

      setLines(newLines);
      toast.success(`Replicated ${items.length} items from last order`);
      setCurrentStep("catalog");
    } catch (err) {
      console.error("Failed to repeat last order", err);
      toast.error(friendlyError(err));
    } finally {
      setLoadingLastOrder(false);
    }
  };

  // Load recent shops
  React.useEffect(() => {
    const saved = localStorage.getItem("recent_shops");
    if (saved) {
      try {
        setRecentShops(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse recent shops", e);
      }
    }
  }, []);

  const addToRecentShops = (id: string) => {
    setRecentShops(prev => {
      const updated = [id, ...prev.filter(x => x !== id)].slice(0, 5);
      localStorage.setItem("recent_shops", JSON.stringify(updated));
      return updated;
    });
  };

  const handleShopSelect = (id: string) => {
    setShopId(id);
    addToRecentShops(id);
    setCurrentStep("catalog");
  };

  const handleStartQuickOrder = async (custName?: string, custPhone?: string) => {
    const targetName = (custName || quickCustNameInput || "").trim();
    const targetPhone = (custPhone || quickCustPhoneInput || "").trim();

    try {
      setBusy(true);
      setIsCreatingQuickCust(true);
      
      let targetShop: Shop;
      if (targetName) {
        targetShop = await createInstantCustomer(targetName, targetPhone || undefined);
        queryClient.invalidateQueries({ queryKey: ["shops"] });
      } else {
        targetShop = await getOrCreateCounterShop();
      }

      setShopId(targetShop.id);
      setShops(prev => prev.some(s => s.id === targetShop.id) ? prev : [targetShop, ...prev]);
      addToRecentShops(targetShop.id);
      setCurrentStep("catalog");
      setQuickCustNameInput("");
      setQuickCustPhoneInput("");
      toast.success(targetName ? `⚡ Quick Order started for "${targetShop.name}"` : "⚡ Quick Order initiated (Walk-in Counter Sale)");
    } catch (err) {
      console.error("Failed to start quick order", err);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
      setIsCreatingQuickCust(false);
    }
  };

  // Skip auto-switch logic, as Sheet handles visibility now

  // Load original total for existing orders to adjust credit limit checks correctly
  React.useEffect(() => {
    if (editId && lines.length > 0 && originalTotal === 0) {
      setOriginalTotal(totals.total);
    }
  }, [editId, lines.length, totals.total, originalTotal]);

  // Before unload warning
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (lines.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [lines.length]);

  const shop = React.useMemo(() => {
    return shops.find(s => s.id === shopId);
  }, [shops, shopId]);

  // Handle URL shop param
  React.useEffect(() => {
    const shopParam = searchParams.get("shop") || searchParams.get("shopId");
    if (shopParam && shopParam !== "null" && !editId && !shopId) {
      setShopId(shopParam);
    }
  }, [searchParams, editId, setShopId, shopId]);

  const lineProductIds = React.useMemo(() => 
    lines.map(l => l.product_id).sort().join(','), 
    [lines]
  );

  const lastSyncedRef = React.useRef<string>("");

  const syncStockForWarehouse = React.useCallback(async (whId: string) => {
    const pidsStr = lineProductIds;
    const syncKey = `${whId}:${pidsStr}`;
    
    if (!pidsStr || syncKey === lastSyncedRef.current) return;
    lastSyncedRef.current = syncKey;

    try {
      const pids = pidsStr.split(',');
      let query = supabase
        .from("v_product_stock_warehouse")
        .select("id, stock_base_units, avg_landed_cost")
        .in("id", pids);

      if (whId && whId !== "all" && whId !== "null") {
        query = query.eq("warehouse_id", whId);
      }
      
      const { data, error } = await query;
      if (error) throw error;

      const stockMap = new Map<string, { qty: number; cost: number }>();
      (data ?? []).forEach((x) => {
        const existing = stockMap.get(x.id);
        const q = Number(x.stock_base_units || 0);
        const c = Number(x.avg_landed_cost || 0);
        if (existing) {
          existing.qty += q;
          if (!existing.cost && c) existing.cost = c;
        } else {
          stockMap.set(x.id, { qty: q, cost: c });
        }
      });

      setLines(prev => prev.map(l => {
        const s = stockMap.get(l.product_id);
        if (!s) return l;
        // Only update if changed to avoid unnecessary re-renders
        if (l.stock === s.qty && l.avg_landed_cost === s.cost) return l;
        return { ...l, stock: s.qty, avg_landed_cost: s.cost || l.avg_landed_cost };
      }));
    } catch (err: unknown) {
      console.error('[Inventory] Stock sync failed', err);
      // Avoid toast spam in loops
    }
  }, [lineProductIds, setLines]); // Depend on stabilized IDs instead of raw lines

  const handleSkuSearch = async (sku: string) => {
    if (!sku.trim()) return;
    setIsSearchingSku(true);
    try {
      let query = supabase
        .from("v_product_stock_warehouse")
        .select("*")
        .eq("sku", sku.trim());

      if (warehouseId && warehouseId !== "all" && warehouseId !== "null") {
        query = query.eq("warehouse_id", warehouseId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        toast.error(friendlyError(error));
        return;
      }

      if (!data || data.length === 0) {
        toast.error("Product mismatch: Entry not found in inventory");
        return;
      }

      const totalQty = data.reduce((sum, item) => sum + Number((item as unknown as { stock_base_units: number }).stock_base_units || 0), 0);
      const first = data[0];

      const p = {
        ...first,
        inventory: { 
          quantity: totalQty, 
          avg_landed_cost: Number((first as unknown as { avg_landed_cost: number }).avg_landed_cost || 0) 
        }
      } as unknown as Product;

      addProduct(p, shop);
      setSkuInput("");
      toast.success(`Appended: ${p.name}`);
    } catch (err: unknown) {
      console.error('[Inventory] Sku load failed', err);
      toast.error(friendlyError(err));
    } finally {
      setIsSearchingSku(false);
    }
  };

  // Initial catalog load
  React.useEffect(() => {
    (async () => {
      if (initialLoadRef.current) return;
      initialLoadRef.current = true;
      
      try {
        let fetchedShops: Shop[] = [];
        let fetchedWhs: Warehouse[] = [];

        // Fetch shops robustly
        try {
          const shopsRes = await supabase.from("shops").select("id, name, gstin, phone, shop_type, credit_limit, discount_pct").eq("is_active", true).order("name");
          if (shopsRes.error) {
            if (shopsRes.error.code === "42703" || shopsRes.error.message?.includes("does not exist")) {
              throw shopsRes.error;
            }
            throw shopsRes.error;
          }
          fetchedShops = (shopsRes.data ?? []) as unknown as Shop[];
        } catch (shopErr: unknown) {
          console.warn("Table shops lacks column gstin/shop_type/discount_pct, falling back to basic columns.");
          const basicRes = await supabase.from("shops").select("id, name, phone, credit_limit, is_active").eq("is_active", true).order("name");
          if (basicRes.error) throw basicRes.error;
          fetchedShops = (basicRes.data ?? []).map((s: { id: string; name: string; phone?: string | null; credit_limit?: number | null; is_active?: boolean | null; owner_name?: string | null; address?: string | null }) => ({
            id: s.id,
            name: s.name,
            owner_name: s.owner_name || null,
            phone: s.phone || null,
            address: s.address || null,
            gstin: null,
            credit_limit: Number(s.credit_limit || 0),
            is_active: s.is_active ?? true,
            shop_type: "silver",
            discount_pct: 0
          })) as unknown as Shop[];
        }

        // Fetch warehouses
        const whRes = await supabase.from("warehouses").select("id, name, code").eq("is_active", true).order("name");
        if (whRes.error) throw whRes.error;
        fetchedWhs = (whRes.data ?? []) as Warehouse[];
        
        setShops(fetchedShops);
        setWarehouses(fetchedWhs);
        
        if (!editId && !warehouseId) {
          setWarehouseId("all");
        }
      } catch (err: unknown) {
        console.error('[Catalog] Component load failure', err);
        toast.error(friendlyError(err));
      }
    })();
  }, [editId, currentUser, setWarehouseId, warehouseId]); // Keep essential dependencies but guard with ref

  // Sync stock on warehouse change
  React.useEffect(() => {
    if (!warehouseId || warehouseId === "null" || loadingDraft) return;
    syncStockForWarehouse(warehouseId);
  }, [warehouseId, loadingDraft, syncStockForWarehouse]);

  // Fetch shop metadata
  React.useEffect(() => {
    if (!shopId) {
      setPriceTiers({});
      setPriceOverrides({});
      setOutstandingBalance(0);
      return;
    }
    (async () => {
      try {
        const selectedShop = shops.find(s => s.id === shopId);
        if (!selectedShop) return;

        const shopType = selectedShop.shop_type || "silver";

        // 1. Fetch Price Tiers (with backward/forward compatibility fallback)
        interface NewOrderPriceTierShape {
          id?: string;
          product_id: string;
          pack_type: string;
          price: number;
          shop_type?: string;
        }

        interface NewOrderOverrideShape {
          id: string;
          shop_id: string;
          product_id: string;
          pack_type: string;
          override_price: number;
        }

        let tiersData: NewOrderPriceTierShape[] = [];
        try {
          // Rather than querying a non-existent shop_type column (which logs a 400 error in the console),
          // we queries the flat columns model directly as it's the schema present in the live database.
          const flatRes = await supabase.from("product_price_tiers").select("id, product_id, tier_1_distributor, tier_2_super_stockist, tier_3_sub_stockist, tier_4_wholesale, tier_5_retail");
          if (flatRes.error) throw flatRes.error;
          
          let priceField = "tier_3_sub_stockist";
          if (shopType === "premium") priceField = "tier_1_distributor";
          else if (shopType === "gold") priceField = "tier_2_super_stockist";
          else if (shopType === "silver") priceField = "tier_3_sub_stockist";
          else if (shopType === "bronze") priceField = "tier_4_wholesale";
          else if (shopType === "basic") priceField = "tier_5_retail";

          const prodRes = await supabase.from("products").select("id, units_per_packet, packets_per_case");
          const prodMap = new Map<string, { id: string; units_per_packet: number | null; packets_per_case: number | null }>();
          if (prodRes.data) {
            prodRes.data.forEach(p => prodMap.set(p.id, p));
          }

          const mappedRows: NewOrderPriceTierShape[] = [];
          (flatRes.data as unknown as Record<string, unknown>[] || []).forEach((row) => {
            const basePrice = Number(row[priceField] || 0);
            const pInfo = prodMap.get(row.product_id as string);
            const unitsPerPacket = pInfo?.units_per_packet || 1;
            const packetsPerCase = pInfo?.packets_per_case || 1;

            mappedRows.push({
               product_id: row.product_id as string,
               pack_type: "pcs",
               price: basePrice
            });
            mappedRows.push({
               product_id: row.product_id as string,
               pack_type: "packet",
               price: basePrice * unitsPerPacket
            });
            mappedRows.push({
               product_id: row.product_id as string,
               pack_type: "case",
               price: basePrice * unitsPerPacket * packetsPerCase
            });
            mappedRows.push({
               product_id: row.product_id as string,
               pack_type: "kg",
               price: basePrice
            });
          });
          tiersData = mappedRows;
        } catch (tierErr: unknown) {
          console.error("Failed to fetch product_price_tiers:", tierErr);
          tiersData = [];
        }

        // 2. Fetch Shop Price Overrides (handling table-does-not-exist gracefully)
        let overridesData: NewOrderOverrideShape[] = [];
        try {
          const res = await supabase.from("shop_product_price_overrides").select("*").eq("shop_id", shopId);
          if (res.error) {
            if (res.error.code === "PGRST205" || res.error.message?.includes("does not exist")) {
              console.warn("Table shop_product_price_overrides is missing from schema cache, using empty overrides.");
            } else {
              throw res.error;
            }
          } else {
            overridesData = (res.data || []) as NewOrderOverrideShape[];
          }
        } catch (overrideErr: unknown) {
          console.warn("Error fetching price overrides, falling back to none:", overrideErr);
          overridesData = [];
        }

        // 3. Outstanding balance (handling RPC errors gracefully)
        let balance = 0;
        try {
          const balanceRes = await supabase.rpc("get_shop_outstanding_balance", { target_shop_id: shopId });
          if (balanceRes.error) throw balanceRes.error;
          balance = Number(balanceRes.data || 0);
        } catch (balanceErr: unknown) {
          console.warn("Could not retrieve outstanding balance:", balanceErr);
        }

        setOutstandingBalance(balance);

        const tMap: PriceTierMap = {};
        if (selectedShop.shop_type) {
          tMap[selectedShop.shop_type] = {};
          tiersData.forEach((row) => {
            const r = row as { product_id: string; pack_type: string; price: number };
            if (!tMap[selectedShop.shop_type!][r.product_id]) tMap[selectedShop.shop_type!][r.product_id] = {};
            tMap[selectedShop.shop_type!][r.product_id][r.pack_type as PackType] = Number(r.price);
          });
        }
        setPriceTiers(tMap);

        const oMap: PriceOverrideMap = {};
        oMap[shopId] = {};
        overridesData.forEach((row) => {
          const r = row as { product_id: string; pack_type: string; price: number };
          if (!oMap[shopId][r.product_id]) oMap[shopId][r.product_id] = {};
          oMap[shopId][r.product_id][r.pack_type as PackType] = Number(r.price);
        });
        setPriceOverrides(oMap);
      } catch (err: unknown) {
        console.error('[Pricing] Logic failure', err);
        toast.error(friendlyError("Pricing matrix could not be resolved"));
      }
    })();
  }, [shopId, shops, setPriceTiers, setPriceOverrides, setOutstandingBalance]);

  const handleOrderAction = async (status: "draft" | "pending_approval") => {
    if (!shopId) return toast.error("Select shop");
    if (!lines.length) return toast.error("Order list is empty");

    // G3: Prevent editing dispatched/delivered orders directly to protect inventory
    if (originalStatus && ["dispatched", "delivered"].includes(originalStatus)) {
      return toast.error(`Cannot edit a ${originalStatus} order directly. Please revert to 'Approved' status first to restore inventory.`);
    }

    const tid = toast.loading("Verifying accounting limits...");
    const { data: latestBalance } = await supabase.rpc("get_shop_outstanding_balance", { target_shop_id: shopId });
    toast.dismiss(tid);

    const currentBalance = Number(latestBalance || 0);
    const effectiveBalance = editId ? (currentBalance - originalTotal) : currentBalance;
    setOutstandingBalance(currentBalance);

    const isOverLimit = shop && shop.credit_limit > 0 && (effectiveBalance + totals.total) > shop.credit_limit;

    if (isOverLimit && status === "pending_approval") {
      setPendingStatus(status);
      setLimitConfirmOpen(true);
      return;
    }

    const outOfStock = lines.filter(l => {
      const multiplier = getPackMultiplier(l as unknown as Product, l.packType as PackType);
      return (l.quantity * multiplier) > (l.stock || 0);
    });

    if (outOfStock.length > 0) {
      return toast.error(`Stock violation: ${outOfStock.map(l => l.name).join(", ")}`);
    }

    performSubmit(status, Boolean(isOverLimit));
  };

  const performSubmit = async (status: "draft" | "pending_approval", overLimit = false) => {
    const clampedDate = clampOrderDate(orderDate);
    if (clampedDate !== orderDate) {
      setOrderDate(clampedDate);
    }

    setBusy(true);
    // If we are editing an already-approved (or higher) order, preserve its status.
    // Don't send it back through the approval queue unnecessarily.
    const statusesToPreserve = ["approved", "dispatched", "delivered"];
    const finalStatus = (editId && originalStatus && statusesToPreserve.includes(originalStatus))
      ? (originalStatus as Database["public"]["Enums"]["order_status"])
      : (status === "draft" ? "draft" : "pending_approval") as Database["public"]["Enums"]["order_status"];

    try {
      let orderIdToUse = editId;

      const orderData = {
        shop_id: shopId,
        warehouse_id: (warehouseId && warehouseId !== "all" && warehouseId !== "null") ? warehouseId : null,
        salesperson_id: salespersonId || currentUser?.id,
        status: finalStatus as Database["public"]["Enums"]["order_status"],
        subtotal: totals.subtotal,
        gst_total: totals.gst,
        total: totals.total,
        discount_amount: totals.calculatedDiscount,
        discount_type: discountType,
        notes: notes || null,
        order_date: orderDate,
        is_over_limit: overLimit
      };

      const itemsData = lines.filter(l => !l.isRemoved).map(l => {
        const lineExclusive = l.unit_price * l.quantity;
        const rate = resolveEffectiveGstRate(l);
        const lineTax = lineExclusive * (rate / 100);
        return {
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          gst_rate: rate,
          pack_type: toDbPackType(l.packType),
          line_total: lineExclusive + lineTax,
          line_total_tax_exclusive: lineExclusive,
          line_tax_amount: lineTax,
          batch_id: l.batch_id
        };
      });

      if (editId || (!currentUser?.isPinUser)) {
        const orderPayload = {
          shop_id: shopId,
          warehouse_id: (warehouseId && warehouseId !== "all" && warehouseId !== "null") ? warehouseId : null,
          salesperson_id: salespersonId || currentUser?.id,
          status: finalStatus,
          subtotal: totals.subtotal,
          gst_total: totals.gst,
          total: totals.total,
          discount_amount: totals.calculatedDiscount,
          discount_type: discountType,
          notes: notes || null,
          order_date: orderDate,
          is_over_limit: overLimit,
          updated_at: new Date().toISOString()
        };

        let { data: resultId, error: rpcError } = await supabase.rpc('save_draft_order_v4', {
          p_order_id: editId || null,
          p_order_data: orderPayload,
          p_items: itemsData
        });

        if (rpcError && (rpcError.code === '22P02' || rpcError.message?.includes('pack_type'))) {
          console.warn("[Order Submit] Retrying order save with fallback pack_type values for strict DB enum compatibility...");
          const fallbackItems = itemsData.map(item => ({
            ...item,
            pack_type: item.pack_type === 'doz' ? 'packet' : item.pack_type
          }));
          const retryResult = await supabase.rpc('save_draft_order_v4', {
            p_order_id: editId || null,
            p_order_data: orderPayload,
            p_items: fallbackItems
          });
          resultId = retryResult.data;
          rpcError = retryResult.error;
        }
        
        if (rpcError) throw rpcError;
        orderIdToUse = resultId;
      } else if (currentUser?.isPinUser && currentUser?.session_token) {
        let { data, error } = await supabase.rpc('insert_order_with_pin_v2', {
          p_session_token: currentUser.session_token,
          p_order_data: orderData,
          p_items_data: itemsData
        });

        if (error && (error.code === '22P02' || error.message?.includes('pack_type'))) {
          const fallbackItems = itemsData.map(item => ({
            ...item,
            pack_type: item.pack_type === 'doz' ? 'packet' : item.pack_type
          }));
          const retryResult = await supabase.rpc('insert_order_with_pin_v2', {
            p_session_token: currentUser.session_token,
            p_order_data: orderData,
            p_items_data: fallbackItems
          });
          data = retryResult.data;
          error = retryResult.error;
        }

        if (error) throw error;
        const result = data as { success: boolean; error?: string; order_id?: string };
        if (!result.success) throw new Error(result.error);
        orderIdToUse = result.order_id!;
      }

      if (editId) {
        try {
          const { data: existingInvoice, error: invFetchError } = await supabase
            .from("invoices")
            .select("*")
            .eq("order_id", editId)
            .maybeSingle();

          if (existingInvoice && !invFetchError) {
            const isGst = existingInvoice.type === "gst";
            const newSubtotal = Number(totals.subtotal);
            const newGstTotal = isGst ? Number(totals.gst) : 0;
            const newDiscount = Number(totals.calculatedDiscount || 0);
            const newTotal = isGst ? Number(totals.total) : newSubtotal - newDiscount;
            const amtPaid = Number(existingInvoice.amount_paid || 0);
            
            let newPaymentStatus: Database["public"]["Enums"]["payment_status"] = "unpaid";
            if (amtPaid >= newTotal) {
              newPaymentStatus = "paid";
            } else if (amtPaid > 0) {
              newPaymentStatus = "partial";
            }

            const { error: invUpdateError } = await supabase
              .from("invoices")
              .update({
                sub_total: newSubtotal,
                tax_amount: newGstTotal,
                discount_amount: newDiscount,
                total: newTotal,
                payment_status: newPaymentStatus
              } as unknown as Database["public"]["Tables"]["invoices"]["Update"])
              .eq("id", existingInvoice.id);

            if (invUpdateError) {
              console.error("[Context] Failed to sync invoice on order edit:", invUpdateError);
            } else {
              console.log("[Context] Invoice totals successfully synchronized with modified order.");
            }
          }
        } catch (syncErr) {
          console.error("[Context] Error syncing invoice on order edit:", syncErr);
        }
      }

      // Invalidate queries to prevent stale dashboard/invoice states
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

      toast.success(editId ? "Order updated" : (status === "draft" ? "Saved as draft" : "Order submitted"));
      setLastOrderId(orderIdToUse!);
      setCurrentStep("success");
    } catch (err: unknown) {
      console.error('[Manifest] Submit failed', err);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateShop = async (fields: Partial<Shop>) => {
    if (!shop) return;
    try {
      const { error } = await supabase.from('shops').update(fields).eq('id', shop.id);
      if (error) throw error;
      
      setShops(prev => prev.map(s => s.id === shop.id ? { ...s, ...fields } : s));
      toast.success("Shop updated successfully");
    } catch (err) {
      console.error("Shop update error:", err);
      toast.error(friendlyError(err));
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case "selection":
        return (
          <div className="space-y-6 py-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="max-w-2xl mx-auto space-y-8">
                
                {/* Quick Order Hero Banner */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-white border border-amber-300/80 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shrink-0">
                        <Zap className="h-6 w-6 fill-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900">⚡ Quick Order & Instant Customer</h3>
                          <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-[10px] font-bold">Fast Lane</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Start an order immediately with instant customer name or anonymous counter sale</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleStartQuickOrder()}
                      disabled={busy}
                      className="border-amber-300 bg-white text-amber-900 hover:bg-amber-50 font-bold text-xs h-9 px-4 rounded-xl shrink-0 gap-1.5 shadow-xs"
                    >
                      <Zap className="h-3.5 w-3.5 fill-amber-600 text-amber-600" />
                      <span>Walk-in (No Name)</span>
                    </Button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-amber-200/60">
                    <Input
                      placeholder="Add Customer Name (e.g. Rajesh Kirana, Kunal)..."
                      value={quickCustNameInput}
                      onChange={e => setQuickCustNameInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          handleStartQuickOrder(quickCustNameInput, quickCustPhoneInput);
                        }
                      }}
                      className="h-10 rounded-xl bg-white border-amber-200/90 font-medium text-xs text-slate-900 placeholder:text-slate-400"
                    />
                    <Input
                      placeholder="Phone (Optional)"
                      value={quickCustPhoneInput}
                      onChange={e => setQuickCustPhoneInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          handleStartQuickOrder(quickCustNameInput, quickCustPhoneInput);
                        }
                      }}
                      className="h-10 rounded-xl bg-white border-amber-200/90 font-medium text-xs text-slate-900 placeholder:text-slate-400 sm:w-44"
                    />
                    <Button
                      type="button"
                      onClick={() => handleStartQuickOrder(quickCustNameInput, quickCustPhoneInput)}
                      disabled={busy || isCreatingQuickCust}
                      className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-10 px-5 rounded-xl shrink-0 gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                      {isCreatingQuickCust ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      <span>{quickCustNameInput.trim() ? "Create & Start Order" : "Start Quick Order"}</span>
                    </Button>
                  </div>
                </div>

                <div className="space-y-6">
                  <InlineShopSelector 
                    shopId={shopId} 
                    shops={shops} 
                    outstandingBalance={outstandingBalance} 
                    onSelect={handleShopSelect} 
                    onQuickOrder={handleStartQuickOrder}
                    loading={loadingDraft}
                  />
                  
                  {recentShops.length > 0 && !shopId && (
                    <div className="space-y-4">
                      <Label className="text-xs font-bold text-slate-500 ml-1 uppercase tracking-wider">Recent Shops</Label>
                      <div className="flex flex-wrap gap-2.5">
                        {recentShops.map(id => {
                          const s = shops.find(x => x.id === id);
                          if (!s) return null;
                          return (
                            <Badge 
                              key={id} 
                              variant="secondary" 
                              className="cursor-pointer hover:bg-slate-200 transition-all py-2.5 px-5 rounded-2xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 shadow-sm active:scale-95"
                              onClick={() => handleShopSelect(id)}
                            >
                              {s.name}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {shopId && (
                   <div className="pt-6 space-y-4">
                      <Button 
                         onClick={() => setCurrentStep("catalog")}
                         className="w-full h-16 rounded-2xl bg-slate-900 text-white font-bold text-lg shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
                      >
                         Continue to Catalog
                         <ChevronDown className="h-5 w-5 -rotate-90" />
                      </Button>
                      
                      <Button 
                         variant="outline"
                         onClick={() => handleRepeatLastOrder(shopId)}
                         disabled={loadingLastOrder}
                         className="w-full h-12 rounded-2xl border-slate-200 text-slate-600 font-bold text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-3"
                      >
                         {loadingLastOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                         Repeat Last Order
                      </Button>
                   </div>
                )}
             </div>
          </div>
        );
      case "catalog":
        return (
          <ProductCatalog 
            warehouseId={warehouseId} 
            lines={lines} 
            onAdd={(p, b) => addProduct(p, shop, b)} 
            onRemove={(id, bid) => removeLine(id, bid)}
            onUpdateQty={(id, q, bid) => updateLineQty(id, q, bid)}
            onUpdatePackType={(id, pt, bid) => updateLinePackType(id, pt, shop, bid)}
            onUpdatePrice={updateLinePrice}
            onViewReview={() => setCartOpen(true)}
            resolvePrice={(p) => {
              const defaultPack = getDefaultPackType(p);
              const res = resolvePackPrice(
                p.id,
                p,
                defaultPack,
                shopId,
                shop?.shop_type,
                shop?.discount_pct || 0,
                p.inventory?.avg_landed_cost
              );
              return { price: res.price, source: res.source };
            }}
            totals={totals}
            isEditing={!!editId}
            shop={shop}
            orderNumber={orderNumber}
            status={originalStatus}
            orderDate={orderDate}
            onUpdateDate={setOrderDate}
            className="flex-1 h-full min-h-0"
          />
        );
      case "checkout":
        return (
          <div className="max-w-3xl mx-auto space-y-8 py-6 animate-in fade-in slide-in-from-right-4 duration-500">
             <div className="flex items-center justify-between mb-0">
                <Button variant="ghost" onClick={() => setCurrentStep("catalog")} className="h-8 rounded-xl font-bold text-[10px] gap-2 text-slate-400 hover:text-slate-600 px-0 hover:bg-transparent">
                   <ArrowLeft className="h-3.5 w-3.5" />
                   Back to catalog
                </Button>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Checkout Review</h2>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                <div className="md:col-span-12 space-y-4">
                   <Card className="border border-border/40 rounded-[1.25rem] bg-white shadow-sm overflow-hidden">
                      <CardContent className="p-3 flex flex-row items-center divide-x divide-slate-100 gap-0">
                         <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
                            <div className="h-9 w-9 rounded-xl bg-brand-primary/5 flex items-center justify-center text-brand-primary shrink-0">
                               <Package className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                               <Label className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5 block">Warehouse</Label>
                               <Select value={warehouseId || "all"} onValueChange={setWarehouseId} disabled={loadingDraft}>
                                  <SelectTrigger className="h-5 p-0 rounded-none bg-transparent border-none font-bold text-xs text-slate-900 shadow-none focus:ring-0 truncate w-full flex flex-row-reverse justify-end gap-1.5 text-left">
                                     <SelectValue placeholder="All Warehouses" />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-2xl border-border shadow-xl">
                                     <SelectItem value="all" className="text-xs font-semibold py-3">All Warehouses (Combined)</SelectItem>
                                     {warehouses.map((w) => (
                                        <SelectItem key={w.id} value={w.id} className="text-xs font-semibold py-3">{w.name}</SelectItem>
                                     ))}
                                  </SelectContent>
                               </Select>
                            </div>
                         </div>
                         
                         <div className="flex items-center gap-3 flex-1 min-w-0 pl-3">
                            <div className="h-9 w-9 rounded-xl bg-brand-accent/30 flex items-center justify-center text-brand-primary shrink-0">
                               <Calendar className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                               <Label className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5 block">Order Date</Label>
                               <Input 
                                  type="date" 
                                  max={new Date().toISOString().slice(0, 10)}
                                  className="h-5 p-0 rounded-none bg-transparent border-none font-bold text-xs text-slate-900 shadow-none focus-visible:ring-0 px-0 w-full" 
                                  value={orderDate} 
                                  onChange={e => setOrderDate(e.target.value)} 
                               />
                            </div>
                         </div>
                      </CardContent>
                   </Card>
                   <OrderSummaryCard 
                    lines={lines}
                    totals={totals} 
                    shop={shop} 
                    outstandingBalance={outstandingBalance} 
                    discountType={discountType} 
                    setDiscountType={setDiscountType} 
                    discountAmount={discountAmount} 
                    setDiscountAmount={setDiscountAmount} 
                    notes={notes} 
                    setNotes={setNotes} 
                    onAction={handleOrderAction} 
                    busy={busy} 
                    isAdmin={isAdmin}
                    onUpdateShop={handleUpdateShop}
                  />
                </div>
             </div>
          </div>
        );
      case "success":
        return (
           <div className="h-[70vh] flex flex-col items-center justify-center text-center p-6 animate-in zoom-in-95 duration-500">
              <div className="h-24 w-24 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-8 shadow-inner">
                 <Check className="h-12 w-12 stroke-[3]" />
              </div>
              <div className="space-y-4 max-w-md">
                 <h2 className="text-3xl font-bold tracking-tight text-slate-900">Order Successful!</h2>
                 <p className="text-slate-500 font-medium">
                    Order <span className="font-bold text-slate-900">#{lastOrderId?.slice(0, 8)}</span> has been recorded. 
                    Value: <span className="font-bold text-slate-900">{fmtINR(totals.total)}</span>
                 </p>
                 <div className="pt-8 flex flex-col gap-3 w-full">
                    <Button 
                       onClick={() => navigate(`/orders/${lastOrderId}`)}
                       className="w-full h-14 rounded-2xl bg-slate-900 text-white font-bold text-base shadow-xl active:scale-95 transition-all"
                    >
                       View Order Detail
                    </Button>
                    <div className="grid grid-cols-2 gap-3">
                       <Button 
                          variant="outline" 
                          onClick={handleFullReset}
                          className="h-12 rounded-xl font-bold text-xs uppercase tracking-wider"
                       >
                          New Order
                       </Button>
                       <Button 
                          variant="outline" 
                          onClick={() => {
                             handleFullReset(true);
                             setCurrentStep("catalog");
                          }}
                          className="h-12 rounded-xl font-bold text-xs uppercase tracking-wider"
                       >
                          Same Shop
                       </Button>
                    </div>
                 </div>
              </div>
           </div>
        );
      default:
        return null;
    }
  };

  if (editId && loadingDraft) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <Loader2 className="h-14 w-14 animate-spin text-primary" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Package className="h-5 w-5 text-primary opacity-40" />
          </div>
        </div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Loading order...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50/50 flex flex-col overflow-hidden relative">
      <div className="shrink-0 z-20">
        <PageHeader 
          title={editId ? "Edit Order" : "New Order"}
          titleColor="#c2410c"
          action={
            <div className="flex items-center gap-2">
              {shop?.credit_limit > 0 && (outstandingBalance + totals.total) > shop.credit_limit && (
                 <div className="hidden lg:flex items-center gap-3 bg-rose-50 border border-rose-100 px-4 py-1.5 rounded-xl animate-in fade-in slide-in-from-top-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider leading-none">Credit Alert</span>
                      <span className="text-[10px] font-bold text-rose-900 leading-none mt-0.5">
                        Over by {fmtINR(outstandingBalance + totals.total - shop.credit_limit)}
                      </span>
                    </div>
                 </div>
              )}
              
              {/* Corner FAB with Badge in Header Area */}
              {lines.filter(l => !l.isRemoved).length > 0 && currentStep === "catalog" && (
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  aria-label={`Open Cart (${lines.filter(l => !l.isRemoved).length} items)`}
                  title="Open Cart"
                  className="relative h-10 w-10 rounded-xl bg-brand-primary hover:bg-orange-700 active:scale-90 text-white flex items-center justify-center shadow-md shadow-orange-600/25 transition-all duration-200 group"
                >
                  <ShoppingBag size={19} className="group-hover:scale-110 transition-transform stroke-[2.2]" />
                  <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-sm ring-1 ring-black/5 animate-in zoom-in-75">
                    {lines.filter(l => !l.isRemoved).length}
                  </span>
                </button>
              )}

              {currentStep === "checkout" && (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-9 px-3 rounded-xl border-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 bg-white shadow-sm hover:bg-slate-50 border-2"
                    onClick={() => handleOrderAction("draft")}
                    disabled={busy || lines.filter(l => !l.isRemoved).length === 0}
                  >
                    <Save size={14} className="text-slate-400" />
                    {!isMobile && "Draft"}
                  </Button>
                  <Button 
                    size="sm"
                    className="h-9 px-3 rounded-xl bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-all shadow-lg"
                    onClick={() => handleOrderAction("pending_approval")}
                    disabled={busy || lines.filter(l => !l.isRemoved).length === 0}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={14} className="stroke-[3]" />}
                    <span>Submit</span>
                  </Button>
                </div>
              )}
  
              <Button 
                variant="ghost" 
                size="icon"
                className="h-10 w-10 rounded-xl text-slate-400 hover:text-slate-900 transition-all active:scale-95"
                onClick={() => {
                  if (editId) navigate(`/orders/${editId}`);
                  else navigate('/orders');
                }} 
              >
                <X size={24} />
              </Button>
            </div>
          }
        />
      </div>

      <main className={cn(
        "flex-1 min-h-0 overscroll-contain flex flex-col",
        currentStep === "catalog" ? "overflow-hidden" : "overflow-y-auto"
      )}>
        <ResponsiveContainer 
          className={cn(
            "px-1 sm:px-4 transition-all flex flex-col min-h-0 flex-1",
            currentStep === "catalog" ? "overflow-hidden" : "mt-1 pb-32"
          )}
        >
          {/* Recent Shops Header - only in Selection mode */}
          {shop?.credit_limit > 0 && (outstandingBalance + totals.total) > shop.credit_limit && currentStep === "selection" && (
             <div className="mb-4 flex items-center gap-3 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl animate-in zoom-in-95">
                <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.1em] leading-none mb-1">Account limit exceeded</p>
                  <p className="text-xs font-bold text-rose-900 leading-tight">
                    Selection carries ₹{fmtINR(outstandingBalance + totals.total - shop.credit_limit)} excess liability.
                  </p>
                </div>
             </div>
          )}
          {renderStep()}
        </ResponsiveContainer>
      </main>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent 
          side={isMobile ? "bottom" : "right"} 
          className={cn(
            "p-0 flex flex-col border-none shadow-2xl bg-slate-50",
            isMobile ? "h-[92vh] rounded-t-[2.5rem]" : "w-full max-w-[420px] sm:max-w-[540px]"
          )}
        >
          <SheetHeader className="p-4 sm:p-5 bg-white border-b border-border/40 shrink-0">
             <div className="flex items-center justify-between">
                <div className="flex flex-col">
                   <SheetTitle className="text-lg sm:text-xl font-black text-slate-900 tracking-tighter leading-none mb-1 sm:mb-1.5 uppercase">Cart</SheetTitle>
                   <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">{lines.length} Items</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-brand-primary/10 text-brand-primary border-none rounded-full px-3 h-6 flex items-center justify-center font-black text-[10px]">
                    {lines.length}
                  </Badge>
                </div>
             </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-5 custom-scrollbar">
              <div className="py-3 sm:py-4 space-y-2 sm:space-y-3">
                <OrderLineItems 
                  lines={lines} 
                  shop={shop} 
                  onRemove={removeLine} 
                  onUpdateQty={updateLineQty} 
                  onUpdatePackType={(id, pt, bid) => updateLinePackType(id, pt, shop, bid)} 
                  onUpdatePrice={updateLinePrice} 
                />
              </div>
            </div>
            
            <div className="p-6 bg-white border-t border-border/40 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
               <div className="mb-4">
                  <div className="flex justify-between items-center mb-2 px-1">
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Value</span>
                     <span className="text-2xl font-bold text-slate-900 tabular-nums">{fmtINR(totals.total)}</span>
                  </div>
               </div>
               <Button 
                onClick={() => {
                  setCartOpen(false);
                  setCurrentStep("checkout");
                }}
                className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-xl active:scale-95 transition-all"
                disabled={busy || lines.length === 0}
               >
                 Review & Checkout
               </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={limitConfirmOpen} onOpenChange={setLimitConfirmOpen}>
        <AlertDialogContent className="rounded-3xl border border-border/40 shadow-2xl p-8 animate-in zoom-in-95">
          <AlertDialogHeader className="space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mb-2">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <AlertDialogTitle className="text-2xl font-bold tracking-tight text-slate-900">Credit Limit Violation</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium text-slate-500 leading-relaxed">
              Order value <span className="text-slate-950 font-bold">{fmtINR(totals.total)}</span> exceeds the shop's credit limit. 
              Do you want to save this as draft or proceed with a manual override?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 flex-col sm:flex-row gap-3">
            <AlertDialogCancel className="rounded-xl h-12 font-bold text-xs uppercase tracking-wider border-slate-200 flex-1 hover:bg-slate-50 transition-colors">Abort</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl h-12 font-bold text-xs uppercase tracking-wider bg-amber-600 hover:bg-amber-700 text-white shadow-lg flex-1 transition-all active:scale-95" onClick={() => performSubmit("pending_approval", true)}>Override & Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
