import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Search, Edit2, ChevronLeft, Loader2, Save, History, FileText, 
  CheckCircle2, XCircle, PackageCheck, AlertCircle, Trash2, Plus, 
  X, ChevronRight, RotateCcw, AlertTriangle, Building2, Calendar, 
  Hash, DollarSign, ArrowUpRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmtDate, fmtINR } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { autoCalcAllTiers, getPackMultiplier, type PackType, type PricingProduct, getAllocationInfo, landedCostPerLevel } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/responsive";
import { SupplierCombobox } from "@/components/stock/SupplierCombobox";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type GRNStatus = 'pending' | 'approved' | 'rejected' | 'posted';

type GRN = {
  id: string;
  invoice_number: string;
  supplier_name: string | null;
  invoice_date: string;
  total_amount: number;
  total_freight?: number;
  total_handling?: number;
  warehouse_id?: string | null;
  notes: string | null;
  status: GRNStatus;
  created_at: string;
};

type GRNItem = {
  id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  pack_type: string;
  units_per_packet: number;
  packets_per_case: number;
  line_total?: number;
  batch_number?: string | null;
  expiry_date: string | null;
  mfg_date: string | null;
  products: {
    name: string;
    sku: string;
    mrp: number;
    pack_size_value: number | null;
    pack_size_unit: string | null;
    unit: string | null;
    unit_type?: string | null;
  } | null;
};

