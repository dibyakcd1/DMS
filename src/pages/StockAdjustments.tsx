import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2, Plus, Search, AlertTriangle, FileText, Save, Package, Trash2, History as HistoryIcon, User, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/responsive";
import { PageHeader } from "@/components/PageHeader";
import { StockTabs } from "@/components/stock/StockTabs";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";

import { Product } from "@/types";
import { derivePackaging, getAvailableSellUnits, convertToBaseUnits, formatStockDisplay } from "@/lib/packaging";

type AdjustmentReason = 'damage' | 'wastage' | 'sample' | 'variance' | 'return_to_supplier' | 'found_stock' | 'market_return' | 'internal_consumption' | 'expiry';

type Batch = {
  id: string;
  product_id: string;
  batch_number: string;
  remaining_qty: number;
  expiry_date: string;
  products?: Product;
};

type AdjustmentRecord = {
  id: string;
  product_id: string;
  adjustment_qty: number;
  reason: string;
  notes: string | null;
  created_at: string;
  products: Product | null;
  inventory_batches: {
     batch_number: string;
  } | null;
};

export default function StockAdjustments() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [search, setSearch] = useState("");
  
  // Form State
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [adjustmentQty, setAdjustmentQty] = useState<string>("");
  const [adjustmentUnit, setAdjustmentUnit] = useState<string>("unit");
  const [reason, setReason] = useState<AdjustmentReason>('variance');
  const [varianceDirection, setVarianceDirection] = useState<'add' | 'remove'>('add');
  const [notes, setNotes] = useState("");

  const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [products, selectedProductId]);
  const packagingInfo = useMemo(() => selectedProduct ? derivePackaging(selectedProduct) : null, [selectedProduct]);

  useEffect(() => {
    fetchAdjustments();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      fetchBatches(selectedProductId);
      setAdjustmentUnit("unit");
    } else {
      setBatches([]);
      setSelectedBatchId("");
    }
  }, [selectedProductId]);

  const fetchAdjustments = async () => {
    setLoading(true);
    try {
      // Manual join because we query inventory_movements directly for manual adjustments
      const [adjRes, prodRes, batchRes] = await Promise.all([
        supabase.from('inventory_movements').select('*').eq('movement_type', 'adjustment').order('created_at', { ascending: false }),
        supabase.from('products').select('id, name, sku'),
        supabase.from('inventory_batches').select('id, batch_number')
      ]);

      if (adjRes.error) throw adjRes.error;
      if (prodRes.error) throw prodRes.error;
      if (batchRes.error) throw batchRes.error;

      const prodMap = new Map(prodRes.data.map(p => [p.id, p]));
      const batchMap = new Map(batchRes.data.map(b => [b.id, b]));

      const joined = (adjRes.data || []).map(adj => {
        let extractedReason = 'variance';
        let extractedNotes = adj.notes;
        if (adj.notes && adj.notes.startsWith('Correction: ')) {
          const parts = adj.notes.substring(12).split('. ');
          extractedReason = parts[0] || 'variance';
          extractedNotes = parts.slice(1).join('. ') || null;
        }

        return {
          id: adj.id,
          product_id: adj.product_id,
          adjustment_qty: Number(adj.quantity || 0),
          reason: extractedReason,
          notes: extractedNotes,
          created_at: adj.created_at,
          products: prodMap.get(adj.product_id) || null,
          inventory_batches: batchMap.get(adj.batch_id) || null
        };
      });

      setAdjustments(joined as unknown as AdjustmentRecord[]);
    } catch (err: unknown) {
      console.error('[Context] Fetch adjustments failed', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name');
    setProducts(data || []);
  };

  const fetchBatches = async (productId: string) => {
    const { data } = await supabase
      .from('inventory_batches')
      .select('*')
      .eq('product_id', productId)
      .gt('remaining_qty', 0)
      .order('expiry_date', { ascending: true });
    setBatches(data || []);
  };

  const handleSubmit = async () => {
    if (!selectedProductId || !selectedBatchId || !adjustmentQty) {
      console.error('[Context] Missing fields for adjustment');
      return toast.error("Please fill all required fields");
    }

    setSubmitting(true);
    try {
      // Perform conversion based on adjustmentUnit
      const qty = Math.abs(Number(adjustmentQty));
      let baseQty = qty;
      
      if (packagingInfo) {
        baseQty = convertToBaseUnits(qty, adjustmentUnit, selectedProduct!);
      }

      // Logic for negation based on reason
      const isDeduction = ['damage', 'wastage', 'sample', 'return_to_supplier'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove');
      
      const batch = batches.find(b => b.id === selectedBatchId);
      if (isDeduction && batch && baseQty > batch.remaining_qty) {
        setSubmitting(false);
        console.error('[Context] Insufficient stock for deduction', { needed: baseQty, available: batch.remaining_qty });
        return toast.error(`Insufficient stock in batch. Available: ${batch.remaining_qty}, Requested deduction: ${baseQty}`);
      }

      const finalQty = isDeduction ? -baseQty : baseQty;

      const { error } = await supabase.rpc('record_inventory_movement', {
        p_product_id: selectedProductId,
        p_batch_id: selectedBatchId,
        p_warehouse_id: batch?.warehouse_id,
        p_quantity: finalQty,
        p_movement_type: 'adjustment',
        p_reference_id: null,
        p_reference_type: 'adjustment',
        p_performed_by: user?.id,
        p_notes: `Correction: ${reason}. ${notes}`
      });

      if (error) throw error;

      try {
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["stock-movement"] });
        queryClient.invalidateQueries({ queryKey: ["v_stock_ledger_details"] });
        queryClient.invalidateQueries({ queryKey: ["stock"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["products-catalog"] });
        queryClient.invalidateQueries({ queryKey: ["products-data"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      } catch (cacheErr) {
        console.warn("Adjustment cache invalidation warning:", cacheErr);
      }

      toast.success("Stock adjustment recorded successfully");
      setOpen(false);
      resetForm();
      fetchAdjustments();
    } catch (err: unknown) {
      console.error('[Context] Adjustment submission failed', err);
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedProductId("");
    setSelectedBatchId("");
    setAdjustmentQty("");
    setAdjustmentUnit("unit");
    setReason('variance');
    setNotes("");
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  const filtered = adjustments.filter(a => 
    a.products?.name.toLowerCase().includes(search.toLowerCase()) ||
    a.products?.sku.toLowerCase().includes(search.toLowerCase()) ||
    a.inventory_batches?.batch_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="pb-32 md:pb-24">
      <PageHeader 
        title="Stock Adjustments"
        subtitle="Fix stock levels or record damages"
        onBack={() => navigate("/stock")}
        action={
          <div className="flex gap-2">
            <Button variant="outline" className="font-bold uppercase tracking-wider text-xs h-11 px-6 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground" onClick={() => navigate("/stock/movement?filter=adjustment")}>
              <HistoryIcon className="h-4 w-4 mr-2" /> View History
            </Button>
            
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button className="font-bold uppercase tracking-wider text-xs h-11 px-6 rounded-xl shadow-sm" onClick={resetForm}>
                  <Plus className="h-4 w-4 mr-2" /> New Adjustment
                </Button>
              </SheetTrigger>
              <SheetContent side={isMobile ? "bottom" : "right"} className={cn("rounded-t-2xl p-0 overflow-hidden border-t-0 shadow-2xl", isMobile ? "h-[92dvh]" : "w-[560px] h-full rounded-none")}>
                <div className="h-full flex flex-col bg-background">
                  <div className="p-6 pb-0">
                    {isMobile && <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />}
                    <SheetHeader className="mb-6">
                      <SheetTitle className="text-2xl font-bold text-center">Update Stock Level</SheetTitle>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground opacity-60 text-center">Adjust items manually</p>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto mt-2 px-6 pb-24 space-y-6">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Select Product</Label>
                      <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="h-12 w-full rounded-xl border border-border bg-card px-4 font-bold focus:ring-primary/20 outline-none">
                        <option value="">Select an item...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                    </div>

                    {selectedProductId && (
                      <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Select Batch</Label>
                        <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="h-12 w-full rounded-xl border border-border bg-card px-4 font-bold focus:ring-primary/20 outline-none">
                          <option value="">Select active batch...</option>
                          {batches.map(b => (
                            <option key={b.id} value={b.id}>{b.batch_number} (Available: {b.remaining_qty})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 relative">
                        <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Quantity to change</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="number" 
                            inputMode="decimal"
                            className="h-12 rounded-xl border border-border bg-card font-bold text-lg focus:ring-primary/20 tabular-nums flex-1" 
                            value={adjustmentQty} 
                            onChange={e => setAdjustmentQty(e.target.value)}
                            placeholder="0"
                          />
                          <Select value={adjustmentUnit} onValueChange={setAdjustmentUnit}>
                            <SelectTrigger className="h-12 w-32 rounded-xl border border-border bg-card font-bold focus:ring-primary/20 capitalize">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {selectedProduct ? getAvailableSellUnits(selectedProduct).map(u => (
                                <SelectItem key={u} value={u.toLowerCase()}>{u}</SelectItem>
                              )) : (
                                <SelectItem value="unit">Units</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {reason === 'variance' && (
                          <div className="mt-4 p-4 rounded-xl bg-muted/20 border border-border flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground opacity-60">Adjustment</span>
                            <div className="flex items-center gap-1 bg-background p-1 rounded-xl border">
                              <Button 
                                variant={varianceDirection === 'add' ? 'default' : 'ghost'} 
                                size="sm" 
                                onClick={() => setVarianceDirection('add')}
                                className="h-8 rounded-lg text-[10px] font-bold uppercase"
                              >
                                Add Stock (+)
                              </Button>
                              <Button 
                                variant={varianceDirection === 'remove' ? 'destructive' : 'ghost'} 
                                size="sm" 
                                onClick={() => setVarianceDirection('remove')}
                                className={cn("h-8 rounded-lg text-[10px] font-bold uppercase", varianceDirection === 'remove' && "bg-destructive text-white")}
                              >
                                Remove Stock (-)
                              </Button>
                            </div>
                          </div>
                        )}

                        {selectedProduct && adjustmentQty && (
                          <div className="mt-2 p-2 rounded-xl bg-primary/5 border border-primary/10 animate-in fade-in zoom-in-95">
                            <p className="text-[10px] font-bold uppercase text-primary/60 tracking-wider mb-1">Preview</p>
                            <p className="text-xs font-bold">
                              Adjusting <span className={cn("font-bold", (['damage', 'wastage', 'sample', 'return_to_supplier', 'internal_consumption', 'expiry'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove')) ? "text-destructive" : "text-emerald-600")}>
                                {(['damage', 'wastage', 'sample', 'return_to_supplier', 'internal_consumption', 'expiry'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove')) ? '-' : '+'}
                                {convertToBaseUnits(Number(adjustmentQty), adjustmentUnit, selectedProduct)}
                              </span> base pieces.
                            </p>
                          </div>
                        )}
                        <div className="absolute right-36 top-[3.25rem] pointer-events-none">
                          <Badge variant="outline" className={cn(
                            "text-[9px] font-bold uppercase tracking-tighter h-5",
                            (['damage', 'wastage', 'sample', 'return_to_supplier', 'internal_consumption', 'expiry'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove')) ? "bg-destructive/10 text-destructive border-destructive/20" : 
                            adjustmentQty && Number(adjustmentQty) !== 0 ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-muted"
                          )}>
                            {(['damage', 'wastage', 'sample', 'return_to_supplier', 'internal_consumption', 'expiry'].includes(reason) || (reason === 'variance' && varianceDirection === 'remove')) ? "Deduct" : adjustmentQty && Number(adjustmentQty) !== 0 ? "Increment" : "Neutral"}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-1.5 text-right px-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-6 italic leading-tight">
                          {reason === 'variance' ? "Select direction using the toggle above." : "Quantities will be removed automatically for the selected reason."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Reason for change</Label>
                      <div className="flex flex-wrap gap-2 pb-2 -mx-1 px-1">
                        {[
                          { id: 'variance', label: 'Difference'},
                          { id: 'damage', label: 'Damage'},
                          { id: 'expiry', label: 'Expiry'},
                          { id: 'wastage', label: 'Wastage'},
                          { id: 'sample', label: 'Sample Out'},
                          { id: 'internal_consumption', label: 'Internal Use'},
                          { id: 'return_to_supplier', label: 'Supplier Return'},
                          { id: 'found_stock', label: 'Found Stock'},
                          { id: 'market_return', label: 'Market Return'}
                        ].map((r) => (
                          <button
                            key={r.id}
                            onClick={() => setReason(r.id as AdjustmentReason)}
                            className={cn(
                              "h-10 rounded-xl border font-bold text-[11px] uppercase tracking-tight transition-all text-center px-4",
                              reason === r.id 
                                ? "bg-primary text-white border-primary shadow-sm scale-[1.02]" 
                                : "bg-card border-border text-muted-foreground hover:border-primary/20"
                            )}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Notes</Label>
                      <Input 
                        className="h-12 rounded-xl border border-border bg-card font-medium focus:ring-primary/20" 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        placeholder="Add a reason for this change..." 
                      />
                    </div>
                  </div>

                  <div className="p-6 pt-4 bg-background border-t border-border flex gap-3 shrink-0 relative z-20">
                    <Button variant="outline" className="h-12 rounded-xl flex-1 font-bold uppercase tracking-wider text-xs border" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button className="h-12 rounded-xl flex-[2] font-bold uppercase tracking-wider text-xs shadow-sm" onClick={handleSubmit} disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Save Changes
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        }
      />

      <ResponsiveContainer className="space-y-4 md:space-y-6 mt-1 md:mt-4">
        <StockTabs />

        <div className="max-w-xl mx-auto space-y-4">
          <Card className="rounded-2xl border border-border/60 shadow-sm p-6 bg-card relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
              <HistoryIcon className="h-48 w-48 text-primary" />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <HistoryIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Change History</h3>
                <p className="text-xs text-muted-foreground mt-2 font-medium leading-relaxed">
                  All stock changes are recorded and saved. 
                  You can track every adjustment, damage report, and stock correction here.
                </p>
              </div>
              <Button 
                variant="default" 
                className="h-10 px-6 rounded-xl font-bold uppercase tracking-wider text-[10px] shadow-sm"
                onClick={() => navigate("/stock/movement?filter=adjustment")}
              >
                View Full History <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>

          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 opacity-70 mb-1">Notice</p>
            <p className="text-xs font-bold text-amber-900/80 italic leading-tight">
              Adjusting stock updates your inventory immediately. 
              Please check the physical count before saving.
            </p>
          </div>
        </div>
      </ResponsiveContainer>
    </div>
  );
}

