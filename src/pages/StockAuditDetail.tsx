import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Save, CheckCircle, ArrowLeft, Warehouse as WarehouseIcon, AlertCircle, LayoutGrid, List, ChevronLeft, ChevronRight, Calculator, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Product, StockAudit, Warehouse as WarehouseType, Batch, StockAuditItem } from "@/types";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";
import { convertToBaseUnits } from "@/lib/packaging";
import { cn } from "@/lib/utils";

export default function StockAuditDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [audit, setAudit] = useState<(StockAudit & { warehouses: WarehouseType }) | null>(null);
  const [items, setItems] = useState<StockAuditItem[]>([]);
  const [allocations, setAllocations] = useState<Record<string, { baseQty: number, orders: { order_number: string, status: string, qty: number, pack_type: string }[] }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [syncingStock, setSyncingStock] = useState(false);
  
  const [viewMode, setViewMode] = useState<"table" | "swipe">("table");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  const fetchAuditData = useCallback(async () => {
    setLoading(true);
    try {
      const [auditRes, itemsRawRes] = await Promise.all([
        supabase
          .from("stock_audits")
          .select("*")
          .eq("id", id)
          .single(),
        supabase
          .from("stock_audit_items")
          .select("*")
          .eq("audit_id", id)
          .order("id", { ascending: true }),
      ]);

      if (auditRes.error) throw auditRes.error;
      if (itemsRawRes.error) throw itemsRawRes.error;

      // Manual join because relationship might fail in schema cache
      const pids = Array.from(new Set(itemsRawRes.data.map(i => i.product_id)));
      const wid = auditRes.data.warehouse_id;

      const [prodRes, batchRes, whRes] = await Promise.all([
        supabase.from("products").select("*").in("id", pids),
        supabase.from("inventory_batches").select("*").in("product_id", pids).eq("warehouse_id", wid),
        supabase.from("warehouses").select("*").eq("id", wid).single()
      ]);

      if (whRes.error) throw whRes.error;
      if (!whRes.data.is_active && auditRes.data.status !== 'approved') {
        toast.warning("Warning: This warehouse is currently marked as inactive. Stock adjustments may be restricted.");
      }

      const prodMap = new Map(prodRes.data?.map(p => [p.id, p]));
      // Map product_id to its first active/available batch for display
      const productBatchMap = new Map();
      batchRes.data?.forEach(b => {
        if (!productBatchMap.has(b.product_id) || Number(b.remaining_qty) > 0) {
          productBatchMap.set(b.product_id, b);
        }
      });

      setAudit({ ...auditRes.data, warehouses: whRes.data } as (StockAudit & { warehouses: WarehouseType }));
      setItems((itemsRawRes.data || []).map(i => ({
        ...i,
        system_qty: Number(i.expected_qty || 0),
        physical_qty: Number(i.actual_qty || 0),
        variance: Number(i.reconciliation_qty || 0),
        product: prodMap.get(i.product_id) || null,
        batch: productBatchMap.get(i.product_id) || null
      })) as unknown as StockAuditItem[]);

      // Fetch un-dispatched order allocations for these products
      const orderItemAllocations: Record<string, { baseQty: number, orders: { order_number: string, status: string, qty: number, pack_type: string }[] }> = {};
      try {
        const { data: rawOrderItems, error: oiError } = await supabase
          .from("order_items")
          .select("order_id, product_id, quantity, pack_type")
          .in("product_id", pids);

        if (!oiError && rawOrderItems && rawOrderItems.length > 0) {
          const orderIds = Array.from(new Set(rawOrderItems.map(o => o.order_id)));
          const { data: activeOrders } = await supabase
            .from("orders")
            .select("id, order_number, status, warehouse_id")
            .in("id", orderIds)
            .in("status", ["approved", "pending_approval"]);

          if (activeOrders && activeOrders.length > 0) {
            const activeOrderMap = new Map(activeOrders.map(o => [o.id, o]));
            rawOrderItems.forEach(oi => {
              const ord = activeOrderMap.get(oi.order_id);
              if (ord && ord.warehouse_id === wid) {
                const prod = prodMap.get(oi.product_id);
                if (prod) {
                  const baseQty = convertToBaseUnits(oi.quantity, oi.pack_type, prod as unknown as Product);
                  if (!orderItemAllocations[oi.product_id]) {
                    orderItemAllocations[oi.product_id] = { baseQty: 0, orders: [] };
                  }
                  orderItemAllocations[oi.product_id].baseQty += baseQty;
                  orderItemAllocations[oi.product_id].orders.push({
                    order_number: ord.order_number,
                    status: ord.status,
                    qty: oi.quantity,
                    pack_type: oi.pack_type
                  });
                }
              }
            });
          }
        }
      } catch (err) {
        console.error("Error computing order allocations:", err);
      }
      setAllocations(orderItemAllocations);
    } catch (err: unknown) {
      console.error('[Context] Fetch audit data failed', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchAuditData();
  }, [id, fetchAuditData]);

  const updatePhysicalQty = (itemId: string, val: string) => {
    const qty = val === "" ? 0 : Number(val);
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, physical_qty: qty, variance: qty - item.system_qty }
          : item
      )
    );
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      const updates = items.map((item) => ({
        id: item.id,
        audit_id: item.audit_id,
        product_id: item.product_id,
        expected_qty: item.system_qty,
        actual_qty: item.physical_qty ?? item.system_qty,
        reconciliation_qty: (item.physical_qty ?? item.system_qty) - item.system_qty,
        notes: item.notes || null,
      }));

      const { error } = await supabase.from("stock_audit_items").upsert(updates);
      if (error) throw error;

      toast.success("Draft saved successfully");
    } catch (err: unknown) {
      console.error('[Context] Save draft failed', err);
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const syncSystemStock = async () => {
    if (!audit) return;
    setSyncingStock(true);
    try {
      // 1. Fetch latest batches in this warehouse
      const { data: latestBatches, error: batchError } = await supabase
        .from("inventory_batches")
        .select("*")
        .eq("warehouse_id", audit.warehouse_id);

      if (batchError) throw batchError;

      // Group latest batches by product_id to find latest totals
      const latestProductTotals: Record<string, number> = {};
      latestBatches?.forEach(b => {
        latestProductTotals[b.product_id] = (latestProductTotals[b.product_id] || 0) + Number(b.remaining_qty);
      });

      // Map existing items with updated expected_qty
      const updatedItems = items.map((item) => {
        const latestQty = latestProductTotals[item.product_id] ?? 0;
        const currentPhysical = item.physical_qty ?? latestQty;
        return {
          id: item.id,
          audit_id: item.audit_id,
          product_id: item.product_id,
          expected_qty: latestQty,
          actual_qty: currentPhysical,
          reconciliation_qty: currentPhysical - latestQty,
          notes: item.notes || null,
        };
      });

      // Find any products in latest stock that are not in the existing items list
      const existingProductIds = new Set(items.map(i => i.product_id));
      const newItemsToInsert: {
        audit_id: string;
        product_id: string;
        expected_qty: number;
        actual_qty: number;
        reconciliation_qty: number;
        notes: string | null;
      }[] = [];

      for (const [prodId, totalQty] of Object.entries(latestProductTotals)) {
        if (!existingProductIds.has(prodId) && totalQty > 0) {
          newItemsToInsert.push({
            audit_id: id || "",
            product_id: prodId,
            expected_qty: totalQty,
            actual_qty: totalQty,
            reconciliation_qty: 0,
            notes: null
          });
        }
      }

      // Upsert existing items
      const { error: upsertError } = await supabase
        .from("stock_audit_items")
        .upsert(updatedItems);
      if (upsertError) throw upsertError;

      // Insert new items if any
      if (newItemsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("stock_audit_items")
          .insert(newItemsToInsert);
        if (insertError) throw insertError;
      }

      // Reload all data
      await fetchAuditData();
      toast.success("System stock counts successfully synchronized with live warehouse inventory!");
    } catch (err: unknown) {
      console.error('[Context] Sync stock failed', err);
      toast.error(friendlyError(err));
    } finally {
      setSyncingStock(false);
    }
  };

  const finalizeAudit = async () => {
    if (audit?.warehouses && !audit.warehouses.is_active) {
      console.error('[Context] Cannot finalize audit for inactive warehouse', { warehouseId: audit.warehouse_id });
      toast.error("Audit cannot be finalized for an inactive warehouse");
      return;
    }

    setFinalizing(true);
    try {
      // 1. Auto-save current state to ensure stock_audit_items has physical quantities in database
      const updates = items.map((item) => ({
        id: item.id,
        audit_id: item.audit_id,
        product_id: item.product_id,
        expected_qty: item.system_qty,
        actual_qty: item.physical_qty ?? item.system_qty,
        reconciliation_qty: (item.physical_qty ?? item.system_qty) - item.system_qty,
        notes: item.notes || null,
      }));

      const { error: saveError } = await supabase.from("stock_audit_items").upsert(updates);
      if (saveError) throw saveError;

      // 2. Fetch current batches for these products in this warehouse
      const pids = items.map(i => i.product_id);
      const { data: whBatches, error: whbError } = await supabase
        .from("inventory_batches")
        .select("*")
        .eq("warehouse_id", audit.warehouse_id)
        .in("product_id", pids);

      if (whbError) throw whbError;

      // Group batches by product
      const batchesByProduct: Record<string, typeof whBatches> = {};
      whBatches?.forEach(b => {
        if (!batchesByProduct[b.product_id]) {
          batchesByProduct[b.product_id] = [];
        }
        batchesByProduct[b.product_id].push(b);
      });

      // Prepare items for atomic reconciliation
      const auditPayload: {
        product_id: string;
        batch_id: string;
        warehouse_id: string;
        variance: number;
        notes: string;
      }[] = [];

      for (const item of items) {
        const itemVariance = (item.physical_qty ?? item.system_qty) - item.system_qty;
        if (itemVariance !== 0) {
          const prodBatches = batchesByProduct[item.product_id] || [];
          
          if (itemVariance < 0) {
            // Deduct variance: distribute across active batches
            let remainingToDeduct = Math.abs(itemVariance);
            const sortedBatches = [...prodBatches].sort((a, b) => Number(b.remaining_qty) - Number(a.remaining_qty));
            
            for (const b of sortedBatches) {
              if (remainingToDeduct <= 0) break;
              const batchQty = Number(b.remaining_qty || 0);
              const deductFromThisBatch = Math.min(batchQty, remainingToDeduct);
              if (deductFromThisBatch > 0) {
                auditPayload.push({
                  product_id: item.product_id,
                  batch_id: b.id,
                  warehouse_id: audit.warehouse_id,
                  variance: -deductFromThisBatch,
                  notes: `Audit reconciliation deduction (Audit ID: ${id})`
                });
                remainingToDeduct -= deductFromThisBatch;
              }
            }
            
            if (remainingToDeduct > 0 && sortedBatches.length > 0) {
              const firstBatch = sortedBatches[0];
              const existingPayloadItem = auditPayload.find(p => p.batch_id === firstBatch.id);
              if (existingPayloadItem) {
                existingPayloadItem.variance -= remainingToDeduct;
              } else {
                auditPayload.push({
                  product_id: item.product_id,
                  batch_id: firstBatch.id,
                  warehouse_id: audit.warehouse_id,
                  variance: -remainingToDeduct,
                  notes: `Audit reconciliation deduction (Audit ID: ${id})`
                });
              }
            }
          } else {
            // Add variance: add to the first batch, or create one if none exists
            if (prodBatches.length > 0) {
              const primaryBatch = prodBatches[0];
              auditPayload.push({
                product_id: item.product_id,
                batch_id: primaryBatch.id,
                warehouse_id: audit.warehouse_id,
                variance: itemVariance,
                notes: `Audit reconciliation addition (Audit ID: ${id})`
              });
            } else {
              // Create a default batch
              const { data: anyBatch } = await supabase
                .from("inventory_batches")
                .select("*")
                .eq("product_id", item.product_id)
                .limit(1);

              let targetBatchId: string;
              if (anyBatch && anyBatch.length > 0) {
                const { data: newBatch, error: bInsertError } = await supabase
                  .from("inventory_batches")
                  .insert({
                    product_id: item.product_id,
                    warehouse_id: audit.warehouse_id,
                    batch_number: anyBatch[0].batch_number || "AUDIT-NEW",
                    mfg_date: anyBatch[0].mfg_date,
                    expiry_date: anyBatch[0].expiry_date,
                    cost_price: anyBatch[0].cost_price || 0,
                    landed_cost: anyBatch[0].landed_cost || 0,
                    received_qty: 0,
                    remaining_qty: 0
                  })
                  .select()
                  .single();

                if (bInsertError) throw bInsertError;
                targetBatchId = newBatch.id;
              } else {
                const { data: newBatch, error: bInsertError } = await supabase
                  .from("inventory_batches")
                  .insert({
                    product_id: item.product_id,
                    warehouse_id: audit.warehouse_id,
                    batch_number: "AUDIT-GEN",
                    cost_price: 0,
                    landed_cost: 0,
                    received_qty: 0,
                    remaining_qty: 0
                  })
                  .select()
                  .single();

                if (bInsertError) throw bInsertError;
                targetBatchId = newBatch.id;
              }

              auditPayload.push({
                product_id: item.product_id,
                batch_id: targetBatchId,
                warehouse_id: audit.warehouse_id,
                variance: itemVariance,
                notes: `Audit reconciliation addition (Audit ID: ${id})`
              });
            }
          }
        }
      }

      if (auditPayload.length > 0) {
        const { error: rpcError } = await supabase.rpc('reconcile_stock', {
          p_audit_id: id,
          p_performed_by: user?.id,
          p_items: auditPayload
        });
        if (rpcError) throw rpcError;
      }

      // 3. Update audit status
      const { error: statusError } = await supabase
        .from("stock_audits")
        .update({
          status: "approved",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (statusError) throw statusError;

      try {
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["stock-movement"] });
        queryClient.invalidateQueries({ queryKey: ["v_stock_ledger_details"] });
        queryClient.invalidateQueries({ queryKey: ["stock"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["recommended-batches"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      } catch (cacheErr) {
        console.warn("Audit finalize cache invalidation warning:", cacheErr);
      }

      toast.success("Audit finalized and inventory reconciled");
      navigate("/stock/audits");
    } catch (err: unknown) {
      console.error('[Context] Finalize audit failed', err);
      toast.error(friendlyError(err));
    } finally {
      setFinalizing(false);
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;
  if (loading) return <div className="p-12 text-center text-muted-foreground italic">Loading audit session...</div>;
  if (!audit) return <div className="p-12 text-center text-muted-foreground">Audit not found</div>;

  const totalVariance = items.reduce((sum, item) => sum + (item.variance || 0), 0);
  const isCompleted = audit.status === "approved";
  const currentItem = items[currentIndex];

  const nextItem = () => {
    if (currentIndex < items.length - 1) {
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
    }
  };

  const prevItem = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0
    })
  };

  return (
    <div className="mx-auto space-y-5 pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" onClick={() => navigate("/stock/audits")} className="h-11 md:h-8 rounded-lg mb-2 opacity-60 hover:opacity-100 px-3">
            <ArrowLeft className="h-3.5 w-3.5 mr-2" />
            Back to Audits
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black uppercase tracking-tight">Count Session</h1>
            <Badge className={cn(
              "rounded-md px-2 py-0.5 font-black text-[9px] uppercase tracking-widest",
              audit.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
              audit.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200' : ''
            )}>
              {audit.status === 'pending' ? 'draft' : audit.status === 'approved' ? 'completed' : audit.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <WarehouseIcon className="h-4 w-4" />
            <span className="font-bold text-sm uppercase">{audit.warehouses?.name}</span>
          </div>
        </div>

        {!isCompleted && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-xl self-start sm:self-center">
              <Button 
                variant={viewMode === 'table' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('table')}
                className="rounded-lg px-3 font-bold text-[11px] uppercase tracking-wider h-8"
              >
                <List className="h-3.5 w-3.5 mr-1.5" />
                Table
              </Button>
              <Button 
                variant={viewMode === 'swipe' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('swipe')}
                className="rounded-lg px-3 font-bold text-[11px] uppercase tracking-wider h-8"
              >
                <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
                Swipe
              </Button>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={syncSystemStock} 
                disabled={syncingStock} 
                className="h-12 px-6 rounded-xl font-bold border-2 border-dashed border-amber-300 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-400 text-amber-700 transition-colors"
                title="Sync system stock snapshot with current active warehouse stock"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", syncingStock && "animate-spin")} />
                {syncingStock ? "Syncing..." : "Sync Stock"}
              </Button>
              <Button variant="outline" onClick={saveDraft} disabled={saving} className="h-12 px-6 rounded-xl font-bold border-2">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Draft"}
              </Button>
              <Button onClick={finalizeAudit} disabled={finalizing} className="h-12 px-8 rounded-xl font-bold bg-brand-primary text-white shadow-lg shadow-brand-primary/20">
                <CheckCircle className="h-4 w-4 mr-2" />
                {finalizing ? "Processing..." : "Finalize & Reconcile"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-6">
          <Card className="p-5 rounded-2xl border-2 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-3 w-3" />
              Audit Summary
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Total Lines</p>
                <p className="text-xl font-black">{items.length}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Lines Counted</p>
                <p className="text-xl font-black">{items.filter(i => i.physical_qty !== null).length}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">System Stock</p>
                <p className="text-xl font-black">{items.reduce((s, i) => s + i.system_qty, 0)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">Net Variance</p>
                <p className={cn("text-xl font-black", totalVariance < 0 ? "text-destructive" : totalVariance > 0 ? "text-emerald-600" : "")}>
                  {totalVariance > 0 ? "+" : ""}{totalVariance}
                </p>
              </div>
            </div>
          </Card>

          {viewMode === 'swipe' && (
            <div className="hidden md:block space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Progress Index</h4>
              <div className="grid grid-cols-5 gap-1.5">
                {items.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      "h-8 rounded-lg text-[10px] font-bold transition-all border-2",
                      currentIndex === idx 
                        ? "bg-brand-primary text-white border-brand-primary" 
                        : item.physical_qty !== null 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                          : "bg-muted/10 text-muted-foreground border-transparent hover:border-muted"
                    )}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <Card className="md:col-span-2 rounded-3xl border-2 overflow-hidden shadow-sm min-h-[500px] flex flex-col relative bg-muted/5">
          {viewMode === 'table' ? (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-black text-[10px] uppercase tracking-widest py-4 pl-6">Product & Batch</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-center">System</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-center w-32">Physical</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest text-right pr-6">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const allocated = allocations[item.product_id];
                  const matchAlloc = allocated && item.variance !== null && item.variance === -allocated.baseQty;
                  return (
                    <TableRow key={item.id} className="font-medium h-20">
                      <TableCell className="pl-6 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-sm uppercase">{item.product?.name}</span>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-md font-mono text-[9px] uppercase px-1.5 py-0">#{item.batch?.batch_number}</Badge>
                            <StockBreakdownDisplay 
                              stockBaseUnits={item.system_qty} 
                              product={item.product as Product} 
                              variant="compact" 
                              className="text-[9px] opacity-60"
                            />
                            {allocated && allocated.baseQty > 0 && (
                              <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100 rounded-md text-[9px] font-bold px-1.5 py-0">
                                📦 {allocated.baseQty} Pending Dispatch
                              </Badge>
                            )}
                            {matchAlloc && (
                              <span className="text-[10px] font-extrabold uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-1">
                                ✨ Matches Allocated Orders Qty
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono font-bold text-slate-500">
                        {item.system_qty}
                      </TableCell>
                      <TableCell className="text-center">
                        {isCompleted ? (
                          <span className="font-black text-lg">{item.physical_qty}</span>
                        ) : (
                          <Input 
                            type="number" 
                            inputMode="decimal"
                            value={item.physical_qty ?? ""}
                            onChange={(e) => updatePhysicalQty(item.id, e.target.value)}
                            className="h-11 md:h-10 text-center font-black text-lg rounded-xl border-2 bg-muted/20 focus:ring-brand-primary/20"
                            placeholder="0"
                          />
                        )}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      {item.variance !== null && (
                        <div className="flex flex-col items-end">
                          <Badge variant={item.variance === 0 ? 'outline' : item.variance < 0 ? 'destructive' : 'default'}
                            className={cn(
                              "rounded px-2 font-black text-[10px]",
                              item.variance > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : 
                              item.variance < 0 ? "bg-destructive/10 text-destructive border-destructive/20" : ""
                            )}>
                            {item.variance > 0 ? "+" : ""}{item.variance}
                          </Badge>
                          <StockBreakdownDisplay 
                            stockBaseUnits={Math.abs(item.variance)} 
                            product={item.product as Product} 
                            variant="compact" 
                            className="text-[9px] opacity-40 mt-1"
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex-1 flex flex-col p-6 space-y-6">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-primary/60">
                  Counting {currentIndex + 1} of {items.length}
                </span>
                <Badge variant="outline" className="font-mono text-[10px] rounded-lg">
                  {Math.round(((items.filter(i => i.physical_qty !== null).length) / items.length) * 100)}% Complete
                </Badge>
              </div>

              <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={currentIndex}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      x: { type: "spring", stiffness: 300, damping: 30 },
                      opacity: { duration: 0.2 }
                    }}
                    className="w-full flex-1 flex flex-col items-center justify-center space-y-8"
                  >
                    <div className="text-center space-y-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40">ITEM {currentIndex + 1}</div>
                      <h2 className="text-4xl font-black uppercase tracking-tight leading-none max-w-md mx-auto">
                        {currentItem?.product?.name}
                      </h2>
                      <div className="flex items-center justify-center gap-2">
                        <Badge variant="outline" className="rounded-xl px-3 py-1 font-mono text-xs border-2 bg-white">
                          BATCH: #{currentItem?.batch?.batch_number}
                        </Badge>
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200 rounded-xl px-3 py-1 font-bold text-xs uppercase">
                          System: {currentItem?.system_qty}
                        </Badge>
                      </div>
                      {(() => {
                        const currentAllocated = currentItem ? allocations[currentItem.product_id] : null;
                        const currentMatchAlloc = currentAllocated && currentItem && currentItem.variance !== null && currentItem.variance === -currentAllocated.baseQty;
                        if (!currentAllocated || currentAllocated.baseQty <= 0) return null;
                        return (
                          <div className="mt-3 flex flex-col items-center gap-1.5">
                            <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100 rounded-xl px-3 py-1 font-bold text-xs uppercase">
                              📦 {currentAllocated.baseQty} Units Pending Dispatch
                            </Badge>
                            {currentMatchAlloc && (
                              <div className="text-[11px] font-extrabold uppercase text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                                ✨ Matches Allocated Orders Qty
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="w-full max-w-xs space-y-4">
                      <div className="relative group">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-3 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 border-x-2 border-t-2 rounded-t-lg z-10">Physical Count</div>
                        <Calculator className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground group-focus-within:text-brand-primary transition-colors" />
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={currentItem?.physical_qty ?? ""}
                          onChange={(e) => updatePhysicalQty(currentItem.id, e.target.value)}
                          className="h-28 w-full text-center text-6xl font-black rounded-[2.5rem] border-4 focus:border-brand-primary bg-white shadow-xl shadow-slate-200/50 pl-14 outline-none transition-all focus:ring-0"
                          placeholder="0"
                        />
                      </div>
                      
                      {currentItem?.variance !== null && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex flex-col items-center gap-2"
                        >
                          <div className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-2xl font-black text-sm border-2",
                            currentItem.variance === 0 ? "bg-slate-50 text-slate-400 border-slate-100" :
                            currentItem.variance > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-destructive/5 text-destructive border-destructive/10"
                          )}>
                            VARIANCE: {currentItem.variance > 0 ? "+" : ""}{currentItem.variance}
                          </div>
                          <StockBreakdownDisplay 
                            stockBaseUnits={Math.abs(currentItem.variance)} 
                            product={currentItem.product as Product} 
                            variant="compact" 
                            className="text-xs font-bold opacity-40 uppercase tracking-widest"
                          />
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4">
                <Button 
                  variant="outline" 
                  onClick={prevItem} 
                  disabled={currentIndex === 0}
                  className="h-20 rounded-3xl border-2 font-black uppercase text-xs tracking-widest hover:bg-muted/50"
                >
                  <ChevronLeft className="h-6 w-6 mr-2" />
                  PREV
                </Button>
                <Button 
                  onClick={nextItem} 
                  disabled={currentIndex === items.length - 1}
                  className={cn(
                    "h-20 rounded-3xl font-black uppercase text-xs tracking-widest shadow-2xl transition-all",
                    currentItem?.physical_qty !== null ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-900 hover:bg-black text-white"
                  )}
                >
                  {currentIndex === items.length - 1 ? "FINISH" : "NEXT"}
                  <ChevronRight className="h-6 w-6 ml-2" />
                </Button>
              </div>

              {currentIndex === items.length - 1 && currentItem?.physical_qty !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Button 
                    onClick={finalizeAudit} 
                    disabled={finalizing}
                    className="w-full h-18 rounded-3xl bg-brand-primary text-white font-black uppercase tracking-[0.1em] shadow-xl shadow-brand-primary/30 border-b-4 border-brand-primary/50"
                  >
                    <CheckCircle className="h-5 w-5 mr-3" />
                    Complete Reconciliation
                  </Button>
                </motion.div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