export default function StockGRNs() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [search, setSearch] = useState("");
  const [editingGRN, setEditingGRN] = useState<GRN | null>(null);
  const [viewingGRN, setViewingGRN] = useState<GRN | null>(null);
  const [grnItems, setGrnItems] = useState<GRNItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<GRNStatus | 'all'>('all');
  const [grnToDelete, setGrnToDelete] = useState<GRN | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [totalCount, setTotalCount] = useState(0);

  const invalidateAllStockCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["stock-movement"] });
    queryClient.invalidateQueries({ queryKey: ["v_stock_ledger_details"] });
    queryClient.invalidateQueries({ queryKey: ["purchase_invoices"] });
    queryClient.invalidateQueries({ queryKey: ["products-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["products-data"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["reports-data"] });
  }, [queryClient]);

  const fetchGRNs = useCallback(async () => {
    setLoading(true);
    try {
      // Query count and paginated list
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("purchase_invoices")
        .select("*", { count: "exact" })
        .order("invoice_date", { ascending: false })
        .range(from, to);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (search.trim()) {
        query = query.or(`invoice_number.ilike.%${search.trim()}%,supplier_name.ilike.%${search.trim()}%`);
      }

      const { data, count, error } = await query;

      if (error) throw error;
      setGrns((data as GRN[]) || []);
      setTotalCount(count || 0);
    } catch (err: unknown) {
      console.error('[Fetch GRNs]', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchGRNs();
  }, [fetchGRNs]);

  // Load items when viewing an invoice
  useEffect(() => {
    if (!viewingGRN) {
      setGrnItems([]);
      return;
    }
    
    let isCancelled = false;
    const fetchItems = async () => {
      setItemsLoading(true);
      try {
        // 1. Try fetching directly from purchase_invoice_items
        const { data: items, error: itemErr } = await supabase
          .from('purchase_invoice_items')
          .select('*')
          .eq('purchase_invoice_id', viewingGRN.id);
        
        let loadedItems: Array<{
          id: string;
          product_id: string;
          quantity: number;
          unit_cost: number;
          pack_type?: string | null;
          units_per_packet?: number | null;
          packets_per_case?: number | null;
          line_total?: number;
          batch_number?: string | null;
          expiry_date?: string | null;
          mfg_date?: string | null;
        }> = [];

        if (!itemErr && items && items.length > 0) {
          loadedItems = items;
        } else {
          // Fallback: Check inventory_batches if purchase_invoice_items was not populated
          const { data: batchRows } = await supabase
            .from('inventory_batches')
            .select('*')
            .eq('purchase_invoice_id', viewingGRN.id);
          
          if (batchRows && batchRows.length > 0) {
            loadedItems = batchRows.map(b => ({
              id: b.id,
              product_id: b.product_id,
              quantity: b.received_qty || b.remaining_qty || 1,
              unit_cost: b.landed_cost || b.cost_price || 0,
              pack_type: 'packet',
              units_per_packet: 1,
              packets_per_case: 1,
              batch_number: b.batch_number,
              expiry_date: b.expiry_date,
              mfg_date: b.mfg_date
            }));
          }
        }

        if (loadedItems.length === 0) {
          if (!isCancelled) setGrnItems([]);
          return;
        }
        
        // Fetch product metadata
        const pids = Array.from(new Set(loadedItems.map(i => i.product_id)));
        const { data: prods } = await supabase
          .from('products')
          .select('id, name, sku, mrp, pack_size_value, pack_size_unit, unit, unit_type, units_per_packet, packets_per_case')
          .in('id', pids);

        const prodMap = new Map(prods?.map(p => [p.id, p]));
        
        if (!isCancelled) {
          setGrnItems(loadedItems.map(i => {
            const prod = prodMap.get(i.product_id);
            return {
              id: i.id,
              product_id: i.product_id,
              quantity: Number(i.quantity) || 1,
              unit_cost: Number(i.unit_cost) || 0,
              pack_type: i.pack_type || 'packet',
              units_per_packet: i.units_per_packet || prod?.units_per_packet || 1,
              packets_per_case: i.packets_per_case || prod?.packets_per_case || 1,
              batch_number: i.batch_number || null,
              expiry_date: i.expiry_date || null,
              mfg_date: i.mfg_date || null,
              products: prod ? {
                name: prod.name,
                sku: prod.sku,
                mrp: prod.mrp,
                pack_size_value: prod.pack_size_value,
                pack_size_unit: prod.pack_size_unit,
                unit: prod.unit,
                unit_type: prod.unit_type
              } : null
            };
          }));
        }
      } catch (err) {
        console.error('[Fetch GRN Items]', err);
      } finally {
        if (!isCancelled) setItemsLoading(false);
      }
    };
    fetchItems();
    return () => { isCancelled = true; };
  }, [viewingGRN]);

  // Execute GRN Action: Approve, Reject (at any stage), Post / Confirm Stock
  const handleAction = async (grn: GRN, action: GRNStatus) => {
    setActionLoading(true);
    const toastId = toast.loading(`Updating invoice #${grn.invoice_number}...`);
    try {
      // 1. If posting to inventory ('posted')
      if (action === 'posted') {
        // Resolve target warehouse dynamically - never fallback to hardcoded UUID
        let targetWhId = grn.warehouse_id;
        if (!targetWhId) {
          const { data: whRows, error: whErr } = await supabase.from("warehouses").select("id").limit(1);
          if (whErr || !whRows || whRows.length === 0) {
            throw new Error("No active warehouse found in database. Please configure a warehouse before posting inventory.");
          }
          targetWhId = whRows[0].id;
        }

        // Get items to inward
        let itemsToInward = grnItems;
        if (itemsToInward.length === 0) {
          const { data: directItems } = await supabase
            .from('purchase_invoice_items')
            .select('*')
            .eq('purchase_invoice_id', grn.id);
          if (directItems && directItems.length > 0) {
            const pids = Array.from(new Set(directItems.map(i => i.product_id)));
            const { data: pList } = await supabase.from('products').select('*').in('id', pids);
            const pMap = new Map(pList?.map(p => [p.id, p]));
            itemsToInward = directItems.map(di => ({
              id: di.id,
              product_id: di.product_id,
              quantity: di.quantity,
              unit_cost: di.unit_cost,
              pack_type: di.pack_type || 'packet',
              units_per_packet: di.units_per_packet || 1,
              packets_per_case: di.packets_per_case || 1,
              batch_number: di.batch_number,
              expiry_date: di.expiry_date,
              mfg_date: di.mfg_date,
              products: pMap.get(di.product_id) || null
            }));
          }
        }

        if (itemsToInward.length === 0) {
          throw new Error("Cannot post a GRN with no line items. Please verify the purchase invoice contents.");
        }

        // Check for missing expiry date - force operator / manifest awareness for FMCG
        for (const item of itemsToInward) {
          const prodName = item.products?.name || item.product_id;
          if (!item.expiry_date) {
            throw new Error(`Missing required Expiry Date on item "${prodName}". Expiry date must be recorded before inwarding into stock.`);
          }
        }

        // Check if batches already exist for this invoice, keying by composite [product_id + batch_number] to prevent batch collision
        const { data: existingBatches } = await supabase
          .from('inventory_batches')
          .select('id, product_id, batch_number, remaining_qty')
          .eq('purchase_invoice_id', grn.id);

        const batchMap = new Map<string, { id: string; product_id: string; batch_number: string | null; remaining_qty: number }>();
        existingBatches?.forEach(b => {
          const key = `${b.product_id}__${(b.batch_number || '').trim().toUpperCase()}`;
          batchMap.set(key, b);
        });

        // Calculate freight / landed costs
        const totalVal = grn.total_amount || itemsToInward.reduce((acc, it) => acc + (it.quantity * it.unit_cost), 0);
        const totalFreight = grn.total_freight || 0;
        const totalHandling = grn.total_handling || 0;

        for (const item of itemsToInward) {
          const p = item.products;
          const upp = item.units_per_packet || 1;
          const ppc = item.packets_per_case || 1;
          const pricingProd: PricingProduct = {
            id: item.product_id,
            units_per_packet: upp,
            packets_per_case: ppc,
            mrp: p?.mrp || 0,
            pack_size_value: p?.pack_size_value || 0,
            pack_size_unit: p?.pack_size_unit || "g",
            unit_type: (p?.unit_type as "pcs" | "packet" | "kg_g") || null
          };

          const packMult = getPackMultiplier(pricingProd, item.pack_type as PackType);
          const totalPcs = Number(item.quantity) * packMult;
          const itemVal = item.quantity * item.unit_cost;
          const frac = totalVal > 0 ? (itemVal / totalVal) : (1 / (itemsToInward.length || 1));
          const allocatedFreight = totalFreight * frac;
          const allocatedHandling = totalHandling * frac;
          const landedPerPack = item.unit_cost + (allocatedFreight / (item.quantity || 1)) + (allocatedHandling / (item.quantity || 1));
          const landedPerPcs = packMult > 0 ? landedPerPack / packMult : landedPerPack;
          const baseCostPerPcs = packMult > 0 ? (Number(item.unit_cost) / packMult) : Number(item.unit_cost);

          const defaultBatchNumber = item.batch_number || `${(grn.supplier_name || 'GRN').slice(0, 3).toUpperCase()}-${grn.invoice_number}-${item.product_id.slice(0, 4)}`;

          let batchId: string | null = null;
          const batchCompositeKey = `${item.product_id}__${defaultBatchNumber.trim().toUpperCase()}`;
          const existing = batchMap.get(batchCompositeKey);

          if (existing) {
            batchId = existing.id;
            // Reactivate or top up remaining quantity if 0
            if (existing.remaining_qty <= 0) {
              const { error: updErr } = await supabase
                .from('inventory_batches')
                .update({
                  remaining_qty: totalPcs,
                  cost_price: Number(baseCostPerPcs.toFixed(4)),
                  landed_cost: Number(landedPerPcs.toFixed(4)),
                  updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
              if (updErr) throw updErr;
            }
          } else {
            // Create new inventory batch with explicit operator expiry date
            const { data: newBatch, error: batchErr } = await supabase
              .from('inventory_batches')
              .insert({
                product_id: item.product_id,
                warehouse_id: targetWhId,
                purchase_invoice_id: grn.id,
                batch_number: defaultBatchNumber,
                initial_qty: totalPcs,
                received_qty: totalPcs,
                remaining_qty: totalPcs,
                cost_price: Number(baseCostPerPcs.toFixed(4)),
                landed_cost: Number(landedPerPcs.toFixed(4)),
                mfg_date: item.mfg_date || null,
                expiry_date: item.expiry_date,
                received_by: user?.id || null
              })
              .select('id')
              .single();

            if (batchErr) throw batchErr;
            if (newBatch) {
              batchId = newBatch.id;
            }
          }

          // Record inward transaction in primary single inventory ledger: inventory_movements
          const { error: movErr } = await supabase.from('inventory_movements').insert({
            product_id: item.product_id,
            batch_id: batchId,
            warehouse_id: targetWhId,
            quantity: totalPcs,
            movement_type: 'purchase',
            reference_type: 'purchase_invoice',
            reference_id: grn.id,
            performed_by: user?.id || null,
            notes: `Inward GRN: #${grn.invoice_number} from ${grn.supplier_name || 'General'}`
          });
          if (movErr) throw movErr;

          // Recompute inventory for this product
          try {
            await supabase.rpc('recompute_inventory', { _product_id: item.product_id });
          } catch (rErr) {
            console.warn("recompute_inventory notice:", rErr);
          }
        }
      }

      // 2. If rejecting from 'posted' status, reverse the stock additions
      if (action === 'rejected' && grn.status === 'posted') {
        const { data: batches } = await supabase
          .from('inventory_batches')
          .select('id, product_id, remaining_qty, received_qty')
          .eq('purchase_invoice_id', grn.id);

        if (batches && batches.length > 0) {
          // Safety verification: check if any batches have been partially sold or dispatched
          for (const b of batches) {
            if ((b.received_qty || 0) > (b.remaining_qty || 0)) {
              throw new Error(`Cannot reject/reverse GRN: Some inventory from this invoice has already been sold or dispatched to customers.`);
            }
          }

          for (const b of batches) {
            if (b.remaining_qty > 0) {
              // Record reversal movement
              const { error: revErr } = await supabase.from('inventory_movements').insert({
                product_id: b.product_id,
                batch_id: b.id,
                quantity: -b.remaining_qty,
                movement_type: 'adjustment',
                reference_type: 'purchase_invoice',
                reference_id: grn.id,
                performed_by: user?.id || null,
                notes: `Reversal: Purchase Invoice #${grn.invoice_number} rejected`
              });
              if (revErr) throw revErr;

              // Set remaining_qty to 0
              const { error: batchUpdErr } = await supabase
                .from('inventory_batches')
                .update({ remaining_qty: 0, updated_at: new Date().toISOString() })
                .eq('id', b.id);
              if (batchUpdErr) throw batchUpdErr;

              try {
                await supabase.rpc('recompute_inventory', { _product_id: b.product_id });
              } catch (rErr) {
                console.warn("recompute_inventory notice:", rErr);
              }
            }
          }
        }
      }

      // 3. Update Invoice Status
      const { error: updateErr } = await supabase
        .from('purchase_invoices')
        .update({ status: action, updated_at: new Date().toISOString() })
        .eq('id', grn.id);

      if (updateErr) throw updateErr;

      // 4. Log Action
      await supabase.from('grn_approval_log').insert({
        grn_id: grn.id,
        action: action,
        performed_by: user?.id || null,
        notes: `Status changed to ${action}`
      });

      // 5. Invalidate all query caches for immediate UI reactivity
      invalidateAllStockCaches();

      toast.success(
        action === 'posted'
          ? "Stock successfully added to inventory and recorded in purchase history!"
          : action === 'rejected'
          ? "Invoice rejected and associated stock cleared from inventory."
          : `Invoice ${action.toUpperCase()} successfully!`,
        { id: toastId }
      );

      // Refresh local list
      await fetchGRNs();
      if (viewingGRN?.id === grn.id) {
        setViewingGRN({ ...grn, status: action });
      }
      setShowRejectConfirm(false);
    } catch (err: unknown) {
      console.error('[Action GRN]', err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingGRN) return;
    setSaveLoading(true);
    const toastId = toast.loading("Saving invoice details...");
    try {
      const { error } = await supabase
        .from("purchase_invoices")
        .update({
          invoice_number: editingGRN.invoice_number,
          supplier_name: editingGRN.supplier_name,
          invoice_date: editingGRN.invoice_date,
          notes: editingGRN.notes,
          updated_at: new Date().toISOString()
        })
        .eq("id", editingGRN.id);

      if (error) throw error;

      toast.success("Invoice updated successfully", { id: toastId });
      invalidateAllStockCaches();
      setEditingGRN(null);
      if (viewingGRN?.id === editingGRN.id) {
        setViewingGRN(editingGRN);
      }
      await fetchGRNs();
    } catch (err: unknown) {
      console.error('[Update GRN]', err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDeleteGRN = async () => {
    if (!grnToDelete) return;
    setDeleteLoading(true);
    const toastId = toast.loading(`Deleting Invoice #${grnToDelete.invoice_number}...`);
    try {
      // 1. Try invoking the safe database RPC first (enforcing is_admin_or_owner and dispatched stock checks)
      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
        'delete_purchase_invoice',
        { _invoice_id: grnToDelete.id }
      );

      if (rpcErr) {
        // If RPC failed due to safety rule (e.g. stock was already dispatched), abort immediately
        if (rpcErr.message?.includes("sold") || rpcErr.message?.includes("dispatched") || rpcErr.message?.includes("permission") || rpcErr.message?.includes("admin")) {
          throw new Error(rpcErr.message);
        }

        // 2. Client-side fallback with strict safety validations if RPC is missing on older environments
        // First check if any batch has been partially sold or dispatched
        const { data: batches } = await supabase
          .from('inventory_batches')
          .select('product_id, remaining_qty, received_qty')
          .eq('purchase_invoice_id', grnToDelete.id);

        if (batches && batches.length > 0) {
          for (const b of batches) {
            if ((b.received_qty || 0) > (b.remaining_qty || 0)) {
              throw new Error(`Cannot delete purchase invoice: Batches from this invoice have already been dispatched or sold.`);
            }
          }
        }

        const affectedPids = Array.from(new Set(batches?.map(b => b.product_id) || []));

        // Cascade delete records
        await supabase.from('purchase_invoice_items').delete().eq('purchase_invoice_id', grnToDelete.id);
        await supabase.from('grn_approval_log').delete().eq('grn_id', grnToDelete.id);
        await supabase.from('inventory_movements').delete().eq('reference_id', grnToDelete.id).eq('reference_type', 'purchase_invoice');
        await supabase.from('stock_movements').delete().eq('reference_id', grnToDelete.id).eq('reference_type', 'purchase_invoice');
        await supabase.from('inventory_batches').delete().eq('purchase_invoice_id', grnToDelete.id);

        const { error: delErr } = await supabase.from('purchase_invoices').delete().eq('id', grnToDelete.id);
        if (delErr) throw delErr;

        for (const pid of affectedPids) {
          try {
            await supabase.rpc('recompute_inventory', { _product_id: pid });
          } catch {
            // ignore
          }
        }
      }

      // Invalidate all query caches immediately
      invalidateAllStockCaches();

      toast.success(`Invoice #${grnToDelete.invoice_number} permanently deleted`, { id: toastId });
      
      if (viewingGRN?.id === grnToDelete.id) {
        setViewingGRN(null);
      }
      setGrnToDelete(null);
      await fetchGRNs();
    } catch (err: unknown) {
      console.error('[Delete GRN]', err);
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setDeleteLoading(false);
    }
  };

  const getStatusBadge = (status: GRNStatus) => {
    switch (status) {
      case 'pending': 
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 font-black uppercase text-[10px] h-6 px-2.5 tracking-wider">Pending</Badge>;
      case 'approved': 
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 font-black uppercase text-[10px] h-6 px-2.5 tracking-wider">Approved</Badge>;
      case 'posted': 
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 font-black uppercase text-[10px] h-6 px-2.5 tracking-wider">Stock Added</Badge>;
      case 'rejected': 
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 font-black uppercase text-[10px] h-6 px-2.5 tracking-wider">Rejected</Badge>;
      default: 
        return <Badge variant="outline" className="font-black uppercase text-[10px] h-6 px-2.5 tracking-wider">{status}</Badge>;
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  return (
    <div className="w-full space-y-5 pb-16 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-xl h-10 w-10 hover:bg-primary/10 hover:text-primary transition-all" onClick={() => navigate("/stock")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Invoices & GRNs</h1>
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider opacity-60">Manifest approval & stock intake workflow</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Waiting Approval', value: grns.filter(g => g.status === 'pending').length, color: 'text-amber-600' },
          { label: 'Approved (Ready to Add)', value: grns.filter(g => g.status === 'approved').length, color: 'text-blue-600' },
          { label: 'Stock Added (Posted)', value: grns.filter(g => g.status === 'posted').length, color: 'text-emerald-600' },
          { label: 'Total Invoiced Value', value: fmtINR(grns.filter(g => g.status === 'posted' || g.status === 'approved').reduce((s, g) => s + (g.total_amount || 0), 0)), color: 'text-primary' },
        ].map(s => (
          <Card key={s.label} className="p-5 rounded-[1.5rem] border-2 shadow-lg shadow-primary/5 bg-card">
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider opacity-60">{s.label}</div>
            <div className={cn("text-xl md:text-2xl font-bold mt-1 truncate", s.color)}>{loading ? '...' : s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="rounded-[2.5rem] border-2 shadow-xl shadow-primary/5 overflow-hidden bg-card">
        <CardHeader className="p-6 pb-2 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-50" />
              <Input 
                className="pl-11 pr-10 h-12 rounded-2xl border-2 bg-muted/20 focus:ring-primary/20 font-medium" 
                placeholder="Search by invoice or supplier..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button 
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="shrink-0 h-11 px-5 rounded-2xl font-bold uppercase tracking-wider text-[10px] border-2" 
                onClick={() => navigate("/stock/movement?filter=purchase")}
              >
                <History className="h-4 w-4 mr-2" /> View Purchase History
              </Button>
              <Button 
                className="shrink-0 h-11 px-6 rounded-2xl font-bold uppercase tracking-wider text-[10px] bg-brand-primary text-white hover:bg-brand-primary/90" 
                onClick={() => navigate("/stock/import")}
              >
                <Plus className="h-4 w-4 mr-2" /> Add New Stock
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {(['all', 'pending', 'approved', 'posted', 'rejected'] as const).map((t) => (
              <Button 
                key={t}
                variant={statusFilter === t ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(t)}
                className={cn(
                  "rounded-xl px-4 font-bold uppercase tracking-wider text-[10px] h-8 transition-all border-2",
                  statusFilter === t 
                    ? "bg-primary text-white border-primary shadow-md shadow-primary/20 scale-[1.02]" 
                    : "bg-card border-border/50 text-muted-foreground hover:border-primary/30"
                )}
              >
                {t}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0 mt-4">
          {isMobile ? (
            <div className="space-y-3 px-4 pb-6">
              {loading ? (
                [1,2,3].map(i => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse border-2" />)
              ) : grns.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground italic text-sm border-2 border-dashed rounded-2xl">No purchase records found</div>
              ) : grns.map(grn => (
                <div 
                  key={grn.id}
                  className="p-4 rounded-2xl border-2 border-border/60 bg-card shadow-sm cursor-pointer active:scale-[0.99] hover:border-primary/50 transition-all"
                  onClick={() => setViewingGRN(grn)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm uppercase tracking-tight break-words text-primary">{grn.invoice_number}</p>
                      <p className="text-[11px] font-bold uppercase text-muted-foreground opacity-80">{grn.supplier_name || 'General Supplier'}</p>
                    </div>
                    {getStatusBadge(grn.status)}
                  </div>
                  <div className="flex items-center justify-between border-t border-border/40 pt-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Invoice Date</span>
                      <span className="text-[11px] font-bold">{fmtDate(grn.invoice_date)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-60 mr-1">Valuation</span>
                        <span className="font-black text-sm text-foreground">{fmtINR(grn.total_amount)}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow className="bg-muted/30 border-y-2 border-border/50">
                    <TableHead className="py-4 pl-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[130px]">Invoice Date</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[180px]">Invoice Number</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Supplier Name</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center w-[140px]">Status</TableHead>
                    <TableHead className="text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[150px]">Manifest Value</TableHead>
                    <TableHead className="pr-6 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-20"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
                  ) : grns.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic font-medium opacity-50 uppercase tracking-widest text-xs">No purchase invoice entries found</TableCell></TableRow>
                  ) : grns.map((grn) => (
                    <TableRow 
                      key={grn.id} 
                      className="group hover:bg-primary/[0.03] transition-colors border-b border-border/30 text-xs cursor-pointer select-none"
                      onClick={() => setViewingGRN(grn)}
                    >
                      <TableCell className="pl-6 py-4">
                        <p className="text-[11px] font-black uppercase text-foreground">{fmtDate(grn.invoice_date)}</p>
                        <p className="text-[9px] font-mono text-muted-foreground opacity-60">ID: {grn.id.slice(0, 8)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="font-black font-mono text-xs bg-muted/60 px-2.5 py-1 rounded-lg border border-border/60 inline-block uppercase tracking-tight text-primary">
                          {grn.invoice_number}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-black uppercase tracking-tight text-foreground group-hover:text-primary transition-colors">
                        {grn.supplier_name || "—"}
                      </TableCell>
                      <TableCell className="text-center">{getStatusBadge(grn.status)}</TableCell>
                      <TableCell className="text-right text-sm font-black text-primary tabular-nums break-words">
                        {fmtINR(grn.total_amount)}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground group-hover:text-primary transition-colors">
                          <span>Details</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          <div className="p-4 border-t-2 border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/10 px-6">
            <div className="text-xs text-muted-foreground font-medium">
              Showing {grns.length > 0 ? ((page - 1) * PAGE_SIZE) + 1 : 0} to {Math.min(page * PAGE_SIZE, totalCount)} of <span className="font-bold text-foreground">{totalCount}</span> entries
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3.5 rounded-xl border-2 font-bold uppercase text-[10px] tracking-wider"
                disabled={page <= 1 || loading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs font-bold px-2">Page {page} of {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3.5 rounded-xl border-2 font-bold uppercase text-[10px] tracking-wider"
                disabled={page * PAGE_SIZE >= totalCount || loading}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit GRN Details Sheet */}
      <Sheet open={!!editingGRN} onOpenChange={(open) => !open && setEditingGRN(null)}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("rounded-t-[2.5rem] p-0 overflow-hidden border-t-0 shadow-2xl", isMobile ? "h-[70dvh]" : "w-[560px] h-full rounded-none")}>
          <div className="h-full flex flex-col bg-background">
            <div className="p-6 pb-0">
              {isMobile && <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />}
              <SheetHeader className="mb-6">
                <SheetTitle className="text-2xl font-bold text-center">Edit Purchase Record</SheetTitle>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground opacity-60 text-center">Update invoice metadata & notes</p>
              </SheetHeader>
            </div>
            
            {editingGRN && (
              <div className="flex-1 overflow-y-auto px-6 pb-24 space-y-6 max-w-xl mx-auto w-full">
                <div className="p-5 bg-muted/30 rounded-[1.5rem] border-2 border-border/50 text-[10px] space-y-1">
                  <div className="text-muted-foreground font-bold uppercase tracking-wider opacity-70 flex items-center gap-2">
                    <AlertCircle className="h-3.5 w-3.5" /> Internal Record ID
                  </div>
                  <div className="font-mono bg-background p-3 rounded-xl border-2 break-all text-foreground/80 font-bold">{editingGRN.id}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Invoice Number</Label>
                    <Input 
                      className="h-14 rounded-2xl border-2 bg-muted/20 font-bold focus:ring-primary/20 uppercase"
                      value={editingGRN.invoice_number} 
                      onChange={e => setEditingGRN({...editingGRN, invoice_number: e.target.value})} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Invoice Date</Label>
                    <Input 
                      type="date"
                      className="h-14 rounded-2xl border-2 bg-muted/20 font-bold focus:ring-primary/20"
                      value={editingGRN.invoice_date} 
                      onChange={e => setEditingGRN({...editingGRN, invoice_date: e.target.value})} 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Supplier Name</Label>
                  <SupplierCombobox 
                    value={editingGRN.supplier_name || ""} 
                    onChange={v => setEditingGRN({...editingGRN, supplier_name: v})} 
                    placeholder="Supplier Name"
                    className="h-14 border-2 bg-muted/20 font-bold focus:ring-primary/20 uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Notes / Remarks</Label>
                  <Input 
                    className="h-14 rounded-2xl border-2 bg-muted/20 font-medium focus:ring-primary/20"
                    value={editingGRN.notes || ""} 
                    onChange={e => setEditingGRN({...editingGRN, notes: e.target.value})} 
                    placeholder="Add receiving remarks or shipment notes..."
                  />
                </div>
              </div>
            )}

            <div className="p-6 pt-4 bg-background border-t border-border/50 flex gap-3 shrink-0 relative z-20">
              <Button variant="outline" className="h-14 rounded-2xl flex-1 font-bold uppercase tracking-wider text-xs border-2" onClick={() => setEditingGRN(null)}>Discard</Button>
              <Button className="h-14 rounded-2xl flex-[2] font-bold uppercase tracking-wider text-xs shadow-xl shadow-primary/20" onClick={handleUpdate} disabled={saveLoading}>
                {saveLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main Stock Entry Details View & Workflow Sheet */}
      <Sheet open={!!viewingGRN} onOpenChange={open => !open && setViewingGRN(null)}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("rounded-t-[2.5rem] p-0 overflow-hidden border-t-0 shadow-2xl", isMobile ? "h-[92dvh]" : "w-[680px] h-full rounded-none")}>
          <div className="h-full flex flex-col bg-background">
            <div className="p-6 pb-4 border-b border-border/40">
              {isMobile && <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-4" />}
              <SheetHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="text-left min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="text-xl md:text-2xl font-bold tracking-tight">Stock Entry Details</SheetTitle>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground opacity-70 mt-0.5">
                      Invoice: <span className="text-foreground font-mono font-black">{viewingGRN?.invoice_number}</span> · {viewingGRN && fmtDate(viewingGRN.invoice_date)}
                    </p>
                  </div>
                  {viewingGRN && getStatusBadge(viewingGRN.status)}
                </div>
              </SheetHeader>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {/* Supplier & Manifest Info Box */}
              {viewingGRN && (
                <div className="p-5 bg-muted/20 rounded-[2rem] border-2 border-border/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider opacity-70">Supplier & Shipping</span>
                    <span className="text-[10px] font-mono text-muted-foreground">ID: {viewingGRN.id.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-white border-2 border-border/60 flex items-center justify-center font-bold text-xl text-primary shadow-sm shrink-0">
                      {(viewingGRN.supplier_name || "G").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-base md:text-lg uppercase tracking-tight leading-tight truncate">{viewingGRN.supplier_name || "General Supplier"}</div>
                      <div className="text-[11px] font-medium text-muted-foreground mt-0.5">{viewingGRN.notes || "No notes available"}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Workflow Pipeline & Status Action Cards */}
              <div className="space-y-3">
                <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest opacity-70 ml-1">Workflow Status & Approval Actions</div>
                
                {/* 1. Pending State: Can Approve OR Reject */}
                {viewingGRN?.status === 'pending' && (
                  <div className="p-6 bg-amber-500/10 rounded-[2rem] border-2 border-amber-500/30 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black uppercase tracking-tight text-amber-800">Pending Verification</p>
                        <p className="text-xs text-amber-700 font-medium mt-1 leading-relaxed">
                          Review line item quantities and costs below. Once approved, the entry can be confirmed for inventory intake.
                        </p>
                      </div>
                      <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-bold uppercase text-[9px]">Stage 1 of 2</Badge>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                      <Button 
                        className="h-12 flex-1 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold uppercase tracking-wider text-xs shadow-md shadow-orange-600/20" 
                        onClick={() => handleAction(viewingGRN, 'approved')}
                        disabled={actionLoading}
                      >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Approve Invoice
                      </Button>
                      <Button 
                        variant="outline" 
                        className="h-12 rounded-xl border-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold uppercase tracking-wider text-xs" 
                        onClick={() => handleAction(viewingGRN, 'rejected')}
                        disabled={actionLoading}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {/* 2. Approved State: Can Confirm Addition to Stock OR Reject */}
                {viewingGRN?.status === 'approved' && (
                  <div className="p-6 bg-blue-50/70 rounded-[2.2rem] border-2 border-blue-200/70 flex flex-col items-center text-center gap-4 relative overflow-hidden">
                    <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="text-blue-900 font-bold text-lg uppercase tracking-tight">Approved & Ready to Intake</div>
                      <p className="text-xs text-blue-700 font-medium max-w-md mt-1 leading-relaxed">
                        This entry has been approved. Confirming will create inventory batches, update stock levels, and log the transactions in purchase history.
                      </p>
                    </div>
                    
                    <div className="w-full flex flex-col sm:flex-row gap-2.5 mt-1">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            className="flex-[2] h-13 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-600/20 font-bold uppercase tracking-wider text-xs" 
                            disabled={actionLoading}
                          >
                            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                            Confirm Addition to Stock
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-[2rem] border-2 max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="font-bold uppercase tracking-tight">Add Stock to Warehouse?</AlertDialogTitle>
                            <AlertDialogDescription className="font-medium text-xs text-muted-foreground leading-relaxed">
                              This will immediately create active inventory batches for Invoice #{viewingGRN.invoice_number} and record the inward transaction in the stock audit ledger.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="gap-2">
                            <AlertDialogCancel className="rounded-xl border-2 font-bold uppercase text-[10px] tracking-wider">Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              className="rounded-xl bg-blue-600 hover:bg-blue-700 font-bold uppercase text-[10px] tracking-wider text-white"
                              onClick={() => handleAction(viewingGRN, 'posted')}
                            >
                              Add to Stock Now
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <Button 
                        variant="outline" 
                        className="flex-1 h-13 rounded-2xl border-2 border-red-300 text-red-600 hover:bg-red-50 font-bold uppercase tracking-wider text-xs" 
                        onClick={() => handleAction(viewingGRN, 'rejected')}
                        disabled={actionLoading}
                      >
                        <XCircle className="h-4 w-4 mr-1.5" /> Reject
                      </Button>
                    </div>
                  </div>
                )}

                {/* 3. Posted State: Stock is active in inventory; Can view history or Reject / Reverse */}
                {viewingGRN?.status === 'posted' && (
                  <div className="p-5 bg-emerald-50/70 rounded-[2rem] border-2 border-emerald-200/70 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0 shadow-inner">
                        <CheckCircle2 className="h-6 w-6 text-emerald-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-emerald-900 font-bold text-base uppercase tracking-tight">Stock Active in Inventory</div>
                        <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">Batches are available for dispatch and recorded in audit history.</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1 border-t border-emerald-200/50">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-xl h-10 px-4 text-emerald-800 border-emerald-300 hover:bg-emerald-100 font-bold uppercase text-[10px] tracking-wider"
                        onClick={() => {
                          setViewingGRN(null);
                          navigate("/stock/movement?filter=purchase");
                        }}
                      >
                        <History className="h-3.5 w-3.5 mr-1.5" /> View in Stock History
                      </Button>
                      
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-xl h-10 px-4 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 font-bold uppercase text-[10px] tracking-wider ml-auto"
                        onClick={() => setShowRejectConfirm(true)}
                        disabled={actionLoading}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reject / Reverse Stock
                      </Button>
                    </div>
                  </div>
                )}

                {/* 4. Rejected State: Can re-open / approve */}
                {viewingGRN?.status === 'rejected' && (
                  <div className="p-5 bg-red-50/70 rounded-[2rem] border-2 border-red-200/70 space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                        <XCircle className="h-6 w-6 text-red-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-red-900 font-bold text-base uppercase tracking-tight">Invoice Rejected</div>
                        <p className="text-[11px] text-red-700 font-semibold mt-0.5">This entry is rejected and its items are not added to inventory stock.</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-red-200/50 flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="rounded-xl h-10 px-4 border-2 font-bold uppercase text-[10px] tracking-wider"
                        onClick={() => handleAction(viewingGRN, 'pending')}
                        disabled={actionLoading}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Re-open as Pending
                      </Button>
                      <Button 
                        size="sm" 
                        className="rounded-xl h-10 px-4 bg-orange-600 hover:bg-orange-700 font-bold uppercase text-[10px] tracking-wider text-white"
                        onClick={() => handleAction(viewingGRN, 'approved')}
                        disabled={actionLoading}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Approve Directly
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Items Table List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between ml-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider opacity-70">
                    Line Items ({grnItems.length})
                  </span>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">
                    Valuation: <strong className="text-primary font-black">{fmtINR(viewingGRN?.total_amount || 0)}</strong>
                  </span>
                </div>

                <div className="border-2 rounded-[2rem] overflow-hidden bg-white shadow-sm">
                  <div className="overflow-x-auto no-scrollbar max-h-[360px]">
                    <Table className="min-w-[620px] w-full">
                      <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
                        <TableRow className="border-b-2">
                          <TableHead className="py-3.5 pl-5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product & SKU</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center text-muted-foreground">Quantity</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-center text-muted-foreground">Unit</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right text-muted-foreground">Cost / Unit</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right text-muted-foreground pr-5">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemsLoading ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary opacity-30" /></TableCell></TableRow>
                        ) : grnItems.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground italic font-medium uppercase tracking-widest text-xs">No line items recorded for this invoice</TableCell></TableRow>
                        ) : grnItems.map((item, i) => {
                          const p = item.products;
                          const qty = item.quantity || 0;
                          const cost = item.unit_cost || 0;
                          const upp = item.units_per_packet || 1;
                          const ppc = item.packets_per_case || 1;
                          const totalPcs = item.pack_type === 'case' ? qty * upp * ppc : item.pack_type === 'packet' ? qty * upp : (item.pack_type === 'doz' ? qty * 12 : qty);
                          const lineVal = qty * cost;

                          return (
                            <TableRow key={i} className="border-b last:border-0 hover:bg-muted/10 transition-colors">
                              <TableCell className="pl-5 py-3.5">
                                <div className="text-xs font-black uppercase tracking-tight text-foreground">{p?.name || 'Product ' + item.product_id.slice(0, 6)}</div>
                                <div className="text-[9px] font-mono text-muted-foreground opacity-70 tracking-tight">{p?.sku || 'SKU_ITEM'} {item.batch_number ? `• Batch: ${item.batch_number}` : ''}</div>
                              </TableCell>
                              <TableCell className="text-center font-bold text-xs">{qty}</TableCell>
                              <TableCell className="text-center">
                                <span className="font-bold text-[10px] uppercase bg-muted/60 px-2 py-0.5 rounded border border-border/40 text-muted-foreground">{item.pack_type || 'packet'}</span>
                                {totalPcs !== qty && <span className="block text-[9px] text-muted-foreground font-mono">({totalPcs} pcs)</span>}
                              </TableCell>
                              <TableCell className="text-right text-xs font-bold tabular-nums text-foreground">{fmtINR(cost)}</TableCell>
                              <TableCell className="text-right text-xs font-black tabular-nums text-primary pr-5">{fmtINR(lineVal)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="p-4 bg-muted/30 border-t-2 flex items-center justify-between px-5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-70">Total Manifest Valuation</span>
                    <span className="text-xl font-black text-primary tabular-nums">{fmtINR(viewingGRN?.total_amount || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Sheet Action Bar: Edit, Delete, Close */}
            <div className="p-5 bg-background border-t border-border/50 flex gap-2.5 shrink-0 relative z-20">
              {(viewingGRN?.status === 'pending' || viewingGRN?.status === 'approved') && (
                <Button 
                  variant="outline" 
                  className="h-12 rounded-xl flex-1 font-bold uppercase tracking-wider text-xs border-2" 
                  onClick={() => {
                    if (viewingGRN) {
                      setEditingGRN(viewingGRN);
                    }
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-1.5" /> Edit Info
                </Button>
              )}

              <Button 
                variant="outline" 
                className="h-12 rounded-xl flex-1 font-bold uppercase tracking-wider text-xs border-2 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30" 
                onClick={() => {
                  if (viewingGRN) {
                    setGrnToDelete(viewingGRN);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete Invoice
              </Button>
              
              <Button 
                variant="outline" 
                className="h-12 rounded-xl flex-1 font-bold uppercase tracking-wider text-xs border-2" 
                onClick={() => setViewingGRN(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!grnToDelete} onOpenChange={(open) => !open && setGrnToDelete(null)}>
        <AlertDialogContent className="rounded-3xl border-2 max-w-md bg-white p-6 shadow-2xl">
          <AlertDialogHeader>
            <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive mb-3">
              <Trash2 className="h-7 w-7" />
            </div>
            <AlertDialogTitle className="font-bold text-xl uppercase tracking-tight text-slate-900">
              Delete Invoice #{grnToDelete?.invoice_number}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-xs text-slate-600 font-medium">
                <p>Are you sure you want to permanently delete this purchase invoice record?</p>
                <div className="p-3 bg-destructive/5 rounded-xl border border-destructive/10 text-destructive text-[11px] font-semibold">
                  This will remove the purchase entry, line items, associated stock batches, and approval logs immediately without needing to refresh the app.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-3">
            <AlertDialogCancel className="h-11 rounded-xl border-2 font-bold uppercase text-[10px] tracking-wider flex-1" disabled={deleteLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              className="h-11 rounded-xl bg-destructive hover:bg-destructive/90 text-white font-bold uppercase text-[10px] tracking-wider flex-1 border-none shadow-lg shadow-destructive/20"
              disabled={deleteLoading}
              onClick={confirmDeleteGRN}
            >
              {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject & Reverse Confirmation Alert Dialog */}
      <AlertDialog open={showRejectConfirm} onOpenChange={setShowRejectConfirm}>
        <AlertDialogContent className="rounded-3xl border-2 max-w-md bg-white p-6 shadow-2xl">
          <AlertDialogHeader>
            <div className="h-14 w-14 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 mb-3">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <AlertDialogTitle className="font-bold text-xl uppercase tracking-tight text-slate-900">
              Reject Invoice & Reverse Stock?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-xs text-slate-600 font-medium">
                <p>Rejecting Invoice #{viewingGRN?.invoice_number} will mark it as rejected and deduct the stock batches from active inventory.</p>
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-800 text-[11px] font-semibold">
                  A reversal adjustment entry will be recorded in the audit history trail.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-3">
            <AlertDialogCancel className="h-11 rounded-xl border-2 font-bold uppercase text-[10px] tracking-wider flex-1" disabled={actionLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              className="h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold uppercase text-[10px] tracking-wider flex-1 border-none shadow-lg shadow-red-600/20"
              disabled={actionLoading}
              onClick={() => {
                if (viewingGRN) {
                  handleAction(viewingGRN, 'rejected');
                }
              }}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Confirm Reversal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
