import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Loader2, Plus, Search, Warehouse, Edit2, Trash2, MapPin, Hash, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Warehouse as WarehouseType } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { StockTabs } from "@/components/stock/StockTabs";
import { ResponsiveContainer } from "@/components/ui/responsive-ui";
import { WarehouseDrawer } from "@/components/stock/WarehouseDrawer";

import { useIsMobile } from "@/lib/responsive";

export default function Warehouses() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = React.useState(true);
  const [warehouses, setWarehouses] = React.useState<WarehouseType[]>([]);
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WarehouseType | null>(null);

  const fetchWarehouses = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('name');

      if (error) throw error;
      setWarehouses(data || []);
    } catch (err: unknown) {
      console.error('[Context] Fetch warehouses failed', err);
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  const startEdit = (w: WarehouseType) => {
    setEditing(w);
    setOpen(true);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setEditing(null);
    }
  };

  const toggleStatus = async (w: WarehouseType) => {
    try {
      const { error } = await supabase
        .from('warehouses')
        .update({ is_active: !w.is_active, updated_at: new Date().toISOString() })
        .eq('id', w.id);
      
      if (error) throw error;
      toast.success(`Warehouse ${w.is_active ? 'deactivated' : 'activated'}`);
      fetchWarehouses();
    } catch (err: unknown) {
      console.error('[Context] Toggle warehouse status failed', err);
      toast.error(friendlyError(err));
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground italic">Admin access restricted</div>;

  const filtered = warehouses.filter(w => 
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.code?.toLowerCase().includes(search.toLowerCase()) ||
    w.location?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ResponsiveContainer className="w-full space-y-5 pb-20 animate-fade-in">
      <PageHeader 
        title="Warehouses"
        subtitle="Manage locations for stock storage"
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/stock")}
        action={
          <Button 
            onClick={() => setOpen(true)}
            className="font-black uppercase tracking-widest text-xs h-11 px-6 rounded-2xl shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="h-4 w-4 mr-2" /> Add warehouse
          </Button>
        }
      />

      <WarehouseDrawer 
        open={open} 
        onOpenChange={handleOpenChange} 
        onSaved={fetchWarehouses} 
        editingWarehouse={editing} 
      />

      <StockTabs />

      <Card className="rounded-2xl border border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="p-6 pb-2">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-50" />
            <Input 
              className="pl-11 pr-10 h-11 rounded-xl border bg-muted/5 focus:bg-background transition-all" 
              placeholder="Filter warehouses by name or location..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button 
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center text-slate-300 hover:text-slate-600 transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-4 overflow-x-auto">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/30 border-y border-border/50">
                <TableHead className="py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Warehouse</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden xl:table-cell w-[100px]">Code</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[100px]">Status</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hidden lg:table-cell w-[120px]">Last updated</TableHead>
                <TableHead className="pr-6 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-20"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary opacity-20" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-20 text-muted-foreground italic font-medium opacity-50 uppercase tracking-widest text-xs">No warehouses added</TableCell></TableRow>
              ) : filtered.map(w => (
                <TableRow key={w.id} className="group hover:bg-muted/10 transition-colors border-b border-border/30">
                  <TableCell className="pl-6 py-6">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform group-hover:scale-110">
                        <Warehouse className="h-5 w-5 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-base sm:text-lg uppercase tracking-tight text-foreground break-words leading-tight">{w.name}</div>
                        <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground font-bold mt-0.5 opacity-60">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="break-words">{w.location || "No location specified"}</span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="flex items-center gap-2">
                       <Hash className="h-3 w-3 text-muted-foreground opacity-40 shrink-0" />
                       <span className="font-black font-mono text-sm tracking-tight">{w.code || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={w.is_active ? "secondary" : "outline"} 
                      className={cn(
                        "font-black text-[9px] uppercase tracking-widest px-2 sm:px-3 py-1 cursor-pointer",
                        w.is_active ? "bg-emerald-100 text-emerald-700 border-none" : "opacity-50"
                      )}
                      onClick={() => toggleStatus(w)}
                    >
                      {w.is_active ? "ACTIVE" : "INACTIVE"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="text-[10px] font-black uppercase text-muted-foreground opacity-60">
                      {w.updated_at ? new Date(w.updated_at).toLocaleDateString() : "Just now"}
                    </div>
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-primary hover:bg-primary/10 transition-all" onClick={() => startEdit(w)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </ResponsiveContainer>
  );
}
