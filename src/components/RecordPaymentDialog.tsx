import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

import { ResponsiveDialog } from "@/components/ui/responsive-ui";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: { id: string; invoice_number?: string };
  shopId?: string;
  shopName?: string;
  onSaved: () => void;
}

export default function RecordPaymentDialog({ open, onOpenChange, invoice, shopId, shopName, onSaved }: RecordPaymentDialogProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(invoice?.id || "");
  const [invoices, setInvoices] = useState<{ id: string; invoice_number: string; total: number; amount_paid: number }[]>([]);

  const [allocationMode, setAllocationMode] = useState<"single" | "fifo" | "manual">("single");
  const [manualAllocations, setManualAllocations] = useState<Record<string, string>>({});

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setAmount("");
      setDiscount("");
      setReference("");
      setMethod("cash");
      setAllocationMode(invoice?.id ? "single" : "fifo");
      setManualAllocations({});
      setPaidAt(new Date().toISOString().slice(0, 10));
      if (invoice?.id) setSelectedInvoiceId(invoice.id);
    }
  }, [open, invoice]);

  // Effect to load shop invoices if shopId is provided
  useEffect(() => {
    if (open && shopId) {
      setInvoices([]);
      const fetchInvs = async () => {
        try {
          const { data: rawData, error } = await supabase.from("invoices")
            .select(`
              id, 
              invoice_number, 
              total, 
              amount_paid, 
              shop_id,
              payment_status,
              order:orders!invoices_order_id_fkey (shop_id)
            `)
            .neq("payment_status", "paid")
            .eq("is_void", false)
            .order("created_at", { ascending: true });

          let data = rawData;

          if (error) {
            if (error.code === "42703" || error.message?.includes("payment_status")) {
              console.warn("Falling back RecordPaymentDialog query to status column instead of payment_status");
              const res = await supabase.from("invoices")
                .select(`
                  id, 
                  invoice_number, 
                  total, 
                  amount_paid, 
                  shop_id,
                  status,
                  order:orders!invoices_order_id_fkey (shop_id)
                `)
                .neq("status", "paid")
                .eq("is_void", false)
                .order("created_at", { ascending: true });
              
              if (res.data) {
                data = res.data.filter(i => {
                  const status = i.status || "unpaid";
                  if (status === "paid") return false;
                  const total = Number(i.total || 0);
                  const paid = Number(i.amount_paid || 0);
                  if (paid >= total && total > 0) return false;
                  return true;
                });
              } else {
                throw res.error;
              }
            } else {
              throw error;
            }
          }

          if (data) {
            // Filter by shopId accurately
            const shopInvoices = data.filter(inv => 
              inv.shop_id === shopId || 
              (inv.order as { shop_id: string } | null)?.shop_id === shopId
            );
            setInvoices(shopInvoices);
            if (shopInvoices.length > 0) {
              setSelectedInvoiceId(prev => prev || invoice?.id || shopInvoices[0].id);
            }
          }
        } catch (e) {
          console.error("Failed to load shop invoices in RecordPaymentDialog", e);
        }
      };

      fetchInvs();
    }
  }, [open, shopId, invoice]);

  // Effect to handle auto-population of amount
  useEffect(() => {
    if (!open || invoices.length === 0) return;
    
    if (allocationMode === "single") {
      const targetId = invoice?.id || selectedInvoiceId || invoices[0].id;
      const target = invoices.find(i => i.id === targetId);
      if (target) {
        setAmount((target.total - target.amount_paid).toFixed(2));
      }
    } else if (allocationMode === "fifo") {
      const totalOut = invoices.reduce((sum, inv) => sum + (inv.total - inv.amount_paid), 0);
      setAmount(totalOut.toFixed(2));
    }
  }, [open, allocationMode, selectedInvoiceId, invoices, invoice?.id]);

  const handleManualAllocChange = (id: string, val: string) => {
    const newAlloc = { ...manualAllocations, [id]: val };
    setManualAllocations(newAlloc);
    
    // Sum up everything to update total amount
    const total = Object.values(newAlloc).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    setAmount(total > 0 ? total.toFixed(2) : "");
  };

  const save = async () => {
    const totalCollected = Number(amount) || 0;
    const totalDiscount = Number(discount) || 0;
    const totalReduction = totalCollected + totalDiscount;

    if (totalReduction <= 0) {
      console.error('[Context] Invalid amount for payment', { amount, discount });
      return toast.error("Enter valid amount or discount");
    }

    setBusy(true);
    try {
      const paymentPayloads = [];
      const now = new Date(paidAt).toISOString();

      if (allocationMode === "fifo" && invoices.length > 0) {
        // FIFO Allocation Logic
        let remainingDiscount = totalDiscount;
        let remainingCollected = totalCollected;
        
        // Track virtual outstanding balances to apply discounts then cash
        const virtualOutstanding = invoices.map(inv => ({
          id: inv.id,
          due: inv.total - inv.amount_paid
        }));

        // 1. Apply Discounts first
        if (remainingDiscount > 0) {
          for (const inv of virtualOutstanding) {
            if (remainingDiscount <= 0) break;
            if (inv.due <= 0) continue;

            const allocation = Math.min(remainingDiscount, inv.due);
            paymentPayloads.push({
              invoice_id: inv.id,
              amount: Number(allocation.toFixed(2)),
              payment_method: "cash" as Database["public"]["Enums"]["payment_method"],
              notes: `Discount: ${reference}`.trim() || "Discount Adjustment",
              paid_at: now
            });
            inv.due -= allocation;
            remainingDiscount -= allocation;
          }
        }

        // 2. Apply Collected Cash/Online
        if (remainingCollected > 0) {
          for (const inv of virtualOutstanding) {
            if (remainingCollected <= 0) break;
            if (inv.due <= 0) continue;

            const allocation = Math.min(remainingCollected, inv.due);
            paymentPayloads.push({
              invoice_id: inv.id,
              amount: Number(allocation.toFixed(2)),
              payment_method: method as Database["public"]["Enums"]["payment_method"],
              notes: `FIFO: ${reference}`.trim() || undefined,
              paid_at: now
            });
            inv.due -= allocation;
            remainingCollected -= allocation;
          }
        }

        if (paymentPayloads.length === 0) {
          throw new Error("No outstanding invoices found for allocation");
        }
      } else if (allocationMode === "manual") {
        // Manual allocation only supports the 'amount' field currently
        // to avoid complexity of manual discount split
        Object.entries(manualAllocations)
          .filter(([_, val]) => (parseFloat(val) || 0) > 0)
          .forEach(([invId, val]) => {
            paymentPayloads.push({
              invoice_id: invId,
              amount: parseFloat(val),
              payment_method: method as Database["public"]["Enums"]["payment_method"],
              notes: `Split: ${reference}`.trim() || undefined,
              paid_at: now
            });
          });

        if (totalDiscount > 0) {
          // If a global discount was also entered in manual mode, apply it to the first invoice with balance
          const target = invoices.find(i => (i.total - i.amount_paid) > 0);
          if (target) {
            paymentPayloads.push({
              invoice_id: target.id,
              amount: totalDiscount,
              payment_method: "cash" as Database["public"]["Enums"]["payment_method"],
              notes: `Discount: ${reference}`.trim() || "Discount Adjustment",
              paid_at: now
            });
          }
        }

        if (paymentPayloads.length === 0) {
          throw new Error("No allocations entered");
        }
      } else {
        // Single invoice payment
        const targetInvoiceId = invoice?.id || selectedInvoiceId;
        if (!targetInvoiceId) throw new Error("Select an invoice to pay");

        const selectedInv = invoices.find(i => i.id === targetInvoiceId) || (invoice?.id === targetInvoiceId ? invoice : null);
        if (selectedInv && 'total' in selectedInv) {
          const outstanding = (selectedInv as { total: number; amount_paid: number }).total - (selectedInv as { total: number; amount_paid: number }).amount_paid;
          if (totalReduction > outstanding + 0.01) {
             toast.error(`Total exceeds outstanding balance of ${fmtINR(outstanding)}`);
             setBusy(false);
             return;
          }
        }

        if (totalCollected > 0) {
          paymentPayloads.push({
            invoice_id: targetInvoiceId,
            amount: totalCollected,
            payment_method: method as Database["public"]["Enums"]["payment_method"],
            notes: reference || null,
            paid_at: now
          });
        }

        if (totalDiscount > 0) {
          paymentPayloads.push({
            invoice_id: targetInvoiceId,
            amount: totalDiscount,
            payment_method: "cash" as Database["public"]["Enums"]["payment_method"],
            notes: `Discount: ${reference}`.trim() || "Adjustment",
            paid_at: now
          });
        }
      }

      const { error } = await supabase.from("payments").insert(paymentPayloads);
      if (error) throw error;

      // Manually sync amount_paid, payment_status, and status on corresponding invoices
      // in case database triggers are not present or didn't fire.
      const uniqueInvoiceIds = Array.from(new Set(paymentPayloads.map(p => p.invoice_id)));
      for (const invId of uniqueInvoiceIds) {
        try {
          // Fetch all payments for this invoice
          const { data: allPays } = await supabase
            .from("payments")
            .select("amount")
            .eq("invoice_id", invId)
            .eq("is_void", false);

          const totalPaid = (allPays || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

          // Fetch invoice total
          const { data: inv } = await supabase
            .from("invoices")
            .select("total")
            .eq("id", invId)
            .maybeSingle();

          if (inv) {
            const invTotal = Number(inv.total || 0);
            const computedPaymentStatus = totalPaid >= invTotal ? "paid" : (totalPaid > 0 ? "partial" : "unpaid");
            const computedStatus = totalPaid >= invTotal ? "paid" : (totalPaid > 0 ? "partial" : "pending");

            await supabase
              .from("invoices")
              .update({
                amount_paid: totalPaid,
                payment_status: computedPaymentStatus,
                status: computedStatus
              } as unknown as Record<string, unknown>)
              .eq("id", invId);
          }
        } catch (syncErr) {
          console.error("Failed to client-sync invoice:", invId, syncErr);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });

      toast.success("Payment recorded");
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      console.error('[Context]', err);
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };
  const title = "Record Payment";
  const description = shopName 
    ? `Collection from ${shopName}` 
    : (invoice?.invoice_number ? `Invoice SEC-${invoice.invoice_number.slice(-4)}` : "Payment collection");

  return (
    <ResponsiveDialog 
      open={open} 
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="p-0 border-0 shadow-2xl"
    >
      <div className="flex-1 overflow-y-auto p-8 space-y-6 max-h-[75vh] md:max-h-[85vh] scrollbar-thin">
        {!invoice && invoices.length > 0 && (
          <div className="space-y-4">
            <div className="flex bg-slate-100 p-1 rounded-2xl gap-1">
              <button 
                onClick={() => setAllocationMode("single")}
                className={cn("flex-1 py-2 text-[10px] font-black uppercase rounded-xl transition-all", allocationMode === "single" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
              >
                Single
              </button>
              <button 
                onClick={() => setAllocationMode("fifo")}
                className={cn("flex-1 py-2 text-[10px] font-black uppercase rounded-xl transition-all", allocationMode === "fifo" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
              >
                FIFO (Auto)
              </button>
              <button 
                onClick={() => setAllocationMode("manual")}
                className={cn("flex-1 py-2 text-[10px] font-black uppercase rounded-xl transition-all", allocationMode === "manual" ? "bg-white shadow-sm text-slate-900" : "text-slate-500")}
              >
                Manual Split
              </button>
            </div>
            
            {allocationMode === "single" && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Invoice</Label>
                <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                  <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-black">
                    <SelectValue placeholder="Select Invoice" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {invoices.map(inv => (
                      <SelectItem key={inv.id} value={inv.id} className="font-bold py-3">
                        INV-{inv.invoice_number.slice(-4)} — Due: {fmtINR(inv.total - inv.amount_paid)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {allocationMode === "manual" && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Invoice Distributions</Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                  {invoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase text-slate-900 truncate">INV-{inv.invoice_number.slice(-4)}</p>
                        <p className="text-[9px] font-bold text-slate-400">Due: {fmtINR(inv.total - inv.amount_paid)}</p>
                      </div>
                      <Input 
                        type="number"
                        placeholder="0.00"
                        className="w-24 h-9 bg-white font-black text-right rounded-lg text-xs"
                        value={manualAllocations[inv.id] || ""}
                        onChange={(e) => handleManualAllocChange(inv.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Amount Collected (₹)</Label>
            <Input 
              type="number" 
              inputMode="decimal"
              className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-black text-2xl focus:ring-slate-900 transition-all px-6" 
              value={amount} 
              onChange={e=>setAmount(e.target.value)} 
              placeholder="0.00" 
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-amber-600">Discount Adjustment (₹)</Label>
            <Input 
              type="number" 
              inputMode="decimal"
              className="h-14 rounded-2xl bg-amber-50/50 border-amber-100 font-black text-2xl focus:ring-amber-500 transition-all px-6 text-amber-700 placeholder:text-amber-200" 
              value={discount} 
              onChange={e=>setDiscount(e.target.value)} 
              placeholder="0.00" 
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Payment Instrument</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-black px-6">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="cash" className="py-3 font-bold">Physical Cash</SelectItem>
                <SelectItem value="upi" className="py-3 font-bold">UPI / Digital</SelectItem>
                <SelectItem value="cheque" className="py-3 font-bold">Post-dated Cheque</SelectItem>
                <SelectItem value="bank_transfer" className="py-3 font-bold">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Collected On</Label>
            <Input 
              type="date" 
              className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-bold px-6" 
              value={paidAt} 
              onChange={e=>setPaidAt(e.target.value)} 
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Reference / Notes</Label>
          <Input 
            value={reference} 
            onChange={e=>setReference(e.target.value)} 
            placeholder="Transaction ID / Remark" 
            className="h-14 rounded-2xl bg-slate-50 border-slate-200 font-medium px-6"
          />
        </div>

        <div className="pt-4 flex gap-4 md:flex-row flex-col-reverse">
          <Button 
            variant="ghost" 
            className="rounded-2xl h-14 px-8 font-black text-[10px] uppercase tracking-widest text-slate-500" 
            onClick={()=>onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            disabled={busy} 
            className="rounded-2xl h-14 px-10 bg-slate-900 border-2 border-slate-900 hover:bg-brand-primary hover:border-brand-primary transition-all shadow-xl shadow-slate-900/10 font-black text-[10px] uppercase tracking-widest flex-1"
            onClick={save}
          >
            {busy ? "Processing..." : "Record payment"}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
