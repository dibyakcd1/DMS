import { useState } from "react";
import { Search, Store, ChevronRight, X, Plus, Zap, UserPlus, Phone, Loader2 } from "lucide-react";
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
import { createInstantCustomer } from "@/lib/quickOrder";
import { toast } from "sonner";

interface InlineShopSelectorProps {
  shopId: string;
  shops: Shop[];
  outstandingBalance: number;
  onSelect: (id: string) => void;
  onQuickOrder?: (customerName?: string, phone?: string) => void;
  loading?: boolean;
}

export const InlineShopSelector = ({ 
  shopId, 
  shops, 
  outstandingBalance, 
  onSelect,
  onQuickOrder,
  loading 
}: InlineShopSelectorProps) => {
  const [open, setOpen] = useState(false);
  const [shopQ, setShopQ] = useState("");
  const [quickCustName, setQuickCustName] = useState("");
  const [quickCustPhone, setQuickCustPhone] = useState("");
  const [isCreatingInstant, setIsCreatingInstant] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const selectedShop = shops.find(s => s.id === shopId);
  const filteredShops = shops.filter(s => s.name.toLowerCase().includes(shopQ.toLowerCase()));

  const handleShopAdded = (newShopId: string) => {
    queryClient.invalidateQueries({ queryKey: ["shops"] });
    onSelect(newShopId);
    setOpen(false);
  };

  const handleQuickCustomerCreate = async (name: string, phone?: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Please enter a customer or shop name");
      return;
    }
    try {
      setIsCreatingInstant(true);
      const newShop = await createInstantCustomer(trimmed, phone);
      queryClient.invalidateQueries({ queryKey: ["shops"] });
      onSelect(newShop.id);
      setOpen(false);
      setShopQ("");
      setQuickCustName("");
      setQuickCustPhone("");
      toast.success(`Customer "${newShop.name}" added instantly!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setIsCreatingInstant(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Card className="group cursor-pointer border border-border/40 hover:shadow-md transition-all rounded-2xl bg-white overflow-hidden shadow-sm h-full">
          <CardContent className="flex items-center gap-4 p-4 h-full">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-50 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-900 transition-all shrink-0">
              <Store className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Select Outlet / Customer</div>
              <div className="font-bold text-base tracking-tight text-slate-900">
                {loading ? "Searching..." : (selectedShop?.name ?? "Select Shop / Customer")}
              </div>
              {selectedShop && !loading && (
                <div className="flex items-center gap-2 text-[11px] font-medium mt-1.5 text-slate-500">
                   <span className="truncate italic">GST: {selectedShop.gstin || "N/A"}</span>
                   {selectedShop.credit_limit > 0 && (
                     <span className={cn(
                       "flex items-center gap-1",
                       outstandingBalance > selectedShop.credit_limit ? "text-rose-600 font-bold" : "text-slate-400"
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
      <SheetContent side="bottom" className="h-[90dvh] sm:h-[85vh] rounded-t-3xl p-0 overflow-hidden border-none shadow-2xl bg-slate-50">
        <div className="h-full flex flex-col">
          <div className="px-6 pt-6 pb-4 bg-white border-b border-border/40 shrink-0">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-6" />
            <SheetHeader className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-2xl font-bold tracking-tight text-slate-900">Select Shop / Customer</SheetTitle>
                  <p className="text-sm font-medium text-slate-400">Choose an outlet, quick add customer, or proceed with Walk-in Sale</p>
                </div>
                <div className="flex items-center gap-2">
                  {onQuickOrder && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setOpen(false);
                        onQuickOrder();
                      }}
                      className="h-11 rounded-xl border-amber-300 bg-amber-50/80 text-amber-900 hover:bg-amber-100 font-bold text-xs gap-1.5 px-4 shadow-sm"
                    >
                      <Zap className="h-4 w-4 text-amber-600 fill-amber-600" />
                      <span>Quick Walk-in</span>
                    </Button>
                  )}
                  <Button 
                    onClick={() => setAddDialogOpen(true)}
                    className="h-11 rounded-xl bg-slate-900 text-white font-bold text-xs gap-2 px-5 shadow-xl shadow-slate-900/10 active:scale-95 transition-all"
                  >
                    <Plus className="h-4 w-4" />
                    <span>New Shop (Full Form)</span>
                  </Button>
                </div>
              </div>
            </SheetHeader>

            <AddShopDialog 
              open={addDialogOpen}
              onOpenChange={setAddDialogOpen}
              onSuccess={handleShopAdded}
            />
            <div className="relative group">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
              <Input 
                className="pl-12 h-14 rounded-xl border-border/40 bg-slate-50 font-bold text-lg focus:bg-white focus:ring-2 focus:ring-slate-900/10 transition-all placeholder:font-medium placeholder:text-slate-300" 
                placeholder="Search shops by name, address or GSTIN..." 
                autoFocus 
                value={shopQ} 
                onChange={e=>setShopQ(e.target.value)} 
              />
            </div>

            {/* Instant 1-Click Customer Add when typing in search */}
            {shopQ.trim().length > 1 && !shops.some(s => s.name.toLowerCase() === shopQ.trim().toLowerCase()) && (
              <div className="mt-3 p-3 bg-indigo-50/80 border border-indigo-200 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-indigo-950 truncate">
                      Add &ldquo;<span className="text-indigo-600 font-extrabold">{shopQ.trim()}</span>&rdquo; as Customer
                    </div>
                    <div className="text-[10px] font-medium text-indigo-700">Instant 1-Click creation for instant billing</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={isCreatingInstant}
                  onClick={() => handleQuickCustomerCreate(shopQ.trim())}
                  className="h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shrink-0 shadow-sm gap-1"
                >
                  {isCreatingInstant ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  <span>Add & Select</span>
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6 touch-pan-y scroll-smooth">
            {/* Quick Order & Instant Customer Card */}
            {onQuickOrder && !shopQ && (
              <div className="mb-5 p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-slate-50 border border-amber-200/80 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shrink-0">
                      <Zap className="h-5 w-5 fill-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">⚡ Quick Order / Instant Customer</h4>
                      <p className="text-xs text-slate-500">Type a customer name instantly or start a fast counter sale</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      onQuickOrder();
                    }}
                    className="h-8 rounded-xl border-amber-300 bg-white text-amber-900 hover:bg-amber-50 font-bold text-xs shrink-0"
                  >
                    Walk-in Sale (No Name)
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 border-t border-amber-200/50">
                  <div className="relative w-full sm:flex-1">
                    <Input
                      placeholder="Instant Customer Name (e.g. Ramesh Bhai, Balaji Store)..."
                      value={quickCustName}
                      onChange={e => setQuickCustName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && quickCustName.trim()) {
                          handleQuickCustomerCreate(quickCustName, quickCustPhone);
                        }
                      }}
                      className="h-10 rounded-xl bg-white border-amber-200 font-medium text-xs text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                  <div className="relative w-full sm:w-40">
                    <Input
                      placeholder="Phone (Optional)"
                      value={quickCustPhone}
                      onChange={e => setQuickCustPhone(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && quickCustName.trim()) {
                          handleQuickCustomerCreate(quickCustName, quickCustPhone);
                        }
                      }}
                      className="h-10 rounded-xl bg-white border-amber-200 font-medium text-xs text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={!quickCustName.trim() || isCreatingInstant}
                    onClick={() => handleQuickCustomerCreate(quickCustName, quickCustPhone)}
                    className="w-full sm:w-auto h-10 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 px-4 shadow-sm shrink-0"
                  >
                    {isCreatingInstant ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    <span>Start Order with Customer</span>
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredShops.map((s, idx) => (
                <button 
                  key={`${s.id}-${idx}`} 
                  className="w-full rounded-2xl p-5 text-left bg-white border border-border/40 hover:border-slate-900 hover:shadow-xl transition-all flex items-center justify-between group active:scale-[0.98]" 
                  onClick={()=>{ onSelect(s.id); setOpen(false); setShopQ(""); }}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-base tracking-tight group-hover:text-slate-900 transition-colors mb-1">{s.name}</div>
                    {s.phone && <div className="text-[11px] font-medium text-slate-500 tracking-tight mb-1 flex items-center gap-1"><Phone className="h-3 w-3 text-slate-400" /> {s.phone}</div>}
                    {s.gstin && <div className="text-[11px] font-medium text-slate-400 tracking-tight mb-2">GSTIN: {s.gstin}</div>}
                    <div className="flex items-center gap-2">
                       <Badge variant="outline" className="text-[10px] h-5 rounded-full font-bold bg-slate-50 text-slate-500 border-none px-3 uppercase tracking-wider">{s.shop_type || "Basic"}</Badge>
                       {s.credit_limit > 0 && <span className="text-[11px] font-bold text-emerald-600">LIMIT: {fmtINR(s.credit_limit)}</span>}
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-all shrink-0 ml-4">
                    <ChevronRight size={18} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

