import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ClipboardList, Warehouse as WarehouseIcon, ChevronRight, Calendar, User, ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { format } from "date-fns";
import { StockTabs } from "@/components/stock/StockTabs";
import { PageHeader } from "@/components/PageHeader";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { StockAudit as StockAuditType, Warehouse as WarehouseType } from "@/types";
import { cn } from "@/lib/utils";

export default function StockAudit() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [audits, setAudits] = useState<(StockAuditType & { warehouses: WarehouseType })[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteAudit = async (id: string) => {
    try {
      const { error } = await supabase
        .from("stock_audits")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Count session deleted successfully");
      fetchData();
    } catch (err: unknown) {
      console.error('[Context] Delete audit session failed', err);
      toast.error(friendlyError(err));
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, w] = await Promise.all([
        supabase
          .from("stock_audits")
          .select("*, warehouses(name, code)")
          .order("started_at", { ascending: false }),
        supabase.from("warehouses").select("*").eq("is_active", true),
      ]);

      if (a.error) throw a.error;
      if (w.error) throw w.error;

      setAudits(a.data as unknown as (StockAuditType & { warehouses: WarehouseType })[] || []);
      setWarehouses(w.data || []);
    } catch (err: unknown) {
      console.error('[Context] Fetch audit data failed', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const startAudit = async () => {
    if (!selectedWarehouse) {
      console.error('[Context] Warehouse selection missing for audit');
      toast.error("Please select a warehouse");
      return;
    }

    try {
      // 1. Check if warehouse is active
      const { data: wh, error: whCheckError } = await supabase
        .from("warehouses")
        .select("is_active")
        .eq("id", selectedWarehouse)
        .single();
      
      if (whCheckError) throw whCheckError;
      if (!wh.is_active) {
        console.error('[Context] Audit attempted on inactive warehouse', selectedWarehouse);
        toast.error("Audit cannot be started for an inactive warehouse");
        return;
      }

      // 2. Create audit record
      const { data: audit, error: auditError } = await supabase
        .from("stock_audits")
        .insert({
          warehouse_id: selectedWarehouse,
          status: "pending",
          auditor_id: user?.id,
        })
        .select()
        .single();

      if (auditError) throw auditError;

      // 3. Fetch current stock for this warehouse
      const { data: batches, error: batchError } = await supabase
        .from("inventory_batches")
        .select("*")
        .eq("warehouse_id", selectedWarehouse)
        .gt("remaining_qty", 0);

      if (batchError) throw batchError;

      // Group batches by product_id to sum their remaining_qty
      const productTotals: Record<string, number> = {};
      if (batches) {
        batches.forEach((b) => {
          productTotals[b.product_id] = (productTotals[b.product_id] || 0) + Number(b.remaining_qty);
        });
      }

      // 4. Prepare audit items (one per product)
      const auditItems = Object.entries(productTotals).map(([prodId, totalQty]) => ({
        audit_id: audit.id,
        product_id: prodId,
        expected_qty: totalQty,
        actual_qty: totalQty,
        reconciliation_qty: 0,
      }));

      if (auditItems.length > 0) {
        const { error: itemsError } = await supabase
          .from("stock_audit_items")
          .insert(auditItems);

        if (itemsError) throw itemsError;
      }

      toast.success("Audit session started");
      navigate(`/stock/audits/${audit.id}`);
    } catch (err: unknown) {
      console.error('[Context] Start audit session failed', err);
      toast.error(friendlyError(err));
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  return (
    <div className="pb-32 md:pb-24">
      <PageHeader 
        title="Physical Inventory Audit"
        subtitle="Verify physical stock and reconcile variances"
        onBack={() => navigate("/stock")}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 px-6 rounded-xl font-bold uppercase tracking-wider text-xs shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                New Session
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl border border-border bg-background shadow-lg max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-black uppercase tracking-tight">Start Audit</DialogTitle>
                <DialogDescription className="font-medium text-sm text-muted-foreground mt-1">
                  Choose a warehouse to start a physical stock count.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Select Warehouse</Label>
                  <Select value={selectedWarehouse} onValueChange={setSelectedWarehouse}>
                    <SelectTrigger className="h-12 rounded-xl border border-border bg-card font-bold">
                      <SelectValue placeholder="Pick a warehouse..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border">
                      {warehouses.map((w: WarehouseType) => (
                        <SelectItem key={w.id} value={w.id} className="font-bold">
                          {w.name} <span className="opacity-40 ml-2 font-mono text-[10px]">{w.code}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0 mt-6">
                <Button variant="outline" onClick={() => setOpen(false)} className="h-11 rounded-xl font-bold">Cancel</Button>
                <Button onClick={startAudit} className="h-11 px-8 rounded-xl font-bold uppercase tracking-wider text-xs">Start Session</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <ResponsiveContainer className="space-y-4 md:space-y-6 mt-1 md:mt-4">
        <StockTabs />

        <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden bg-card">
          <Table className="w-full border-collapse">
            <TableHeader>
              <TableRow className="bg-muted/40 border-b border-border/60 hover:bg-transparent">
                <TableHead className="py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Created At</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Warehouse</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center">Status</TableHead>
                <TableHead className="text-right pr-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-6"><div className="h-5 w-24 animate-pulse bg-muted rounded" /></TableCell>
                    <TableCell><div className="h-6 w-32 animate-pulse bg-muted rounded" /></TableCell>
                    <TableCell className="text-center"><div className="h-5 w-16 animate-pulse bg-muted rounded mx-auto" /></TableCell>
                    <TableCell className="pr-6 text-right"><div className="h-5 w-16 animate-pulse bg-muted rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : audits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-16 text-center">
                    <p className="text-xs font-black text-muted-foreground/40 uppercase tracking-widest">No audit sessions recorded</p>
                    <p className="text-sm font-medium text-muted-foreground/60 mt-1">Start a new session to begin auditing</p>
                  </TableCell>
                </TableRow>
              ) : (
                audits.map((a: StockAuditType & { warehouses: WarehouseType }) => (
                  <TableRow key={a.id} className="cursor-pointer group hover:bg-muted/10 font-medium border-b border-border/35 last:border-b-0" onClick={() => navigate(`/stock/audits/${a.id}`)}>
                    <TableCell className="py-4 pl-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-foreground">{format(new Date(a.started_at), "MMM d, yyyy")}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{format(new Date(a.started_at), "HH:mm")}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-primary/5 rounded border border-primary/10">
                          <WarehouseIcon className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm uppercase text-foreground group-hover:text-primary transition-colors">{a.warehouses?.name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{a.warehouses?.code}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={a.status === 'approved' ? 'default' : a.status === 'pending' ? 'secondary' : 'destructive'} 
                        className={cn(
                          "rounded-md px-2 py-0.5 font-black text-[9px] uppercase tracking-widest",
                          a.status === 'approved' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                          a.status === 'pending' ? 'bg-amber-100 text-amber-700 border-amber-200' : ''
                        )}>
                        {a.status === 'pending' ? 'draft' : a.status === 'approved' ? 'completed' : a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {a.status !== 'approved' && (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="rounded-xl h-9 w-9 text-rose-500 hover:text-rose-700 hover:bg-rose-50/50 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(a.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="rounded-xl h-8 w-8 p-0" onClick={() => navigate(`/stock/audits/${a.id}`)}>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </ResponsiveContainer>

      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <DialogContent className="rounded-2xl border border-border bg-background shadow-lg max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-rose-600 tracking-tight">Delete Audit Session</DialogTitle>
            <DialogDescription className="font-medium text-sm text-muted-foreground mt-1">
              Are you sure you want to delete this physical count session? All counted item records within this session will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-6">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} className="h-11 rounded-xl font-bold">
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (confirmDeleteId) {
                  await deleteAudit(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }} 
              className="h-11 px-8 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white"
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Removed local cn utility as we now import it from @/lib/utils
