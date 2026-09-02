import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContextCore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Phone, MapPin, Plus, Receipt, History, 
  Settings2, ShieldCheck, Wallet, Loader2,
  ChevronRight
} from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { fmtDate, fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Database } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import RecordPaymentDialog from "@/components/RecordPaymentDialog";

type Shop = Database["public"]["Tables"]["shops"]["Row"];
type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Order = Database["public"]["Tables"]["orders"]["Row"];

interface ShopProfileContentProps {
  id: string;
  onClose?: () => void;
}

import { 
  ResponsiveDialog 
} from "@/components/ui/responsive-ui";

const statusLabel: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  voided: "Voided",
  cancelled: "Cancelled"
};

const statusColor: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  confirmed: "bg-blue-50 text-blue-600",
  processing: "bg-indigo-50 text-indigo-600",
  shipped: "bg-purple-50 text-purple-600",
  delivered: "bg-emerald-50 text-emerald-600",
  voided: "bg-rose-50 text-rose-600",
  cancelled: "bg-slate-50 text-slate-600"
};

export function ShopProfileContent({ id, onClose }: ShopProfileContentProps) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Shop>>({});

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: s, error: se } = await supabase.from("shops").select("*").eq("id", id).single();
      if (se) throw se;
      setShop(s);
      setEditForm(s);

      const { data: i, error: ie } = await supabase
        .from("invoices")
        .select("*, order:orders(order_date, created_at)")
        .eq("shop_id", id)
        .eq("is_void", false)
        .order("created_at", { ascending: false });
      if (ie) throw ie;
      setInvoices(i || []);

      const { data: o, error: oe } = await supabase
        .from("orders")
        .select("*")
        .eq("shop_id", id)
        .order("created_at", { ascending: false });
      if (oe) throw oe;
      setOrders(o || []);
    } catch (error: unknown) {
      console.error('[Context]', error);
      toast.error(friendlyError(error));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveShop = async () => {
    if (!shop || !id) return;
    
    // Copy payload
    const payload = { ...editForm };
    
    let error: { code?: string; message?: string } | null = null;
    try {
      const res = await supabase.from("shops").update(payload).eq("id", id);
      if (res.error) {
        error = { code: res.error.code, message: res.error.message };
      }
    } catch (dbErr: unknown) {
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      error = { message: errMsg };
    }

    if (error && (error.code === "42703" || error.message?.includes("does not exist"))) {
      console.warn("Table shops is missing gstin/shop_type/discount_pct. Retrying with basic columns.");
      const basicPayload: Record<string, string | number | boolean | null> = {};
      const allowed_keys = ["name", "owner_name", "phone", "email", "address", "credit_limit", "is_active"];
      for (const key of allowed_keys) {
        if (key in payload) {
          basicPayload[key] = (payload as Record<string, string | number | boolean | null>)[key];
        }
      }
      const res = await supabase.from("shops").update(basicPayload).eq("id", id);
      if (res.error) {
        error = { code: res.error.code, message: res.error.message };
      } else {
        error = null;
      }
    }

    if (error) {
      console.error('[Context]', error);
      return toast.error(friendlyError(error));
    }
    toast.success("Identity profile updated");
    setEditOpen(false);
    loadData();
  };

  const outstanding = invoices
    .filter(i => !i.is_void && i.payment_status !== 'paid')
    .reduce((sum, i) => sum + (i.total - i.amount_paid), 0);

  if (loading && !shop) {
    return (
      <div className="flex items-center justify-center p-20 h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  if (!shop) return <div className="p-12 text-center text-muted-foreground uppercase text-[10px] font-black tracking-widest">Shop not found</div>;

  return (
    <div className="flex flex-col gap-8 h-full bg-slate-50/30 overflow-y-auto no-scrollbar pb-20">
      {/* Profile Header Card */}
      <div className="px-6 pt-6">
        <div className="rounded-[2.5rem] bg-[#0F172A] p-8 text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 h-40 w-40 bg-primary/10 rounded-full -mr-20 -mt-20 blur-3xl" />
            <div className="relative z-10">
               <div className="flex items-center justify-between mb-8">
                  <Badge className="bg-white/10 hover:bg-white/20 text-white border-none rounded-lg px-3 py-1 font-black text-[10px] uppercase tracking-widest">
                     {shop.shop_type}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-white/50 hover:bg-white/10" onClick={() => setEditOpen(true)}>
                      <Settings2 size={18} />
                  </Button>
               </div>

               <h2 className="text-4xl font-black tracking-tighter leading-[0.9] mb-3">{shop.name}</h2>
               <p className="text-white/40 font-bold uppercase tracking-widest text-[10px] mb-8">{shop.owner_name || "PROPRIETOR UNKNOWN"}</p>

               <div className="space-y-6 pt-6 border-t border-white/5">
                  <div className="grid grid-cols-1 gap-6">
                     <div className="space-y-1">
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Current Liability</p>
                        <p className={cn(
                          "text-3xl font-black tracking-tighter",
                          outstanding > shop.credit_limit ? "text-red-400" : "text-white"
                        )}>{fmtINR(outstanding)}</p>
                     </div>
                     <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className={cn("h-full transition-all duration-500", outstanding > (shop.credit_limit || 0) ? "bg-red-500" : "bg-primary")} 
                          style={{ width: `${Math.min((outstanding / (shop.credit_limit || 1)) * 100, 100)}%` }}
                        />
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">Limit</p>
                        <p className="text-sm font-black tracking-tight">{fmtINR(shop.credit_limit)}</p>
                     </div>
                     <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">Discount</p>
                        <p className="text-sm font-black tracking-tight">{shop.discount_pct}%</p>
                     </div>
                  </div>
               </div>
            </div>
        </div>
      </div>

      {/* Action Strip */}
      <div className="px-6 grid grid-cols-2 gap-3">
         <Button 
          className="h-12 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/10"
          onClick={() => navigate(`/orders/new?shopId=${id}`)}
         >
            <Plus className="mr-2 h-4 w-4" /> New Order
         </Button>
         <Button 
          variant="outline"
          className="h-12 rounded-2xl border border-slate-200 bg-white font-black uppercase tracking-widest text-[10px]"
          onClick={() => {
            setSelectedInvoice(null);
            setPayOpen(true);
          }}
         >
            <Wallet className="mr-2 h-4 w-4 text-slate-400" /> Settle
         </Button>
      </div>

      {/* Tabs Section */}
      <div className="px-6 flex-1">
        <Tabs defaultValue="invoices" className="w-full">
          <TabsList className="bg-slate-100 p-1 rounded-2xl w-full h-12">
            <TabsTrigger value="invoices" className="flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest">Billings</TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest">Orders</TabsTrigger>
            <TabsTrigger value="activity" className="flex-1 rounded-xl font-black text-[10px] uppercase tracking-widest">Details</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="mt-6 space-y-4">
             {invoices.length === 0 && <div className="py-20 text-center opacity-30 font-black uppercase text-[10px] tracking-widest">No Billings</div>}
             {invoices.map(inv => (
                <Card 
                  key={inv.id} 
                  className={cn(
                    "rounded-3xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-all cursor-pointer",
                    inv.is_void && "opacity-50"
                  )}
                  onClick={() => navigate(`/orders/${inv.order_id}`)}
                >
                   <div className="flex justify-between items-start mb-4">
                      <div>
                         <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                           Invoice · {(() => {
                             const orderData = inv.order as unknown as { order_date: string | null; created_at: string };
                             const date = orderData?.order_date || orderData?.created_at || inv.created_at;
                             const days = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
                             return days > 0 ? `${days}d old` : 'Today';
                           })()}
                         </p>
                         <h4 className="font-black text-sm">{inv.invoice_number}</h4>
                      </div>
                      <Badge className={cn(
                        "text-[9px] font-black uppercase tracking-widest h-5 px-2",
                        inv.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600 border-none' : 'bg-red-50 text-red-600 border-none'
                      )}>
                        {inv.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                      </Badge>
                   </div>
                   <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                         <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Pending</p>
                         <p className="text-xl font-black tracking-tighter text-slate-900">{fmtINR(inv.total - inv.amount_paid)}</p>
                      </div>
                      {!inv.is_void && inv.payment_status !== 'paid' && (
                        <Button 
                          size="sm" 
                          className="h-8 px-4 rounded-lg bg-primary/5 text-primary hover:bg-primary hover:text-white font-black text-[9px] uppercase tracking-widest"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedInvoice(inv);
                            setPayOpen(true);
                          }}
                        >
                          Settle
                        </Button>
                      )}
                   </div>
                </Card>
             ))}
          </TabsContent>

          <TabsContent value="orders" className="mt-6 space-y-4">
             {orders.length === 0 && <div className="py-20 text-center opacity-30 font-black uppercase text-[10px] tracking-widest">No Orders</div>}
             {orders.map(order => (
                <Card 
                  key={order.id} 
                  className={cn(
                    "rounded-3xl border border-slate-100 shadow-sm p-6 hover:shadow-md transition-all cursor-pointer",
                    order.is_void && "opacity-50"
                  )}
                  onClick={() => navigate(`/orders/${order.id}`)}
                >
                   <div className="flex justify-between items-center mb-2">
                      <div>
                         <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">#{order.order_number}</p>
                         <p className="text-[10px] font-bold text-slate-400">{fmtDate(order.created_at)}</p>
                      </div>
                      <Badge variant="outline" className={cn("text-[9px] font-black uppercase tracking-widest h-5 px-2 border-none", statusColor[order.status])}>
                        {statusLabel[order.status]}
                      </Badge>
                   </div>
                   <div className="flex items-center justify-between mt-4">
                      <div className="space-y-0.5">
                         <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Total Value</p>
                         <p className="text-xl font-black tracking-tighter text-slate-900">{fmtINR(order.total)}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300" />
                   </div>
                </Card>
             ))}
          </TabsContent>

          <TabsContent value="activity" className="mt-6 space-y-4">
             <Card className="rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
                <div className="space-y-4">
                   <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                         <Phone size={14} />
                      </div>
                      <span className="text-xs font-bold text-slate-600">{shop.phone || "N/A"}</span>
                   </div>
                   <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                         <MapPin size={14} />
                      </div>
                      <span className="text-xs font-bold text-slate-600 leading-relaxed">{shop.address || "N/A"}</span>
                   </div>
                   <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                         <Receipt size={14} />
                      </div>
                      <span className="text-xs font-bold text-slate-600 uppercase font-mono tracking-wider">{shop.gstin || "No GST Registration"}</span>
                   </div>
                </div>

                  <Button 
                    variant="outline" 
                    className="w-full h-11 rounded-xl border border-slate-200 font-bold text-xs uppercase tracking-widest gap-2"
                    onClick={() => setEditOpen(true)}
                  >
                    <Settings2 size={14} className="text-slate-400" />
                    Update Shop Information
                  </Button>
             </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ResponsiveDialog 
        open={editOpen} 
        onOpenChange={setEditOpen}
        title="Modify Outlet Identity"
        description="Update legal naming and proprietor ownership records."
      >
        <div className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Trade Name</Label>
                <Input 
                  className="h-12 rounded-xl bg-slate-50 border-none font-bold" 
                  value={editForm.name || ""} 
                  onChange={e => setEditForm({...editForm, name: e.target.value})} 
                />
             </div>
             <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Proprietor</Label>
                <Input 
                  className="h-12 rounded-xl bg-slate-50 border-none font-bold" 
                  value={editForm.owner_name || ""} 
                  onChange={e => setEditForm({...editForm, owner_name: e.target.value})} 
                />
             </div>
             <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Phone Contact</Label>
                <Input 
                  className="h-12 rounded-xl bg-slate-50 border-none font-bold" 
                  value={editForm.phone || ""} 
                  onChange={e => setEditForm({...editForm, phone: e.target.value})} 
                />
             </div>
             <div className="space-y-4 md:col-span-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Physical Address</Label>
                <Input 
                  className="h-12 rounded-xl bg-slate-50 border-none font-bold" 
                  value={editForm.address || ""} 
                  onChange={e => setEditForm({...editForm, address: e.target.value})} 
                />
             </div>
             {isAdmin && (
               <>
                 <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Credit Limit (₹)</Label>
                    <Input 
                      className="h-12 rounded-xl bg-slate-50 border-none font-bold" 
                      type="number"
                      value={editForm.credit_limit || 0} 
                      onChange={e => setEditForm({...editForm, credit_limit: Number(e.target.value) || 0})} 
                    />
                 </div>
                 <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Base Discount (%)</Label>
                    <Input 
                      className="h-12 rounded-xl bg-slate-50 border-none font-bold" 
                      type="number"
                      value={editForm.discount_pct || 0} 
                      onChange={e => setEditForm({...editForm, discount_pct: Number(e.target.value) || 0})} 
                    />
                 </div>
                 <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Price Tier</Label>
                    <Select 
                      value={editForm.shop_type || "silver"} 
                      onValueChange={(v) => setEditForm({ ...editForm, shop_type: v as Database["public"]["Enums"]["shop_type"] })}
                    >
                      <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="premium">Premium</SelectItem>
                        <SelectItem value="gold">Gold</SelectItem>
                        <SelectItem value="silver">Silver</SelectItem>
                        <SelectItem value="bronze">Bronze</SelectItem>
                        <SelectItem value="basic">Basic</SelectItem>
                      </SelectContent>
                    </Select>
                 </div>
               </>
             )}
          </div>
          
          <div className="flex gap-4 pt-4">
            <Button variant="outline" className="h-14 flex-1 rounded-[2rem] font-black uppercase tracking-widest text-[11px]" onClick={() => setEditOpen(false)}>Discard</Button>
            <Button className="h-14 flex-[2] rounded-[2rem] font-black uppercase tracking-widest text-[11px] bg-primary text-white shadow-xl shadow-primary/20" onClick={saveShop}>Sync Changes</Button>
          </div>
        </div>
      </ResponsiveDialog>
      
      {selectedInvoice && (
        <RecordPaymentDialog 
          open={payOpen} 
          onOpenChange={setPayOpen} 
          invoice={selectedInvoice} 
          onSaved={loadData} 
        />
      )}
      {!selectedInvoice && payOpen && (
        <RecordPaymentDialog 
           open={payOpen} 
           onOpenChange={setPayOpen} 
           paymentOnly={true}
           shopId={id!}
           onSaved={loadData} 
        />
      )}
    </div>
  );
}
