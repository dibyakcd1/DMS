import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Loader2, Plus, Search, ArrowRightLeft, Package, User, ArrowRight, History as HistoryIcon, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/PageHeader";
import { StockTabs } from "@/components/stock/StockTabs";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";

type Product = {
  id: string;
  name: string;
  sku: string;
};

type Batch = {
  id: string;
  product_id: string;
  batch_number: string;
  remaining_qty: number;
  expiry_date: string;
  warehouse_id?: string;
};

type TransferRecord = {
  id: string;
  product_id: string;
  from_batch_id: string;
  to_batch_id: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  products: Product | null;
  from_batch: { batch_number: string } | null;
  to_batch: { batch_number: string } | null;
};

import { derivePackaging, convertToBaseUnits } from "@/lib/packaging";

import { useIsMobile } from "@/lib/responsive";

export default function StockTransfers() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [search, setSearch] = useState("");
  
  // Form State
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [fromBatchId, setFromBatchId] = useState<string>("");
  const [toBatchId, setToBatchId] = useState<string>("");
  const [transferQty, setTransferQty] = useState<string>("");
  const [transferUnit, setTransferUnit] = useState<string>("unit");
  const [notes, setNotes] = useState("");

  const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [products, selectedProductId]);
  const packagingInfo = useMemo(() => selectedProduct ? derivePackaging(selectedProduct) : null, [selectedProduct]);

  useEffect(() => {
    fetchTransfers();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProductId) {
      fetchBatches(selectedProductId);
      setTransferUnit("unit");
    } else {
      setBatches([]);
      setFromBatchId("");
      setToBatchId("");
    }
  }, [selectedProductId]);

  const fetchTransfers = async () => {
    setLoading(true);
    try {
      const [transRes, prodRes, batchRes] = await Promise.all([
        supabase.from('stock_transfers').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('id, name, sku'),
        supabase.from('inventory_batches').select('id, batch_number')
      ]);

      if (transRes.error) throw transRes.error;
      if (prodRes.error) throw prodRes.error;
      if (batchRes.error) throw batchRes.error;

      const prodMap = new Map(prodRes.data.map(p => [p.id, p]));
      const batchMap = new Map(batchRes.data.map(b => [b.id, b]));

      const joined = (transRes.data || []).map(t => ({
        ...t,
        products: prodMap.get(t.product_id) || null,
        from_batch: batchMap.get(t.from_batch_id) || null,
        to_batch: batchMap.get(t.to_batch_id) || null
      }));

      setTransfers(joined as unknown as TransferRecord[]);
    } catch (err: unknown) {
      console.error('[Context]', err);
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
      .order('expiry_date', { ascending: true });
    setBatches(data || []);
  };

  const handleSubmit = async () => {
    if (!selectedProductId || !fromBatchId || !toBatchId || !transferQty) {
      console.error('[Context] Missing required fields for stock transfer');
      return toast.error("Please fill all required fields");
    }
    if (fromBatchId === toBatchId) {
      console.error('[Context] Source and destination batches are identical');
      return toast.error("Source and destination batches must be different");
    }

    const qty = Number(transferQty);
    let baseQty = qty;

    if (selectedProduct) {
      baseQty = convertToBaseUnits(qty, transferUnit, selectedProduct);
    }

    const fromBatch = batches.find(b => b.id === fromBatchId);
    const toBatch = batches.find(b => b.id === toBatchId);

    // Stock movement handled by DB trigger: handle_stock_transfer.
    if (fromBatch && toBatch && fromBatch.warehouse_id !== toBatch.warehouse_id) {
       console.error('[Context] Inter-batch transfer attempted between different warehouses');
       return toast.error("Inter-Batch Transfer is only for batches within the same warehouse. Use 'Warehouse Relocation' for moving stock between warehouses.");
    }

    if (fromBatch && baseQty > fromBatch.remaining_qty) {
      console.error('[Context] Insufficient stock in source batch', { available: fromBatch.remaining_qty, requested: baseQty });
      return toast.error(`Insufficient stock in source batch (Available: ${fromBatch.remaining_qty} units)`);
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('transfer_stock', {
        p_product_id: selectedProductId,
        p_from_batch_id: fromBatchId,
        p_to_batch_id: toBatchId,
        p_warehouse_id: fromBatch?.warehouse_id,
        p_quantity: baseQty,
        p_performed_by: user?.id,
        p_notes: notes
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

      toast.success("Stock transferred successfully");
      setOpen(false);
      resetForm();
      fetchTransfers();
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedProductId("");
    setFromBatchId("");
    setToBatchId("");
    setTransferQty("");
    setTransferUnit("unit");
    setNotes("");
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  const filtered = transfers.filter(t => 
    t.products?.name.toLowerCase().includes(search.toLowerCase()) ||
    t.from_batch?.batch_number.toLowerCase().includes(search.toLowerCase()) ||
    t.to_batch?.batch_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="pb-32 md:pb-24">
      <PageHeader 
        title="Move Between Batches"
        subtitle="Move stock in the same warehouse"
        onBack={() => navigate("/stock")}
        action={
          <div className="flex gap-2">
            <Button variant="outline" className="font-bold uppercase tracking-wider text-xs h-11 px-6 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground" onClick={() => navigate("/stock/movement")}>
              <HistoryIcon className="h-4 w-4 mr-2" /> History
            </Button>
            
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button className="font-bold uppercase tracking-wider text-xs h-11 px-6 rounded-xl shadow-sm" onClick={resetForm}>
                  <ArrowRightLeft className="h-4 w-4 mr-2" /> New Transfer
                </Button>
              </SheetTrigger>
              <SheetContent side={isMobile ? "bottom" : "right"} className={cn("rounded-t-2xl p-0 overflow-hidden border-t-0 shadow-2xl", isMobile ? "h-[92dvh]" : "w-[560px] h-full rounded-none")}>
                <div className="h-full flex flex-col bg-background">
                  <div className="p-6 pb-0">
                    {isMobile && <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mb-6" />}
                    <SheetHeader className="mb-6">
                      <SheetTitle className="text-2xl font-bold text-center">Move Between Batches</SheetTitle>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground opacity-60 text-center">Internal Move</p>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto mt-2 px-6 pb-24 space-y-6">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Product</Label>
                      <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                        <SelectTrigger className="h-12 rounded-xl border border-border bg-card font-bold focus:ring-primary/20">
                          <SelectValue placeholder="Select product..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border border-border max-h-[300px]">
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id} className="font-bold">{p.name} <span className="text-[10px] text-muted-foreground ml-2 opacity-60">({p.sku})</span></SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedProductId && (
                      <div className="grid grid-cols-1 gap-4 p-5 bg-muted/30 rounded-2xl border border-border animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-bold uppercase text-brand-primary tracking-wider opacity-70 ml-1">Move From</Label>
                          <Select value={fromBatchId} onValueChange={setFromBatchId}>
                            <SelectTrigger className="h-10 rounded-xl border-border/50 bg-white shadow-sm font-bold text-xs uppercase tracking-tight">
                              <SelectValue placeholder="Pick source batch..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border border-border">
                              {batches.filter(b => b.remaining_qty > 0).map(b => (
                                <SelectItem key={b.id} value={b.id} className="font-bold text-xs">
                                  {b.batch_number} <span className="text-[9px] opacity-60 whitespace-nowrap ml-2">(Available: {b.remaining_qty})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex justify-center -my-2 relative z-10">
                          <div className="bg-background p-2 rounded-full border border-primary/20 shadow-sm text-primary">
                            <ArrowRightLeft className="h-4 w-4 rotate-90" />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-bold uppercase text-emerald-600 tracking-wider opacity-70 ml-1">Move To</Label>
                          <Select value={toBatchId} onValueChange={setToBatchId}>
                            <SelectTrigger className="h-10 rounded-xl border-border/50 bg-white shadow-sm font-bold text-xs uppercase tracking-tight">
                              <SelectValue placeholder="Pick target batch..." />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border border-border">
                              {batches.map(b => (
                                <SelectItem key={b.id} value={b.id} className="font-bold text-xs" disabled={b.id === fromBatchId}>
                                  {b.batch_number} {b.id === fromBatchId ? '(SOURCE)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Quantity to Move</Label>
                      <div className="flex gap-2">
                        <Input 
                          type="number" 
                          className="h-12 rounded-xl border border-border bg-card font-bold text-lg focus:ring-primary/20 tabular-nums flex-1" 
                          value={transferQty} 
                          onChange={e => setTransferQty(e.target.value)}
                          placeholder="0"
                        />
                        <Select value={transferUnit} onValueChange={setTransferUnit}>
                          <SelectTrigger className="h-12 w-32 rounded-xl border border-border bg-card font-bold focus:ring-primary/20 capitalize">
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
                      <p className="text-[10px] text-muted-foreground font-medium italic ml-1 opacity-60">Choose how many units to move.</p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Notes</Label>
                      <Input 
                        className="h-12 rounded-xl border border-border bg-card font-medium focus:ring-primary/20" 
                        value={notes} 
                        onChange={e => setNotes(e.target.value)} 
                        placeholder="Add a reason for this move..." 
                      />
                    </div>
                  </div>

                  <div className="p-6 pt-4 bg-background border-t border-border flex gap-3 shrink-0 relative z-20">
                    <Button variant="outline" className="h-12 rounded-xl flex-1 font-bold uppercase tracking-wider text-xs border" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button className="h-12 rounded-xl flex-[2] font-bold uppercase tracking-wider text-xs shadow-sm" onClick={handleSubmit} disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Package className="h-4 w-4 mr-2" />}
                      Move Stock
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

        <div className="space-y-4 md:space-y-6">
          {/* Universal Search bar for mobile and desktop */}
          <div className="flex gap-2 w-full max-w-md">
            <div className="flex-1 w-full relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search transfer records..."
                className="pl-10 pr-10 h-11 md:h-12 rounded-xl border border-border bg-card font-medium text-sm shadow-sm focus:border-primary/30 focus:ring-0 transition-all w-full"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card">
            <CardContent className="p-0">
              {isMobile ? (
                <div className="divide-y divide-border/40">
                  {loading ? (
                    <div className="space-y-3 p-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-16 w-full animate-pulse bg-muted/40 rounded-xl" />
                      ))}
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="py-16 px-6 text-center flex flex-col items-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-muted/40 flex items-center justify-center">
                        <ArrowRightLeft className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-muted-foreground/40 uppercase tracking-widest">No history found</p>
                        <p className="text-sm font-medium text-muted-foreground/60 mt-1">Try adjusting your search</p>
                      </div>
                    </div>
                  ) : filtered.map(t => (
                    <div key={t.id} className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-sm uppercase tracking-tight text-foreground">{t.products?.name}</div>
                          <div className="text-[10px] font-bold font-mono text-muted-foreground uppercase opacity-60 tracking-tighter">{t.products?.sku}</div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase text-foreground">{new Date(t.created_at).toLocaleDateString()}</p>
                          <p className="text-[9px] font-mono text-muted-foreground">{new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-lg bg-muted text-[10px] font-bold font-mono text-muted-foreground border break-all">{t.from_batch?.batch_number}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground opacity-30 shrink-0" />
                          <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-[10px] font-bold font-mono text-primary border border-primary/20 break-all">{t.to_batch?.batch_number}</span>
                        </div>
                        <div className="flex justify-between items-end gap-2">
                          <p className="text-[9px] font-bold text-muted-foreground italic break-words">{t.notes || "—"}</p>
                          <div className="text-right font-bold text-lg tabular-nums text-primary">
                            {t.quantity}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="w-full border-collapse">
                    <TableHeader>
                      <TableRow className="bg-muted/40 border-b border-border/60 hover:bg-transparent">
                        <TableHead className="py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 w-[140px] hidden lg:table-cell">Date</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Product Info</TableHead>
                        <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center hidden xl:table-cell">Batch Move</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 w-[120px]">Quantity</TableHead>
                        <TableHead className="pr-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-right hidden lg:table-cell">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell className="pl-6"><div className="h-4 w-20 animate-pulse bg-muted rounded" /></TableCell>
                            <TableCell><div className="h-5 w-40 animate-pulse bg-muted rounded" /></TableCell>
                            <TableCell><div className="h-6 w-32 animate-pulse bg-muted rounded mx-auto" /></TableCell>
                            <TableCell className="text-right pr-6"><div className="h-5 w-12 animate-pulse bg-muted rounded ml-auto" /></TableCell>
                            <TableCell className="pr-6 hidden lg:table-cell"><div className="h-4 w-28 animate-pulse bg-muted rounded ml-auto" /></TableCell>
                          </TableRow>
                        ))
                      ) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-16 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="h-12 w-12 rounded-2xl bg-muted/40 flex items-center justify-center">
                                <ArrowRightLeft className="h-5 w-5 text-muted-foreground/40" />
                              </div>
                              <div>
                                <p className="text-xs font-black text-muted-foreground/40 uppercase tracking-widest">No history found</p>
                                <p className="text-sm font-medium text-muted-foreground/60 mt-1">Try adjusting your search</p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map(t => (
                          <TableRow key={t.id} className="group hover:bg-muted/10 transition-colors border-b border-border/35 last:border-b-0">
                            <TableCell className="pl-6 py-4 hidden lg:table-cell">
                              <p className="text-[10px] font-bold uppercase text-foreground">{fmtDate(t.created_at)}</p>
                              <p className="text-[9px] font-mono text-muted-foreground">{new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </TableCell>
                            <TableCell>
                              <div className="font-bold text-sm uppercase tracking-tight text-foreground group-hover:text-primary transition-colors">{t.products?.name}</div>
                              <div className="text-[10px] font-bold font-mono text-muted-foreground uppercase opacity-60 tracking-tighter">{t.products?.sku}</div>
                            </TableCell>
                            <TableCell className="hidden xl:table-cell">
                               <div className="flex items-center justify-center gap-3">
                                 <span className="px-2 py-0.5 rounded-lg bg-muted text-[10px] font-bold font-mono text-muted-foreground border truncate max-w-[100px]">{t.from_batch?.batch_number}</span>
                                 <ArrowRight className="h-3 w-3 text-muted-foreground opacity-30" />
                                 <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-[10px] font-bold font-mono text-primary border border-primary/20 truncate max-w-[100px]">{t.to_batch?.batch_number}</span>
                               </div>
                            </TableCell>
                            <TableCell className="text-right font-bold text-base tabular-nums text-primary">
                              {t.quantity}
                            </TableCell>
                            <TableCell className="pr-6 text-right hidden lg:table-cell">
                              <p className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors max-w-[180px] inline-block truncate" title={t.notes || ""}>
                                {t.notes || "—"}
                              </p>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ResponsiveContainer>
    </div>
  );
}

