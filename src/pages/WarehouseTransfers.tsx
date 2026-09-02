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
import { ChevronLeft, Loader2, Plus, Search, ArrowRightLeft, Package, Warehouse, History as HistoryIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/responsive";
import { Product, Batch, Warehouse as WarehouseType, WarehouseTransfer } from "@/types";
import { derivePackaging, convertToBaseUnits } from "@/lib/packaging";
import { PageHeader } from "@/components/PageHeader";
import { StockTabs } from "@/components/stock/StockTabs";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";

export default function WarehouseTransfers() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [transfers, setTransfers] = useState<WarehouseTransfer[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [search, setSearch] = useState("");
  
  // Form State
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [toWarehouseId, setToWarehouseId] = useState<string>("");
  const [toBatchNumber, setToBatchNumber] = useState<string>("");
  const [transferQty, setTransferQty] = useState<string>("");
  const [transferUnit, setTransferUnit] = useState<string>("unit");
  const [notes, setNotes] = useState("");

  const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [products, selectedProductId]);
  const selectedBatch = useMemo(() => batches.find(b => b.id === selectedBatchId), [batches, selectedBatchId]);
  const packagingInfo = useMemo(() => selectedProduct ? derivePackaging(selectedProduct) : null, [selectedProduct]);

  useEffect(() => {
    if (selectedBatch) {
      setToBatchNumber(`${selectedBatch.batch_number}-WT${Date.now().toString().slice(-4)}`);
    } else {
      setToBatchNumber("");
    }
  }, [selectedBatch]);

  useEffect(() => {
    fetchTransfers();
    fetchWarehouses();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      fetchBatches(selectedProductId);
      setSelectedBatchId("");
    } else {
      setBatches([]);
      setSelectedBatchId("");
    }
  }, [selectedProductId]);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const { data: transfersRaw, error } = await supabase
        .from('warehouse_transfers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!transfersRaw) return setTransfers([]);

      // Manual join
      const pids = Array.from(new Set(transfersRaw.map(t => t.product_id)));
      const wids = Array.from(new Set([...transfersRaw.map(t => t.from_warehouse_id), ...transfersRaw.map(t => t.to_warehouse_id)]));
      const bids = Array.from(new Set(transfersRaw.map(t => t.batch_id)));

      const [prodsRes, whRes, batchRes] = await Promise.all([
        supabase.from('products').select('id, name, sku').in('id', pids),
        supabase.from('warehouses').select('id, name').in('id', wids),
        supabase.from('inventory_batches').select('id, batch_number').in('id', bids)
      ]);

      const prodMap = new Map(prodsRes.data?.map(p => [p.id, p]));
      const whMap = new Map(whRes.data?.map(w => [w.id, w]));
      const batchMap = new Map(batchRes.data?.map(b => [b.id, b]));

      const joined = transfersRaw.map(t => ({
        ...t,
        products: prodMap.get(t.product_id) || null,
        from_warehouse: whMap.get(t.from_warehouse_id) || null,
        to_warehouse: whMap.get(t.to_warehouse_id) || null,
        batch: batchMap.get(t.batch_id) || null
      }));

      setTransfers(joined as unknown as WarehouseTransfer[]);
    } catch (err: unknown) {
      console.error('[Context] Fetch transfers failed', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    const { data } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
    setWarehouses(data || []);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('id, name, sku').eq('is_active', true).order('name');
    setProducts(data as Product[]);
  };

  const fetchBatches = async (productId: string) => {
    const { data: batchesRaw, error } = await supabase
      .from('inventory_batches')
      .select('*')
      .eq('product_id', productId)
      .gt('remaining_qty', 0)
      .order('expiry_date', { ascending: true });
    
    if (error || !batchesRaw) return setBatches([]);

    const wids = Array.from(new Set(batchesRaw.map(b => b.warehouse_id)));
    const { data: whs } = await supabase.from('warehouses').select('id, name').in('id', wids);
    const whMap = new Map(whs?.map(w => [w.id, w]));

    setBatches(batchesRaw.map(b => ({
      ...b,
      warehouse: whMap.get(b.warehouse_id) || null
    })) as Batch[]);
  };

  const handleSubmit = async () => {
    if (!selectedProductId || !selectedBatchId || !toWarehouseId || !transferQty) {
      console.error('[Context] Missing fields for transfer');
      return toast.error("Please fill all required fields");
    }
    
    if (selectedBatch && selectedBatch.warehouse_id === toWarehouseId) {
      console.error('[Context] Circular transfer attempt');
      return toast.error("Source and destination warehouses must be different");
    }

    const qty = Number(transferQty);
    let baseQty = qty;

    if (selectedProduct) {
      baseQty = convertToBaseUnits(qty, transferUnit, selectedProduct);
    }

    if (selectedBatch && baseQty > selectedBatch.remaining_qty) {
      console.error('[Context] Insufficient stock in batch', { needed: baseQty, available: selectedBatch.remaining_qty });
      return toast.error(`Insufficient stock in selected batch (Available: ${selectedBatch.remaining_qty} units)`);
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('warehouse_transfers').insert({
        product_id: selectedProductId,
        from_warehouse_id: selectedBatch?.warehouse_id,
        to_warehouse_id: toWarehouseId,
        batch_id: selectedBatchId,
        to_batch_number: toBatchNumber, // Sending the suggested or user-overridden batch number
        quantity: baseQty,
        notes,
        performed_by: user?.id,
        status: 'completed'
      });

      if (error) throw error;

      try {
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        queryClient.invalidateQueries({ queryKey: ["stock-movement"] });
        queryClient.invalidateQueries({ queryKey: ["v_stock_ledger_details"] });
        queryClient.invalidateQueries({ queryKey: ["stock"] });
        queryClient.invalidateQueries({ queryKey: ["recommended-batches"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      } catch (cacheErr) {
        console.warn("Transfer cache invalidation warning:", cacheErr);
      }

      toast.success("Inter-Warehouse transfer completed");
      setOpen(false);
      resetForm();
      fetchTransfers();
    } catch (err: unknown) {
      console.error('[Context] Transfer execution failed', err);
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedProductId("");
    setSelectedBatchId("");
    setToWarehouseId("");
    setTransferQty("");
    setTransferUnit("unit");
    setNotes("");
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  const filtered = transfers.filter(t => 
    t.products?.name.toLowerCase().includes(search.toLowerCase()) ||
    t.batch?.batch_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full pb-10 animate-fade-in px-0 sm:px-0">
      <PageHeader 
        title="Stock Transfers"
        subtitle="Move items between warehouses"
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/stock")}
        action={
          <div className="flex gap-3">
            <Button variant="outline" className="font-black uppercase tracking-widest text-[10px] h-10 px-4 rounded-xl border-2 border-primary/10 text-primary hover:bg-primary/5" onClick={() => navigate("/stock/movement")}>
              <HistoryIcon className="h-3.5 w-3.5 mr-2" /> History
            </Button>
            
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button className="font-black uppercase tracking-widest text-[10px] h-10 px-4 rounded-xl shadow-lg shadow-primary/20 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={resetForm}>
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-2" /> New Transfer
                </Button>
              </SheetTrigger>
              <SheetContent side={isMobile ? "bottom" : "right"} className={cn("rounded-t-[2.5rem] p-0 overflow-hidden border-t-0 shadow-2xl", isMobile ? "h-[92dvh]" : "w-[560px] h-full rounded-none")}>
                <div className="h-full flex flex-col bg-background">
                  <div className="p-6 pb-0">
                    {isMobile && <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />}
                    <SheetHeader className="mb-6">
                      <SheetTitle className="text-2xl font-black text-center">Move Between Warehouses</SheetTitle>
                      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-60 text-center">Internal Stock Transfer</p>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto mt-2 px-6 pb-24 space-y-6">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Product</Label>
                      <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                        <SelectTrigger className="h-14 rounded-2xl border-2 bg-muted/20 font-bold focus:ring-primary/20">
                          <SelectValue placeholder="Choose product..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-2 max-h-[300px]">
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id} className="font-bold">{p.name} <span className="text-[10px] text-muted-foreground ml-2 opacity-60">({p.sku})</span></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedProductId && (
                      <div className="grid grid-cols-1 gap-4 p-5 bg-muted/30 rounded-[2rem] border-2 border-border/50 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase text-brand-primary tracking-widest opacity-70 ml-1">Source Batch & Warehouse</Label>
                          <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                            <SelectTrigger className="h-12 rounded-xl border-border/50 bg-white shadow-sm font-black text-xs uppercase tracking-tight">
                              <SelectValue placeholder="Pick source batch..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-2">
                              {batches.map(b => (
                                <SelectItem key={b.id} value={b.id} className="font-bold text-xs">
                                  {b.batch_number} <span className="text-[9px] opacity-60 whitespace-nowrap ml-2">({b.warehouse?.name} - {b.remaining_qty} units)</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex justify-center -my-2 relative z-10">
                          <div className="bg-background p-2 rounded-full border-2 border-primary/20 shadow-lg text-primary animate-pulse">
                            <Warehouse className="h-5 w-5" />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase text-emerald-600 tracking-widest opacity-70 ml-1">Target Warehouse (Destination)</Label>
                          <Select value={toWarehouseId} onValueChange={setToWarehouseId}>
                            <SelectTrigger className="h-12 rounded-xl border-border/50 bg-white shadow-sm font-black text-xs uppercase tracking-tight">
                              <SelectValue placeholder="Pick destination warehouse..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-2">
                              {warehouses.map(w => (
                                <SelectItem key={w.id} value={w.id} className="font-bold text-xs" disabled={selectedBatch?.warehouse_id === w.id}>
                                  {w.name} {selectedBatch?.warehouse_id === w.id ? '(SOURCE)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Destination Batch Number</Label>
                      <Input 
                        className="h-14 rounded-2xl border-2 bg-muted/20 font-black focus:ring-primary/20" 
                        value={toBatchNumber} 
                        onChange={e => setToBatchNumber(e.target.value.toUpperCase())} 
                        placeholder="AUTO-GENERATED" 
                      />
                      <p className="text-[9px] text-muted-foreground font-medium italic ml-1 opacity-60">The batch identity at the target warehouse.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Quantity to move</Label>
                      <div className="flex gap-2">
                        <Input 
                          type="number" 
                          inputMode="decimal"
                          className="h-14 rounded-2xl border-2 bg-muted/20 font-black text-lg focus:ring-primary/20 tabular-nums flex-1" 
                          value={transferQty} 
                          onChange={e => setTransferQty(e.target.value)}
                          placeholder="0"
                        />
                        <Select value={transferUnit} onValueChange={setTransferUnit}>
                          <SelectTrigger className="h-14 w-32 rounded-2xl border-2 bg-muted/20 font-bold focus:ring-primary/20 capitalize">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="unit">Units</SelectItem>
                            {packagingInfo?.midUnit && <SelectItem value="packet">Pack</SelectItem>}
                            <SelectItem value="case">Cases</SelectItem>
                            {packagingInfo?.allowKg && <SelectItem value="kg">Kg</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Logistics Reference / Notes</Label>
                      <Input 
                        className="h-14 rounded-2xl border-2 bg-muted/20 font-medium focus:ring-primary/20" 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        placeholder="Movement rationale..." 
                      />
                    </div>
                  </div>

                  <div className="p-6 pt-4 bg-background border-t border-border/50 flex gap-3 shrink-0 relative z-20">
                    <Button variant="outline" className="h-14 rounded-2xl flex-1 font-black uppercase tracking-widest text-xs border-2" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button className="h-14 rounded-2xl flex-[2] font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-200/50 bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Warehouse className="h-4 w-4 mr-2" />}
                      Move Stock
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        }
      />

      <div className="px-4">
        <StockTabs />
      </div>

      <div className="px-4 pb-4">
        <Card className="rounded-[2.5rem] border-2 shadow-xl shadow-primary/5 overflow-hidden">
        <CardHeader className="p-6 pb-2">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-50" />
            <Input 
              className="pl-11 h-12 rounded-2xl border-2 bg-muted/20 focus:ring-primary/20" 
              placeholder="Search movement logs..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-4 overflow-x-auto">
          {/* Mobile Card View */}
          {isMobile ? (
          <div className="divide-y divide-border/30">
            {loading ? (
              <div className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground italic font-medium opacity-50 uppercase tracking-widest text-xs px-6">No movement history found</div>
            ) : filtered.map(t => (
              <div key={t.id} className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-black text-sm uppercase tracking-tight text-foreground">{t.products?.name}</div>
                    <div className="text-[10px] font-black font-mono text-muted-foreground uppercase opacity-60 tracking-tighter">Batch: {t.batch?.batch_number}</div>
                  </div>
                  <Badge className={cn(
                    "font-black text-[9px] uppercase tracking-widest h-5",
                    t.status === 'completed' ? "bg-emerald-500" : "bg-orange-500"
                  )}>
                    {t.status}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-bold text-[9px] uppercase">{t.from_warehouse?.name}</Badge>
                  <ArrowRightLeft className="h-3 w-3 text-muted-foreground opacity-30 shrink-0" />
                  <Badge variant="secondary" className="font-bold text-[9px] uppercase bg-emerald-100 text-emerald-700">{t.to_warehouse?.name}</Badge>
                </div>

                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">{fmtDate(t.created_at)}</p>
                    {t.notes && <p className="text-[9px] text-muted-foreground italic">{t.notes}</p>}
                  </div>
                  <div className="text-right font-black text-lg tabular-nums text-primary">
                    <div className="flex flex-col items-end">
                      <span>{t.quantity}</span>
                      <StockBreakdownDisplay 
                        stockBaseUnits={t.quantity} 
                        product={t.products || {} as Product} 
                        variant="compact" 
                        className="text-[9px] opacity-60"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          ) : (
            <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/30 border-y-2 border-border/50">
                <TableHead className="py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[120px] hidden lg:table-cell">Date</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Product</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center hidden xl:table-cell">From/To</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[100px]">Quantity</TableHead>
                <TableHead className="pr-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic font-medium opacity-50 uppercase tracking-widest text-xs">No movement history found</TableCell></TableRow>
              ) : filtered.map(t => (
                <TableRow key={t.id} className="group hover:bg-muted/10 transition-colors border-b border-border/30">
                  <TableCell className="pl-6 py-4 hidden lg:table-cell">
                    <p className="text-[10px] font-black uppercase text-foreground">{fmtDate(t.created_at)}</p>
                  </TableCell>
                  <TableCell>
                    <div className="font-black text-sm uppercase tracking-tight text-foreground group-hover:text-primary transition-colors">{t.products?.name}</div>
                    <div className="text-[10px] font-black font-mono text-muted-foreground uppercase opacity-60 tracking-tighter">Batch: {t.batch?.batch_number}</div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                     <div className="flex items-center justify-center gap-3">
                       <Badge variant="outline" className="font-bold text-[9px] uppercase">{t.from_warehouse?.name}</Badge>
                       <ArrowRightLeft className="h-3 w-3 text-muted-foreground opacity-30" />
                       <Badge variant="secondary" className="font-bold text-[9px] uppercase bg-emerald-100 text-emerald-700 hover:bg-emerald-200">{t.to_warehouse?.name}</Badge>
                     </div>
                  </TableCell>
                  <TableCell className="text-right font-black text-lg tabular-nums text-primary">
                    <div className="flex flex-col items-end">
                      <span>{t.quantity}</span>
                      <StockBreakdownDisplay 
                        stockBaseUnits={t.quantity} 
                        product={t.products || {} as Product} 
                        variant="compact" 
                        className="text-[9px] opacity-60"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Badge className={cn(
                      "font-black text-[9px] uppercase tracking-widest",
                      t.status === 'completed' ? "bg-emerald-500" : "bg-orange-500"
                    )}>
                      {t.status}
                    </Badge>
                    {t.notes && <p className="text-[9px] text-muted-foreground mt-1 italic truncate max-w-[120px] ml-auto">{t.notes}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
