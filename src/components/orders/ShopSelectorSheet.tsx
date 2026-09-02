import { useState } from "react";
import { Search, Store, ChevronRight, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { fmtINR } from "@/lib/format";
import { Shop } from "@/types";
import { AddShopDialog } from "@/components/AddShopDialog";
import { useQueryClient } from "@tanstack/react-query";

interface ShopSelectorSheetProps {
  shopId: string;
  shops: Shop[];
  outstandingBalance: number;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShopSelectorSheet = ({ 
  shopId, 
  shops, 
  outstandingBalance, 
  onSelect, 
  open, 
  onOpenChange 
}: ShopSelectorSheetProps) => {
  const [shopQ, setShopQ] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const selectedShop = shops.find(s => s.id === shopId);
  const filteredShops = shops.filter(s => s.name.toLowerCase().includes(shopQ.toLowerCase()));

  const handleShopAdded = (newShopId: string) => {
    queryClient.invalidateQueries({ queryKey: ["shops"] });
    onSelect(newShopId);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Card className="group cursor-pointer border border-border/60 hover:border-primary/40 hover:shadow-md transition-all rounded-2xl bg-white overflow-hidden shadow-sm h-full">
          <CardContent className="flex items-center gap-4 p-4 h-full">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/5 text-primary shadow-inner group-hover:scale-105 transition-transform shrink-0">
              <Store className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-muted-foreground mb-0.5">Partner outlet</div>
              <div className="font-bold text-base tracking-tight truncate group-hover:text-primary transition-colors">
                {selectedShop?.name ?? "Select customer"}
              </div>
              {selectedShop && (
                <div className="flex items-center gap-2 text-[11px] font-medium mt-1 text-muted-foreground">
                   <span className="truncate italic">GST: {selectedShop.gstin || "N/A"}</span>
                   {selectedShop.credit_limit > 0 && (
                     <span className={cn(
                       "flex items-center gap-1",
                       outstandingBalance > selectedShop.credit_limit ? "text-destructive font-bold" : "opacity-60"
                     )}>
                       {fmtINR(outstandingBalance)} / {fmtINR(selectedShop.credit_limit)}
                     </span>
                   )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[98dvh] sm:h-[98vh] rounded-t-[2rem] p-0 overflow-hidden border-0 shadow-2xl bg-muted/20">
        <div className="h-full flex flex-col">
          <div className="px-6 pt-6 pb-2 shrink-0">
            <div className="w-12 h-1 bg-border rounded-full mx-auto mb-4" />
            <SheetHeader className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-2xl font-bold tracking-tight">Designate shop</SheetTitle>
                  <p className="text-sm font-medium text-muted-foreground">Select a distribution node to start the order</p>
                </div>
                <Button 
                  onClick={() => setAddDialogOpen(true)}
                  className="h-10 rounded-xl bg-slate-900 text-white font-bold text-xs gap-2 px-4 whitespace-nowrap shadow-xl shadow-slate-900/20"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add New</span>
                </Button>
              </div>
            </SheetHeader>

            <AddShopDialog 
              open={addDialogOpen}
              onOpenChange={setAddDialogOpen}
              onSuccess={handleShopAdded}
            />
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50" />
              <Input className="pl-12 h-12 rounded-2xl border-border bg-white font-bold text-lg placeholder:font-medium placeholder:text-muted-foreground/40" placeholder="Search entity name..." autoFocus value={shopQ} onChange={e=>setShopQ(e.target.value)} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pt-4 pb-24 touch-pan-y scroll-smooth">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {filteredShops.map((s, idx) => (
                <button 
                  key={`${s.id}-${idx}`} 
                  className="w-full rounded-2xl p-4 text-left bg-white border border-border hover:border-primary hover:bg-primary/5 hover:shadow-md transition-all flex items-center justify-between group active:scale-[0.98]" 
                  onClick={()=>{ onSelect(s.id); onOpenChange(false); setShopQ(""); }}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-foreground text-sm tracking-tight group-hover:text-primary transition-colors truncate">{s.name}</div>
                    {s.gstin && <div className="text-[11px] font-medium text-muted-foreground mt-0.5 tracking-tight">GSTIN: {s.gstin}</div>}
                    <div className="flex items-center gap-2 mt-1.5">
                       <Badge variant="outline" className="text-[10px] h-5 rounded-lg font-bold bg-muted/50 text-muted-foreground border-border/60">{s.shop_type || "Basic"}</Badge>
                       {s.credit_limit > 0 && <span className="text-[11px] font-bold text-emerald-600">L: {fmtINR(s.credit_limit)}</span>}
                    </div>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all shadow-sm shrink-0 ml-2">
                    <ChevronRight size={16} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="absolute bottom-4 right-4 pointer-events-none">
            <Button size="icon" className="h-12 w-12 rounded-full shadow-lg bg-slate-900 pointer-events-auto" onClick={() => onOpenChange(false)}>
              <X className="h-5 w-5 text-white" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
