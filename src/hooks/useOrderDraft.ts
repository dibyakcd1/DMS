import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { useAuth } from "@/context/AuthContextCore";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { 
  Line, 
  Product, 
  Shop, 
  PriceTierMap, 
  PriceOverrideMap, 
  NewOrderPackType 
} from "@/types";
import { 
  type PricingProduct, 
  type PackType,
  type ShopType,
  getPackMultiplier,
  resolvePrice,
  landedCostPerLevel,
  detectLandedCostBasis
} from "@/lib/pricing";
import { convertToBaseUnits, getAvailableSellUnits, toDbPackType, isProductDozenPackaging } from "@/lib/packaging";
import { resolveCompanyInfo, groupLinesByCompany, resolveEffectiveGstRate, CompanySummary } from "@/lib/company-helpers";

interface UseOrderDraftProps {
  editId?: string;
  initialShopId?: string;
}

export function useOrderDraft({ editId, initialShopId }: UseOrderDraftProps = {}) {
  const currentUser = useCurrentUser();
  const { profile, loadingData: authLoadingData } = useAuth();
  const [shopId, setShopId] = useState<string>(initialShopId || "");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [lines, setLines] = useState<Line[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<"flat" | "pct">("flat");
  const [priceTiers, setPriceTiers] = useState<PriceTierMap>({});
  const [priceOverrides, setPriceOverrides] = useState<PriceOverrideMap>({});
  const [outstandingBalance, setOutstandingBalance] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [persistedId, setPersistedId] = useState<string | undefined>(editId);
  const [originalStatus, setOriginalStatus] = useState<string | null>(null);
  const [originalLines, setOriginalLines] = useState<Line[]>([]);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [salespersonId, setSalespersonId] = useState<string | null>(null);

  const lastLoadedIdRef = useRef<string | undefined>(undefined);

  const totals = useMemo(() => {
    const activeLines = lines.filter(l => !l.isRemoved);
    const subtotal = activeLines.reduce((s, l) => s + (parseFloat(String(l.unit_price)) || 0) * (parseFloat(String(l.quantity)) || 0), 0);
    const gst = activeLines.reduce((s, l) => {
      const price = parseFloat(String(l.unit_price)) || 0;
      const qty = parseFloat(String(l.quantity)) || 0;
      const rate = resolveEffectiveGstRate(l);
      return s + (price * qty * (rate / 100));
    }, 0);
    const totalBeforeDiscount = subtotal + gst;
    
    const calculatedDiscount = discountType === 'pct' 
      ? (totalBeforeDiscount * (Number(discountAmount) / 100))
      : Number(discountAmount);

    const safeDiscount = Math.min(Math.max(0, calculatedDiscount), totalBeforeDiscount);
    const totalLandedCost = activeLines.reduce((s, l) => {
      const landed = parseFloat(String(l.avg_landed_cost)) || 0;
      const qty = parseFloat(String(l.quantity)) || 0;
      const pts = l as unknown as Product;
      return s + (landed * convertToBaseUnits(qty, l.packType, pts));
    }, 0);
    const grossMarginPct = subtotal > 0 ? ((subtotal - totalLandedCost) / subtotal) * 100 : 0;
    const companyBreakdown = groupLinesByCompany(lines);

    return { 
      subtotal, 
      gst, 
      total: totalBeforeDiscount - safeDiscount,
      calculatedDiscount: safeDiscount,
      totalLandedCost,
      grossMarginPct,
      hasLowMarginItem: activeLines.some(l => l.isLowMargin),
      companyBreakdown,
      companyCount: companyBreakdown.length
    };
  }, [lines, discountAmount, discountType]);

  const loadDraft = useCallback(async (id: string) => {
    if (!id || id === "null") return;
    
    console.log("[Draft] loadDraft initiating for ID:", id);
    setLoading(true);
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .select(`
          *,
          order_items (
            *,
            product:products (
              *,
              inventory:inventory_product_id_fkey(stock_base_units, warehouse_id, avg_landed_cost)
            ),
            batch:inventory_batches (
              id,
              batch_number,
              landed_cost,
              expiry_date,
              remaining_qty
            )
          )
        `)
        .eq("id", id)
        .single();

      if (error) {
        console.error("[Draft] Supabase fetch error:", error);
        throw error;
      }

      if (!order) {
        console.warn("[Draft] No order found for ID:", id);
        return;
      }

      console.log("[Draft] Order found, items count:", order.order_items?.length || 0);

      setShopId(order.shop_id);
      setWarehouseId(order.warehouse_id || "");
      setDiscountAmount(Number(order.discount_amount || 0));
      setDiscountType(order.discount_type as "flat" | "pct" || "flat");
      setNotes(order.notes || "");
      const draftDate = order.order_date || new Date(order.created_at).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      setOrderDate(draftDate > today ? today : draftDate);
      setPersistedId(order.id);
      setOriginalStatus(order.status);
      setOrderNumber(order.order_number);
      setSalespersonId(order.salesperson_id);
      lastLoadedIdRef.current = order.id;

      if (!order.order_items || order.order_items.length === 0) {
        console.log("[Draft] Order has no items, clearing lines");
        setLines([]);
        return;
      }

      type OrderItemWithProduct = Database["public"]["Tables"]["order_items"]["Row"] & {
        product: (Product & { inventory: { stock_base_units: number; avg_landed_cost: number; warehouse_id: string }[] }) | null;
        batch?: {
          id: string;
          batch_number: string;
          landed_cost: number;
          expiry_date: string;
          remaining_qty: number;
        } | null;
      };

      interface ProductWithInventory extends Product {
        inventory: { stock_base_units: number; warehouse_id: string; avg_landed_cost?: number }[];
      }
      
      interface RawOrderItem {
        product_id: string;
        product: unknown;
        pack_type: string;
        unit_price: number;
        gst_rate?: number;
        quantity: number;
        batch_id?: string;
        batch?: {
          batch_number: string;
          remaining_qty: number;
          landed_cost?: number;
        };
      }
      
      const itemLines: Line[] = (order.order_items as unknown as RawOrderItem[]).map((item) => {
        const rawP = item.product;
        // The product item might be a single object or an array of one if joined via HasMany
        const p = (Array.isArray(rawP) ? rawP[0] : rawP) as ProductWithInventory | null;
        
        // Handle inventory filtering by warehouse if possible, otherwise first
        const rawInv = p?.inventory;
        const invArray = Array.isArray(rawInv) ? rawInv : (rawInv ? [rawInv] : []);
        const warehouseInv = order.warehouse_id 
          ? invArray.find((i: { warehouse_id: string }) => i.warehouse_id === order.warehouse_id) 
          : invArray[0];
        
        const inv = warehouseInv || invArray[0];

        if (!p) {
          console.warn(`[Draft] Product ID ${item.product_id} not joined in order_items fetch`);
        }

        const packType = (item.pack_type === "unit" ? "pcs" : (item.pack_type || "pcs")) as NewOrderPackType;
        const compInfo = resolveCompanyInfo({
          company: p?.company,
          company_id: p?.company_id,
          brand: p?.brand,
          sku: p?.sku,
          name: p?.name,
          id: item.product_id,
          hsn: p?.hsn,
          division_category: p?.division_category
        });

        const itemRec = item as Record<string, unknown>;
        const pRec = (p || {}) as Record<string, unknown>;
        const effectiveGstRate = resolveEffectiveGstRate({
          gst_rate: item.gst_rate,
          cgst_rate: (itemRec.cgst_rate as number | undefined) ?? (pRec.cgst_rate as number | undefined),
          sgst_rate: (itemRec.sgst_rate as number | undefined) ?? (pRec.sgst_rate as number | undefined),
          igst_rate: (itemRec.igst_rate as number | undefined) ?? (pRec.igst_rate as number | undefined),
          hsn: p?.hsn,
          sku: p?.sku,
          name: p?.name,
          product: p
        });

        return {
          product_id: item.product_id,
          name: p?.name || "Unknown Product",
          sku: p?.sku || "N/A",
          company_id: compInfo.id,
          company_name: compInfo.name,
          company_short_code: compInfo.short_code,
          company_accent_hex: compInfo.accent_hex,
          brand: p?.brand,
          mrp: p?.mrp || 0,
          unit_price: Number(item.unit_price),
          gst_rate: effectiveGstRate,
          cgst_rate: (pRec.cgst_rate as number | undefined) ?? (effectiveGstRate / 2),
          sgst_rate: (pRec.sgst_rate as number | undefined) ?? (effectiveGstRate / 2),
          igst_rate: (pRec.igst_rate as number | undefined) ?? 0,
          quantity: Number(item.quantity),
          stock: item.batch ? Number(item.batch.remaining_qty || 0) : (inv?.stock_base_units ?? 0),
          packType,
          avg_landed_cost: Number(item.batch?.landed_cost ?? inv?.avg_landed_cost ?? 0),
          batch_id: item.batch_id,
          batch_number: item.batch?.batch_number,
          item_pack_type: p?.item_pack_type,
          division_category: p?.division_category,
          pack_size_value: p?.pack_size_value,
          pack_size_unit: p?.pack_size_unit,
          case_qty_unit: p?.case_qty_unit,
          case_qty_value: p?.case_qty_value,
          unit_type: p?.unit_type,
          weight_per_unit_grams: p?.weight_per_unit_grams,
          display_weight_unit: p?.display_weight_unit,
          units_per_packet: p?.units_per_packet,
          packets_per_case: p?.packets_per_case,
          units_per_case: p?.units_per_case,
        } as Line;
      });
      setLines(itemLines);
      setOriginalLines(JSON.parse(JSON.stringify(itemLines)));
    } catch (error: unknown) {
      console.error("[Context] Draft load error:", error);
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const resetDraft = useCallback(async (keepContext = false) => {
    setLoading(true);
    try {
      setLines([]);
      if (!keepContext) {
        setShopId("");
        setWarehouseId("");
      }
      setDiscountAmount(0);
      setNotes("");
      setPersistedId(undefined);
      setOrderNumber(null);
      setSalespersonId(null);
      lastLoadedIdRef.current = undefined;
      
      if (!keepContext) {
        toast.success("Draft cleared locally");
      }
    } catch (err) {
      console.error("Reset error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (editId && editId !== lastLoadedIdRef.current) {
      loadDraft(editId);
    }
  }, [editId, loadDraft]);

  useEffect(() => {
    if (!editId && !warehouseId) {
      setWarehouseId("all");
    }
  }, [editId, warehouseId]);

  const savingRef = useRef(false);
  const lastSavedStateRef = useRef<string>("");

  const saveDraft = useCallback(async () => {
    // Never auto-save when editing an existing order that is already past draft stage.
    // Auto-save is only safe for true new drafts (no editId) or orders still in draft status.
    if (!currentUser?.id || lines.length === 0 || !shopId || savingRef.current || (editId && originalStatus !== 'draft')) return;

    // Prevent saving if profile is missing (and not a PIN user) to avoid foreign key violations on salesperson_id
    if (currentUser && !currentUser.isPinUser && (authLoadingData || !profile)) {
      console.log("[Draft] Delaying auto-save because profile is not fully loaded/repaired yet.");
      return;
    }

    const activeLines = lines.filter(l => !l.isRemoved);
    if (activeLines.length === 0 && lines.length > 0) return; // All removed, wait for more actions

    const currentState = JSON.stringify({
      shopId,
      warehouseId,
      lines: activeLines.map(l => ({ id: l.product_id, q: l.quantity, p: l.unit_price, b: l.batch_id })),
      discountAmount,
      discountType,
      notes,
      orderDate
    });

    if (currentState === lastSavedStateRef.current) return;

    savingRef.current = true;
    try {
      const orderPayload = {
        shop_id: shopId,
        warehouse_id: (warehouseId && warehouseId !== "all" && warehouseId !== "null") ? warehouseId : null,
        salesperson_id: currentUser.id,
        status: "draft",
        subtotal: totals.subtotal,
        gst_total: totals.gst,
        total: totals.total,
        discount_amount: totals.calculatedDiscount,
        discount_type: discountType,
        notes,
        order_date: orderDate,
      };

      const itemsPayload = activeLines.map(l => {
        const lineExclusive = Number(l.unit_price) * Number(l.quantity);
        const rate = resolveEffectiveGstRate(l);
        const lineTax = lineExclusive * (rate / 100);
        return {
          product_id: l.product_id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
          pack_type: toDbPackType(l.packType),
          gst_rate: rate,
          line_total: Number((lineExclusive + lineTax).toFixed(2)),
          batch_id: l.batch_id || null
        };
      });

      let { data: newId, error: rpcError } = await supabase.rpc('save_draft_order_v4', {
        p_order_id: persistedId || null,
        p_order_data: orderPayload,
        p_items: itemsPayload
      });

      if (rpcError && (rpcError.code === '22P02' || rpcError.message?.includes('pack_type'))) {
        console.warn("[Draft] Retrying draft save with fallback pack_type values for strict DB enum compatibility...");
        const fallbackItems = itemsPayload.map(item => ({
          ...item,
          pack_type: item.pack_type === 'doz' ? 'packet' : item.pack_type
        }));
        const retryResult = await supabase.rpc('save_draft_order_v4', {
          p_order_id: persistedId || null,
          p_order_data: orderPayload,
          p_items: fallbackItems
        });
        newId = retryResult.data;
        rpcError = retryResult.error;
      }

      if (rpcError) throw rpcError;
      
      if (newId && newId !== persistedId) {
        setPersistedId(newId);
        lastLoadedIdRef.current = newId;
      }
      
      lastSavedStateRef.current = currentState;
      console.log("Draft saved successfully:", newId);
    } catch (error) {
      console.error("Auto-save draft error:", error);
    } finally {
      savingRef.current = false;
    }
  }, [currentUser, shopId, warehouseId, lines, discountAmount, discountType, notes, orderDate, persistedId, totals, editId, originalStatus, authLoadingData, profile]);

  // Debounced auto-save
  useEffect(() => {
    if (lines.length > 0 && shopId && !loading && !editId) {
      const timer = setTimeout(saveDraft, 2000);
      return () => clearTimeout(timer);
    }
  }, [lines, shopId, discountAmount, discountType, notes, orderDate, warehouseId, saveDraft, loading, editId]);

  const resolvePackPrice = useCallback((
    productId: string,
    product: PricingProduct,
    packType: NewOrderPackType,
    currentShopId?: string,
    shopType?: Shop["shop_type"],
    discountPct: number = 0,
    customLandedCost?: number
  ) => {
    const savedTiers = new Map<string, number>();
    if (shopType && priceTiers[shopType]?.[productId]) {
      Object.entries(priceTiers[shopType][productId]).forEach(([pt, price]) => {
        if (price) savedTiers.set(`${shopType}:${pt}`, price);
      });
    }

      const shopOverride = currentShopId && priceOverrides[currentShopId]?.[productId]?.[packType];

      const landedCost = Number(
        customLandedCost ?? 
        ((product as unknown as { inventory?: { avg_landed_cost: number }; avg_landed_cost?: number; cost_price?: number }).inventory?.avg_landed_cost ?? 
         (product as unknown as { avg_landed_cost?: number; cost_price?: number }).avg_landed_cost ?? 
         (product as unknown as { cost_price?: number }).cost_price ?? 0)
      );

      const { price: resolvedBasePrice, source } = resolvePrice({
        product: product as unknown as PricingProduct,
        packType: packType as PackType,
        shopType: (shopType || "silver") as ShopType,
        savedTiers,
        shopOverride,
        rbpFallback: null,
        landedCost
      });

      let finalPrice = resolvedBasePrice;
      if (discountPct > 0) {
        finalPrice = finalPrice * (1 - discountPct / 100);
      }

      const packMult = getPackMultiplier(product as unknown as PricingProduct, packType as PackType);
      const packLandedCost = Math.round(landedCost * packMult * 100) / 100;
      const marginFloor = packLandedCost * 1.02;
      const isLowMargin = finalPrice < marginFloor && packLandedCost > 0;

      return { price: finalPrice, source, isLowMargin };
    }, [priceTiers, priceOverrides]);

  const getDefaultPackType = useCallback((product: Product): NewOrderPackType => {
    if (product.preferred_sell_unit) {
      const psu = product.preferred_sell_unit.toLowerCase();
      if (psu === 'doz' || psu === 'dozen' || psu === 'dz') return 'doz';
      if (psu === 'packet' || psu === 'pkt' || psu === 'pack') return 'packet';
      if (psu === 'kg') return 'kg';
      if (psu === 'case' || psu === 'ctn' || psu === 'carton') return 'case';
      if (psu === 'g' || psu === 'gms') return 'g';
      if (psu === 'ml') return 'ml';
      if (psu === 'ltr' || psu === 'l') return 'ltr';
      if (psu === 'pcs' || psu === 'unit' || psu === 'pc') return 'pcs';
    }
    const available = getAvailableSellUnits(product as unknown as Product);
    const u = available[0] || 'pcs';
    const lower = u.toLowerCase();
    if (lower === 'doz' || lower === 'dozen' || lower === 'dz') return 'doz';
    if (lower === 'packet' || lower === 'pkt') return 'packet';
    if (lower === 'case' || lower === 'ctn' || lower === 'carton') return 'case';
    if (lower === 'kg') return 'kg';
    if (lower === 'g' || lower === 'gms') return 'g';
    if (lower === 'ml') return 'ml';
    if (lower === 'ltr' || lower === 'l') return 'ltr';
    return 'pcs';
  }, []);

  const addProduct = useCallback((p: Product, currentShop?: Shop, batch?: Batch & { isFifoPriority?: boolean }) => {
    const stock = batch ? batch.remaining_qty : (p.inventory?.stock_base_units ?? 0);
    const packType = getDefaultPackType(p);
    const multiplier = getPackMultiplier(p as unknown as Product, packType as PackType);
    
    if (multiplier > stock && stock > 0) {
       toast.error(`Not enough stock to add even one ${packType} from this ${batch ? 'batch' : 'inventory'}`);
       return;
    }
    if (stock <= 0) return toast.error("Out of stock");

    setLines((prev) => {
      // If adding a specific batch, differentiate from global product entry
      const ex = prev.find(l => l.product_id === p.id && (!batch || l.batch_id === batch.id));
      if (ex) {
        if (ex.isRemoved) {
          // Reactivate it
          return prev.map(l => (l.product_id === p.id && (!batch || l.batch_id === batch.id)) ? { ...l, isRemoved: false, quantity: 1 } : l);
        }

        const nextQty = ex.quantity + 1;
        if (nextQty * multiplier > stock) {
          toast.error(`Stock limit reached`);
          return prev;
        }

        const isOrig = originalLines.find(o => o.product_id === p.id && (!batch || o.batch_id === batch.id));
        const modified = isOrig ? (nextQty !== isOrig.quantity) : false;

        return prev.map(l => (l.product_id === p.id && (!batch || l.batch_id === batch.id)) ? { 
          ...l, 
          quantity: nextQty,
          isModified: modified
        } : l);
      }

      const { price, source, isLowMargin } = resolvePackPrice(
        p.id, 
        p as unknown as Product, 
        packType, 
        shopId, 
        currentShop?.shop_type, 
        currentShop?.discount_pct || 0,
        batch?.landed_cost
      );

      const isEdit = !!editId;
      const compInfo = resolveCompanyInfo({
        company: p.company,
        company_id: p.company_id,
        brand: p.brand,
        sku: p.sku,
        name: p.name,
        id: p.id,
        hsn: p.hsn,
        division_category: p.division_category
      });

      const pRec = p as unknown as Record<string, unknown>;
      const effectiveGstRate = resolveEffectiveGstRate({
        gst_rate: p.gst_rate,
        cgst_rate: pRec.cgst_rate as number | undefined,
        sgst_rate: pRec.sgst_rate as number | undefined,
        igst_rate: pRec.igst_rate as number | undefined,
        hsn: p.hsn,
        sku: p.sku,
        name: p.name,
        product: p
      });

      return [...prev, {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        company_id: compInfo.id,
        company_name: compInfo.name,
        company_short_code: compInfo.short_code,
        company_accent_hex: compInfo.accent_hex,
        brand: p.brand,
        mrp: p.mrp || 0,
        unit_price: price,
        priceSource: source,
        isLowMargin,
        gst_rate: effectiveGstRate,
        cgst_rate: (pRec.cgst_rate as number | undefined) ?? (effectiveGstRate / 2),
        sgst_rate: (pRec.sgst_rate as number | undefined) ?? (effectiveGstRate / 2),
        igst_rate: (pRec.igst_rate as number | undefined) ?? 0,
        quantity: 1,
        stock,
        packType,
        batch_id: batch?.id,
        batch_number: batch?.batch_number,
        is_fifo: batch?.isFifoPriority,
        item_pack_type: p.item_pack_type,
        division_category: p.division_category,
        pack_size_value: p.pack_size_value,
        pack_size_unit: p.pack_size_unit,
        case_qty_unit: p.case_qty_unit,
        case_qty_value: p.case_qty_value,
        unit_type: p.unit_type,
        weight_per_unit_grams: p.weight_per_unit_grams,
        display_weight_unit: p.display_weight_unit,
        avg_landed_cost: batch ? batch.landed_cost : p.inventory?.avg_landed_cost,
        units_per_packet: p.units_per_packet,
        packets_per_case: p.packets_per_case,
        units_per_case: p.units_per_case,
        isNew: isEdit // If in edit mode and not found in prev, it's new
      }];
    });
  }, [shopId, resolvePackPrice, getDefaultPackType, editId, originalLines]);

  const removeLine = useCallback((productId: string, batchId?: string) => {
    setLines(prev => {
      const isOrig = originalLines.find(o => o.product_id === productId && (!batchId || o.batch_id === batchId));
      if (isOrig && editId) {
        // Mark as removed instead of filtering
        return prev.map(l => (l.product_id === productId && (!batchId || l.batch_id === batchId)) ? { ...l, isRemoved: true } : l);
      }
      return prev.filter(l => !(l.product_id === productId && (!batchId || l.batch_id === batchId)));
    });
  }, [originalLines, editId]);

  const updateLineQty = useCallback((id: string, q: number, batchId?: string) => {
    const qty = Math.max(0, q);
    setLines(prev => prev.map(l => {
      if (l.product_id === id && (!batchId || l.batch_id === batchId)) {
        const multiplier = getPackMultiplier(l as unknown as Product, l.packType as PackType);
        if (qty * multiplier > l.stock) {
          toast.error(`Stock limit reached`);
          return { ...l, quantity: Math.floor(l.stock / multiplier) };
        }
        
        const isOrig = originalLines.find(o => o.product_id === id && (!batchId || o.batch_id === batchId));
        const modified = isOrig ? (qty !== isOrig.quantity) : false;

        return { ...l, quantity: qty, isModified: modified, isRemoved: false };
      }
      return l;
    }));
  }, [originalLines]);

  const updateLinePackType = useCallback((id: string, packType: NewOrderPackType, currentShop?: Shop, batchId?: string) => {
    setLines(prev => prev.map(l => {
      if (l.product_id === id && (!batchId || l.batch_id === batchId)) {
        const prevPackType = (l.packType || 'pcs') as PackType;
        const nextPackType = (packType || 'pcs') as PackType;
        
        const prevMultiplier = getPackMultiplier(l as unknown as Product, prevPackType);
        const nextMultiplier = getPackMultiplier(l as unknown as Product, nextPackType);
        
        let quantity = l.quantity || 1;

        if (quantity * nextMultiplier > l.stock) {
          quantity = Math.max(1, Math.floor(l.stock / nextMultiplier));
        }

        const { price, source, isLowMargin: resolvedLowMargin } = resolvePackPrice(
          l.product_id, 
          l as unknown as Product, 
          packType, 
          shopId, 
          currentShop?.shop_type, 
          currentShop?.discount_pct || 0,
          l.avg_landed_cost
        );

        let finalPrice = price;
        let finalSource = source;
        let finalLowMargin = resolvedLowMargin;

        if (l.priceSource === "Manual" && l.unit_price && l.unit_price > 0) {
          // If price was manually modified for previous pack type, scale it proportionally to the new pack type
          const basePiecePrice = prevMultiplier > 0 ? (l.unit_price / prevMultiplier) : l.unit_price;
          finalPrice = Math.round(basePiecePrice * nextMultiplier * 100) / 100;
          finalSource = "Manual";

          const costForNextPack = Math.round((l.avg_landed_cost || 0) * nextMultiplier * 100) / 100;
          finalLowMargin = finalPrice < costForNextPack * 1.02 && costForNextPack > 0;
        }
        
        const isOrig = originalLines.find(o => o.product_id === id && (!batchId || o.batch_id === batchId));
        const modified = isOrig ? (packType !== isOrig.packType || quantity !== isOrig.quantity || finalPrice !== isOrig.unit_price) : false;

        return { 
          ...l, 
          packType, 
          unit_price: finalPrice, 
          priceSource: finalSource,
          isLowMargin: finalLowMargin,
          quantity,
          isModified: modified
        };
      }
      return l;
    }));
  }, [shopId, resolvePackPrice, originalLines]);

  const updateLinePrice = useCallback((id: string, price: number, batchId?: string) => {
    setLines(prev => prev.map(l => {
      if (l.product_id === id && (!batchId || l.batch_id === batchId)) {
        const isOrig = originalLines.find(o => o.product_id === id && (!batchId || o.batch_id === batchId));
        const modified = isOrig ? (price !== isOrig.unit_price) : false;
        return { ...l, unit_price: price, priceSource: 'Manual', isModified: modified };
      }
      return l;
    }));
  }, [originalLines]);

  return useMemo(() => ({
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
    loading,
    persistedId,
    orderNumber,
    originalStatus,
    salespersonId,
    setSalespersonId,
    addProduct,
    removeLine,
    updateLineQty,
    updateLinePackType,
    updateLinePrice,
    resolvePackPrice,
    getDefaultPackType,
    resetDraft,
    currentUser
  }), [
    shopId, warehouseId, lines, discountAmount, discountType, notes, 
    orderDate, outstandingBalance, priceTiers, priceOverrides, 
    totals, loading, persistedId, orderNumber, originalStatus, salespersonId,
    addProduct, removeLine, updateLineQty, updateLinePackType, updateLinePrice,
    resolvePackPrice, getDefaultPackType,
    resetDraft, currentUser
  ]);
}
