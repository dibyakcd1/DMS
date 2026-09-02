import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_NAME, COMPANY_TAGLINE } from "@/lib/config";
import { useAuth } from "@/context/AuthContextCore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, X, Truck, PackageCheck, FileText, Share2, Loader2, Wallet, Trash2, Store, MapPin, Zap, ClipboardList, IndianRupee as IndianRupeeIcon, Calendar, User, Receipt, Printer, Plus, MoreVertical, AlertTriangle, ChevronRight, ChevronDown, Pencil, RefreshCw, Building2, Layers, Tag, Info, Percent } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtDate, fmtDateTime, fmtINR, statusColor, statusLabel } from "@/lib/format";
import { resolveDisplayUnit } from "@/lib/unitLabel";
import { friendlyError } from "@/lib/errors";
import { toast } from "sonner";
import { shareOrDownloadInvoice } from "@/lib/invoice-pdf";
import { cn } from "@/lib/utils";
import { usePrinter } from "@/printer/PrinterContextCore";
import { ReceiptBuilder } from "@/printer/ReceiptBuilder";
import { ThermalReceiptBuilder } from "@/printer/ThermalReceiptBuilder";
import { InvoiceData as ThermalInvoiceData } from "@/printer/InvoiceData.types";
import { ReceiptPreviewModal } from "@/components/ReceiptPreviewModal";
import { InvoicePreviewModal } from "@/components/invoice/InvoicePreviewModal";
import { InvoicePDFPreviewModal } from "@/components/invoice/PDFPreviewModal";
import { useOrders } from "@/hooks/useOrders";
import { useQueryClient } from "@tanstack/react-query";
import { convertToBaseUnits } from "@/lib/packaging";
import { groupOrderItemsByCompany, resolveCompanyInfo, resolveEffectiveGstRate } from "@/lib/company-helpers";

import { ResponsiveContainer, AdaptiveTable, ResponsiveDialog } from "@/components/ui/responsive-ui";
import { useIsMobile } from "@/lib/responsive";
import { PageHeader } from "@/components/PageHeader";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import RecordPaymentDialog from "@/components/RecordPaymentDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Database } from "@/integrations/supabase/types";
import { Product } from "@/types";

type Order = Database["public"]["Tables"]["orders"]["Row"] & {
  shop: Database["public"]["Tables"]["shops"]["Row"];
  salesperson: { full_name: string | null; phone: string | null } | null;
};

type OrderItem = Database["public"]["Tables"]["order_items"]["Row"] & {
  product: Partial<Product> & { 
    name: string; 
    sku: string; 
    company_id?: string | null;
    brand?: string | null;
    company_name?: string | null;
    company_short_code?: string | null;
    company_accent_hex?: string | null;
  };
  batch?: { batch_number: string } | null;
};

type Invoice = Database["public"]["Tables"]["invoices"]["Row"] & { is_void?: boolean };
type Payment = Database["public"]["Tables"]["payments"]["Row"];

export default function OrderDetail() {
  const { id: rawId } = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const id = rawId && rawId !== "null" ? rawId : undefined;
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { state: printerState, printReceipt, print } = usePrinter();
  const navigate = useNavigate();
  const [order, setOrder] = React.useState<Order | null>(null);
  const [items, setItems] = React.useState<OrderItem[]>([]);
  const [invoice, setInvoice] = React.useState<Invoice | null>(null);
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [deliveryNote, setDeliveryNote] = React.useState("");
  const [driverName, setDriverName] = React.useState("");
  const [vehicleNumber, setVehicleNumber] = React.useState("");
  const [ewayBillNo, setEwayBillNo] = React.useState("");
  const [billOpen, setBillOpen] = React.useState(false);
  const [billType, setBillType] = React.useState<"gst" | "cash">("gst");
  const [payOpen, setPayOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = React.useState(false);
  const [invoiceOpen, setInvoiceOpen] = React.useState(true);
  const [paymentsOpen, setPaymentsOpen] = React.useState(true);
  const [receiptData, setReceiptData] = React.useState<{ bytes: Uint8Array; lines: unknown[]; thermalData?: ThermalInvoiceData } | null>(null);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [confirmDispatch, setConfirmDispatch] = React.useState(false);
  const [confirmDeliver, setConfirmDeliver] = React.useState(false);
  const [confirmRevertEdit, setConfirmRevertEdit] = React.useState(false);
  const [dateVal, setDateVal] = React.useState(new Date().toISOString().slice(0, 16));
  const [paymentToDelete, setPaymentToDelete] = React.useState<string | null>(null);
  const [orderToDelete, setOrderToDelete] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const [stock, setStock] = React.useState<Record<string, number>>({});
  const [profitability, setProfitability] = React.useState<{
    totalCost: number;
    profit: number;
    marginPercent: number;
    isProjected: boolean;
  } | null>(null);
  const [allProducts, setAllProducts] = React.useState<Product[]>([]);
  const [itemViewMode, setItemViewMode] = React.useState<"grouped" | "flat">("grouped");
  const [expandedGstSlabs, setExpandedGstSlabs] = React.useState<Record<number, boolean>>({});

  const toggleGstSlabExpand = (rate: number) => {
    setExpandedGstSlabs(prev => ({ ...prev, [rate]: !prev[rate] }));
  };

  const computedSubtotal = React.useMemo(() => {
    if (items && items.length > 0) {
      return items.reduce((acc, item) => acc + (Number(item.unit_price || 0) * Number(item.quantity || 0)), 0);
    }
    return Number(order?.subtotal || 0);
  }, [items, order?.subtotal]);

  const computedGst = React.useMemo(() => {
    if (items && items.length > 0) {
      const itemsTax = items.reduce((acc, item) => {
        const price = Number(item.unit_price || 0);
        const qty = Number(item.quantity || 0);
        const pRec = item.product as Record<string, unknown> | null;
        const iRec = item as Record<string, unknown>;
        const rate = resolveEffectiveGstRate({
          gst_rate: item.gst_rate,
          cgst_rate: (iRec.cgst_rate as number | undefined) ?? (pRec?.cgst_rate as number | undefined),
          sgst_rate: (iRec.sgst_rate as number | undefined) ?? (pRec?.sgst_rate as number | undefined),
          igst_rate: (iRec.igst_rate as number | undefined) ?? (pRec?.igst_rate as number | undefined),
          hsn: pRec?.hsn as string | undefined,
          sku: pRec?.sku as string | undefined,
          name: pRec?.name as string | undefined,
          product: item.product
        });
        return acc + (price * qty * (rate / 100));
      }, 0);
      return Math.round(itemsTax * 100) / 100;
    }
    return Number(order?.gst_total || 0);
  }, [items, order?.gst_total]);

  const computedDiscount = React.useMemo(() => {
    return Number(order?.discount_amount || 0);
  }, [order?.discount_amount]);

  const computedTotal = React.useMemo(() => {
    const grandTotal = Math.max(0, computedSubtotal + computedGst - computedDiscount);
    return Math.round(grandTotal * 100) / 100;
  }, [computedSubtotal, computedGst, computedDiscount]);

  const invoicePDFData = React.useMemo(() => {
    if (!invoice || !order) return null;
    const isTaxInvoice = invoice.type === "gst";
    const invoiceTax = isTaxInvoice ? (Number(invoice.tax_amount) > 0 ? Number(invoice.tax_amount) : computedGst) : 0;
    const invoiceSubtotal = Number(invoice.sub_total) > 0 ? Number(invoice.sub_total) : computedSubtotal;
    const invoiceDiscount = Number(invoice.discount_amount || 0);
    const invoiceTotal = isTaxInvoice ? (invoiceSubtotal + invoiceTax - invoiceDiscount) : (invoiceSubtotal - invoiceDiscount);

    return {
      invoice: {
        ...invoice,
        sub_total: invoiceSubtotal,
        tax_amount: invoiceTax,
        discount_amount: invoiceDiscount,
        total: invoiceTotal
      },
      order: { 
        order_number: order.order_number,
        order_date: order.order_date,
        delivered_at: order.delivered_at,
        created_at: order.created_at
      },
      shop: order.shop,
      items: items.map(i => {
        const comp = resolveCompanyInfo({
          company_id: i.product?.company_id,
          company_name: i.product?.company_name,
          brand: i.product?.brand,
          sku: i.product?.sku,
          name: i.product?.name
        });
        const effGstRate = resolveEffectiveGstRate({
          gst_rate: i.gst_rate,
          cgst_rate: (i as Record<string, unknown>).cgst_rate as number | undefined ?? i.product?.cgst_rate,
          sgst_rate: (i as Record<string, unknown>).sgst_rate as number | undefined ?? i.product?.sgst_rate,
          igst_rate: (i as Record<string, unknown>).igst_rate as number | undefined ?? i.product?.igst_rate,
          hsn: i.product?.hsn,
          sku: i.product?.sku,
          name: i.product?.name,
          product: i.product
        });
        return { 
          name: i.product?.name || "Unknown Product", 
          sku: i.product?.sku || "N/A", 
          unit: resolveDisplayUnit(i.pack_type, i.product), 
          quantity: Number(i.quantity), 
          unit_price: Number(i.unit_price), 
          gst_rate: effGstRate, 
          line_total: Number(i.line_total),
          company_name: comp.name,
          company_short_code: comp.short_code,
          brand: i.product?.brand || comp.name
        };
      }),
    };
  }, [invoice, order, items, computedGst, computedSubtotal]);
  
  const companyAuditBreakdown = React.useMemo(() => {
    return groupOrderItemsByCompany(items);
  }, [items]);

  const gstDetailedBreakdown = React.useMemo(() => {
    const map = new Map<number, {
      rate: number;
      cgstRate: number;
      sgstRate: number;
      taxableSubtotal: number;
      cgstAmount: number;
      sgstAmount: number;
      totalTax: number;
      items: {
        id: string;
        name: string;
        sku?: string;
        hsn?: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        taxableAmount: number;
        taxAmount: number;
        company: {
          id: string;
          name: string;
          short_code: string;
          accent_hex: string;
        };
      }[];
    }>();

    items.forEach((item) => {
      const pRec = item.product as Record<string, unknown> | null;
      const iRec = item as Record<string, unknown>;
      const effRate = resolveEffectiveGstRate({
        gst_rate: item.gst_rate,
        cgst_rate: (iRec.cgst_rate as number | undefined) ?? (pRec?.cgst_rate as number | undefined),
        sgst_rate: (iRec.sgst_rate as number | undefined) ?? (pRec?.sgst_rate as number | undefined),
        igst_rate: (iRec.igst_rate as number | undefined) ?? (pRec?.igst_rate as number | undefined),
        hsn: pRec?.hsn as string | undefined,
        sku: pRec?.sku as string | undefined,
        name: pRec?.name as string | undefined,
        product: item.product
      });

      if (!map.has(effRate)) {
        map.set(effRate, {
          rate: effRate,
          cgstRate: Math.round((effRate / 2) * 100) / 100,
          sgstRate: Math.round((effRate / 2) * 100) / 100,
          taxableSubtotal: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          totalTax: 0,
          items: []
        });
      }

      const entry = map.get(effRate)!;
      const price = Number(item.unit_price || 0);
      const qty = Number(item.quantity || 0);
      const lineTaxable = price * qty;
      const lineTax = lineTaxable * (effRate / 100);
      const comp = resolveCompanyInfo(item.product);

      entry.taxableSubtotal += lineTaxable;
      entry.totalTax += lineTax;
      entry.cgstAmount += lineTax / 2;
      entry.sgstAmount += lineTax / 2;

      entry.items.push({
        id: item.id,
        name: item.product?.name || "Unknown Product",
        sku: item.product?.sku,
        hsn: item.product?.hsn,
        quantity: qty,
        unit: resolveDisplayUnit(item.pack_type, item.product),
        unitPrice: price,
        taxableAmount: lineTaxable,
        taxAmount: lineTax,
        company: comp
      });
    });

    return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
  }, [items]);

  const dynamicSubtitle = React.useMemo(() => {
    if (!order) return "";
    switch (order.status) {
      case 'pending_approval': return "Awaiting approval";
      case 'approved': return invoice ? "Ready to dispatch" : "Pending invoice generation";
      case 'dispatched': return "Out for delivery";
      case 'delivered': return `Delivered · ${fmtINR(computedTotal)} settled`;
      case 'cancelled': return "Order terminated";
      case 'rejected': return "Approval denied";
      default: return "Review order details and items";
    }
  }, [order, invoice, computedTotal]);

  React.useEffect(() => {
    if (isAdmin) {
      supabase.from("products").select("*").eq("is_active", true).then(({ data }) => {
        setAllProducts((data as Product[]) || []);
      });
    }
  }, [isAdmin]);

  const load = React.useCallback(async () => {
    if (!id) {
      setNotFound(true);
      return;
    }
    try {
      const { data: orderRaw, error: orderErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id).maybeSingle();
      
      if (orderErr || !orderRaw) {
        if (orderErr) console.error("OrderDetail load error:", orderErr);
        setNotFound(true);
        return;
      }

      // Manual join for shop and salesperson
      const [shopRes, profRes] = await Promise.all([
        supabase.from("shops").select("*").eq("id", orderRaw.shop_id).maybeSingle(),
        orderRaw.salesperson_id 
          ? supabase.from("profiles").select("full_name, phone").eq("id", orderRaw.salesperson_id).maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ]);

      const orderData = {
        ...orderRaw,
        shop: shopRes.data || { name: "Unknown Shop", id: orderRaw.shop_id, shop_type: "basic" },
        salesperson: profRes.data || { full_name: "Unknown Salesperson", phone: null }
      } as Order;

      setOrder(orderData);
      setDeliveryNote(orderData.delivery_note ?? "");
      setBillType("gst");
      
      const { data: itemsRaw, error: itErr } = await supabase
        .from("order_items")
        .select("*, product:products(*), batch:inventory_batches(batch_number)")
        .eq("order_id", id);
      
      if (itErr) {
        console.error("[Context] OrderDetail items load error:", itErr);
        toast.error(friendlyError(itErr));
      }

      const rawItems = itemsRaw ?? [];
      const items = rawItems.map(it => {
        const prod = (Array.isArray(it.product) ? it.product[0] : it.product) as Product | null;
        const b = Array.isArray(it.batch) ? it.batch[0] : it.batch;
        const comp = resolveCompanyInfo(prod || {});
        return {
          ...it,
          product: {
            ...prod,
            name: prod?.name || "Unknown",
            sku: prod?.sku || "N/A",
            company_id: prod?.company_id || comp.id,
            brand: prod?.brand || comp.name,
            company_name: comp.name,
            company_short_code: comp.short_code,
            company_accent_hex: comp.accent_hex
          },
          batch: b as unknown as { batch_number: string } | null
        };
      }) as unknown as OrderItem[];

      console.log("OrderDetail items loaded:", items);
      setItems(items);

      // Load stock for each product
      if (items.length > 0) {
        const productIds = Array.from(new Set(items.map(i => i.product_id)));
        const { data: inv } = await supabase.from("inventory").select("product_id, stock_base_units").in("product_id", productIds);
        const stockMap: Record<string, number> = {};
        inv?.forEach(s => {
          stockMap[s.product_id!] = (stockMap[s.product_id!] || 0) + Number(s.stock_base_units);
        });
        setStock(stockMap);
      }
      
      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("order_id", id!)
        .maybeSingle();
      
      setInvoice(inv);
      if (inv) {
        setBillType(inv.type === "cash" ? "cash" : "gst");
        let finalPays: Payment[] = [];
        try {
          const { data: pays, error: payErr } = await supabase.from("payments").select("*").eq("invoice_id", inv.id).order("paid_at", { ascending: false });
          if (payErr) {
            if (payErr.code === "42703" || payErr.message?.includes("paid_at")) {
              throw payErr;
            }
            finalPays = (pays as Payment[]) ?? [];
          } else {
            finalPays = (pays as Payment[]) ?? [];
          }
        } catch (err) {
          console.warn("Falling back OrderDetail payments query to order by created_at instead of paid_at", err);
          const { data: pays } = await supabase.from("payments").select("*").eq("invoice_id", inv.id).order("created_at", { ascending: false });
          finalPays = ((pays ?? []) as unknown as Payment[]).map(p => {
            const raw = p as unknown as Record<string, unknown>;
            return {
              ...p,
              paid_at: String(raw.paid_at || raw.created_at || new Date().toISOString())
            };
          });
        }
        setPayments(finalPays);
      } else {
        setPayments([]);
      }

      // Profitability analysis
      if (isAdmin) {
        if (["dispatched", "delivered"].includes(orderRaw.status)) {
          // Use actual batch costs from deductions
          const { data: deductions } = await supabase
            .from("v_order_batch_costs")
            .select("*")
            .eq("order_id", id!);
          
          if (deductions && deductions.length > 0) {
            const totalCost = deductions.reduce((sum: number, d: { item_total_cost: number }) => sum + Number(d.item_total_cost), 0);
            const totalRev = items.reduce((sum: number, i: OrderItem) => sum + Number(i.total_price), 0);
            setProfitability({
              totalCost,
              profit: totalRev - totalCost,
              marginPercent: totalRev > 0 ? ((totalRev - totalCost) / totalRev) * 100 : 0,
              isProjected: false
            });
          }
        } else {
          // Use projected costs from current product averages
          const productIds = Array.from(new Set(items.map(i => i.product_id)));
          const { data: stockData } = await supabase
            .from("v_product_stock")
            .select("id, avg_landed_cost")
            .in("id", productIds);
          
          if (stockData) {
            const costMap = new Map(stockData.map(s => [s.id, Number(s.avg_landed_cost)]));
            const totalCost = items.reduce((sum: number, item: OrderItem) => {
              // Note: item.quantity is in sell units, but avg_landed_cost is per base unit
              // We need to convert quantity to base units if needed, but let's assume item has it
              // Actually, v_product_stock.avg_landed_cost is per base unit.
              // order_items likely has base units if it was added via the modern catalog.
              const itemBaseUnits = Number((item as unknown as { qty_base_units?: number }).qty_base_units || item.quantity); 
              return sum + (itemBaseUnits * (costMap.get(item.product_id) || 0));
            }, 0);
            const totalRev = items.reduce((sum: number, i: OrderItem) => sum + Number(i.total_price), 0);
            setProfitability({
              totalCost,
              profit: totalRev - totalCost,
              marginPercent: totalRev > 0 ? ((totalRev - totalCost) / totalRev) * 100 : 0,
              isProjected: true
            });
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[Context] OrderDetail total load error:", error);
      toast.error("Error loading some order details. " + error.message);
    }
  }, [id, isAdmin]);

  const deletePayment = async () => {
    if (!paymentToDelete) return;
    setBusy(true);
    try {
      // Find target invoice ID before deleting the payment
      const paymentObj = payments.find(p => p.id === paymentToDelete);
      const targetInvoiceId = paymentObj?.invoice_id || invoice?.id;

      const { error } = await supabase.from("payments").delete().eq("id", paymentToDelete);
      if (error) throw error;

      if (targetInvoiceId) {
        try {
          // Fetch remaining payments for this invoice
          const { data: remainingPays } = await supabase
            .from("payments")
            .select("amount")
            .eq("invoice_id", targetInvoiceId)
            .eq("is_void", false);

          const totalPaid = (remainingPays || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

          // Get the invoice total
          const { data: invData } = await supabase
            .from("invoices")
            .select("total")
            .eq("id", targetInvoiceId)
            .maybeSingle();

          if (invData) {
            const invTotal = Number(invData.total || 0);
            const computedPaymentStatus = totalPaid >= invTotal ? "paid" : (totalPaid > 0 ? "partial" : "unpaid");
            const computedStatus = totalPaid >= invTotal ? "paid" : (totalPaid > 0 ? "partial" : "pending");

            await supabase
              .from("invoices")
              .update({
                amount_paid: totalPaid,
                payment_status: computedPaymentStatus,
                status: computedStatus
              } as unknown as Record<string, unknown>)
              .eq("id", targetInvoiceId);
          }
        } catch (syncErr) {
          console.error("Failed to client-sync invoice after delete:", targetInvoiceId, syncErr);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["collections"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Payment removed");
      setPaymentToDelete(null);
      load();
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[Context] Delete payment error:", error);
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  React.useEffect(() => { if (id) load(); }, [id, load]);

  const updateStatus = React.useCallback(async (status: Database["public"]["Enums"]["order_status"], extra: Database["public"]["Tables"]["orders"]["Update"] = {}) => {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.from("orders").update({ status, ...extra }).eq("id", id);
    setBusy(false);
    if (error) {
      console.error('[Context] Update status failed', error);
      return toast.error(friendlyError(error));
    }
    toast.success(`Order ${statusLabel[status] ?? status}`);
    load();
  }, [id, load]);

  const can = React.useMemo(() => {
    if (!order) return { submit: false, approve: false, reject: false, bill: false, dispatch: false, deliver: false, cancel: false, revert: false, edit: false };
    const isOwn = order.salesperson_id === user?.id;
    return {
      submit: (isAdmin || isOwn) && order.status === "draft",
      approve: isAdmin && order.status === "pending_approval",
      reject: isAdmin && order.status === "pending_approval",
      bill: (isAdmin || isOwn) && ["approved", "dispatched", "delivered"].includes(order.status) && (!invoice || invoice.is_void || Math.abs(Number(invoice.total) - Number(order.total)) > 0.01),
      dispatch: (isAdmin || isOwn) && order.status === "approved" && !!invoice && !invoice.is_void,
      deliver: (isAdmin || isOwn) && order.status === "dispatched",
      cancel: false,
      revert: (isAdmin || isOwn) && ["dispatched", "delivered"].includes(order.status),
      edit: ["draft", "pending_approval", "approved", "dispatched", "delivered"].includes(order.status) && (isAdmin || isOwn)
    };
  }, [order, isAdmin, user?.id, invoice]);

  const nextAction = React.useMemo(() => {
    if (can.submit) return { label: "Submit For Approval", action: () => updateStatus("pending_approval"), icon: <Check size={18} />, color: "bg-slate-900" };
    if (can.approve) return { label: "Approve Order", action: () => setConfirmApprove(true), icon: <Check size={18} />, color: "bg-emerald-600" };
    if (can.bill) {
      const isMismatch = invoice && !invoice.is_void && Math.abs(Number(invoice.total) - Number(order?.total)) > 0.01;
      return { 
        label: isMismatch ? "Regenerate Bill / Correct Totals" : "Generate Bill", 
        action: () => setBillOpen(true), 
        icon: <FileText size={18} />, 
        color: "bg-indigo-600" 
      };
    }
    // Dispatch and Deliver are now handled by icons at the top
    return null;
  }, [can, updateStatus, invoice, order?.total]);

  if (notFound) return (
    <div className="flex flex-col items-center gap-4 pt-10 text-muted-foreground">
      <PackageCheck className="h-12 w-12 opacity-20" />
      <p>Order not found</p>
      <Button variant="outline" onClick={() => navigate("/orders")}>Back to Orders</Button>
    </div>
  );

  if (!order) return <div className="flex justify-center pt-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const steps = [
    { id: "draft", label: "Ordered" },
    { id: "pending_approval", label: "Approved" },
    { id: "approved", label: "Invoiced" },
    { id: "dispatched", label: "Dispatched" },
    { id: "delivered", label: "Delivered" },
  ];

  const deleteOrder = async () => {
    if (!order || busy) return;
    
    // Safety check for inventory
    if (["dispatched", "delivered"].includes(order.status)) {
      setOrderToDelete(false);
      return toast.error("Cannot delete a dispatched or delivered order directly as stock has been deducted. Please 'Cancel' or 'Rollback status' first to restore inventory.");
    }

    setBusy(true);
    try {
      // With ON DELETE CASCADE set up in the migration, deleting the order 
      // will automatically clean up order_items, invoices, and payments.
      const { error } = await supabase.from("orders").delete().eq("id", id!);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order and all related records deleted");
      navigate("/orders");
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[Context] Delete error:", error);
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
      setOrderToDelete(false);
    }
  };

  const dispatchOrder = async () => {
    if (!order || busy) return;
    if (!invoice) {
      console.error('[Context] Missing invoice for dispatch');
      return toast.error("Please generate the bill/invoice before dispatching.");
    }
    setBusy(true);
    
    try {
      // G3: Fresh stock check before dispatch RPC
      const productIds = Array.from(new Set(items.map(i => i.product_id)));
      const [{ data: inv }, { data: products }] = await Promise.all([
        supabase.from("inventory").select("product_id, stock_base_units").in("product_id", productIds),
        supabase.from("products").select("id, name, unit_type, display_weight_unit, pack_size_unit, pack_size_value, weight_per_unit_grams, units_per_packet, packets_per_case, units_per_case").in("id", productIds)
      ]);

      const currentStock: Record<string, number> = {};
      inv?.forEach(s => {
        currentStock[s.product_id!] = (currentStock[s.product_id!] || 0) + Number(s.stock_base_units);
      });
      const prodMap = new Map(products?.map(p => [p.id, p]));

      // Check each item
      for (const item of items) {
         const p = prodMap.get(item.product_id);
         if (!p) continue;

         const needed = convertToBaseUnits(item.quantity, item.pack_type, p as unknown as Product);
         const available = currentStock[item.product_id] || 0;

         if (needed > available) {
           setBusy(false);
           console.error('[Context] Insufficient stock during dispatch', { product: item.product.name, needed, available });
           return toast.error(`Insufficient stock for ${item.product.name}. Needed: ${needed}, Available: ${available}. Please re-check inventory.`);
         }
      }

      const { error } = await supabase.rpc('invoice_deduction', { 
        p_order_id: id!,
        p_performed_by: user?.id
      });
      
      if (error) throw error;

      const dispatchLog = `[DISPATCH] Vehicle: ${vehicleNumber} | Driver: ${driverName}${ewayBillNo ? ` | E-Way: ${ewayBillNo}` : ''} | Date: ${new Date(dateVal).toLocaleDateString()}`;
      const newNotes = order.notes ? `${order.notes}\n${dispatchLog}` : dispatchLog;

      // Update order status separately after atomic deduction
      await supabase.from("orders").update({
        status: 'dispatched',
        dispatched_at: new Date(dateVal).toISOString(),
        notes: newNotes
      }).eq("id", id!);
      
      toast.success("Order dispatched and stock deducted");
      setConfirmDispatch(false);
      load();
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[Context] Dispatch error:", error);
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const deliverOrder = async () => {
    if (!order || busy) return;
    setBusy(true);
    
    try {
      const { data, error } = await supabase.rpc('deliver_order', { 
        p_order_id: id!,
        p_delivered_by: user?.id || order.salesperson_id || '00000000-0000-0000-0000-000000000000'
      });
      
      if (error) throw error;
      const result = data as unknown as { success: boolean, error?: string } | boolean;
      const isSuccess = typeof result === 'boolean' ? result : (result?.success ?? false);
      if (!isSuccess) {
        const errMsg = typeof result === 'object' && result?.error ? result.error : "Delivery failed";
        throw new Error(errMsg);
      }
      
      // Update custom delivery date and notes
      const updatedNotes = deliveryNote 
        ? (order.notes ? `${order.notes} | Delivery note: ${deliveryNote}` : `Delivery note: ${deliveryNote}`)
        : order.notes;

      const { error: updateError } = await supabase.from("orders").update({
        delivered_at: new Date(dateVal).toISOString(),
        notes: updatedNotes
      }).eq("id", id!);
      
      if (updateError) throw updateError;
      
      toast.success("Order marked as delivered");
      setConfirmDeliver(false);
      load();
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[Context] Delivery error:", error);
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!order || busy) return;
    setBusy(true);
    
    try {
      const { data, error } = await supabase.rpc('cancel_order', { p_order_id: id! });
      
      if (error) throw error;
      const result = data as unknown as { success: boolean, error?: string };
      if (result && !result.success) throw new Error(result.error || "Cancellation failed");

      // Void invoice if exists
      if (invoice) {
        const { error: invErr } = await supabase.from('invoices').update({ is_void: true }).eq('id', invoice.id);
        if (invErr) console.error("[Context] Failed to void invoice:", invErr);
      }

      toast.success("Order cancelled and stock restored");
      setConfirmCancel(false);
      load();
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[Context]', error);
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const revertOrder = async () => {
    if (!order || busy) return;
    
    // Check if payments exist
    if (payments.length > 0) {
      setBusy(false);
      const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
      console.error('[Context] Cannot revert order with existing payments', { totalPaid });
      return toast.error(`Cannot revert — payments of ${fmtINR(totalPaid)} have been recorded. Delete payments first.`);
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('revert_order_to_approved', { p_order_id: id! });
      if (error) throw new Error("Database Error: " + error.message);
      const result = data as { success: boolean; error?: string };
      if (result && !result.success) throw new Error("Database Error: " + result.error);
      toast.success("Order reverted to approved mode. Stock deductions restored.");
      load();
    } catch (err: unknown) {
      const error = err as Error;
      console.error('[Context]', error);
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  };

  const navigateToEdit = () => {
    if (!order) return;

    if (["dispatched", "delivered"].includes(order.status)) {
      if (!isAdmin) {
        toast.error("Cannot edit a dispatched or delivered order directly. Only owners and admins can revert and edit.");
        return;
      }
      if (payments.length > 0) {
        const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
        return toast.error(`Cannot edit — payments of ${fmtINR(totalPaid)} recorded. Delete payments first.`);
      }
      setConfirmRevertEdit(true);
      return;
    }
    navigate(`/orders/${order.id}/edit`);
  };

  const performRevertAndEdit = async () => {
    if (!order) return;
    const tid = toast.loading("Reverting order to enable editing...");
    try {
      const { data, error } = await supabase.rpc('revert_order_to_approved', { p_order_id: id });
      if (error) throw new Error("Database Error: " + error.message);
      const res = data as { success: boolean; error?: string };
      if (res && !res.success) throw new Error("Database Error: " + res.error);
      toast.success("Order reverted. Ready to edit.", { id: tid });
      setConfirmRevertEdit(false);
      navigate(`/orders/${order.id}/edit`);
    } catch (e: unknown) {
      toast.error(friendlyError(e), { id: tid });
    }
  };

  const approveOrder = async () => {
    await updateStatus("approved");
    setConfirmApprove(false);
  };

  const generateBill = async () => {
    if (!order) return;
    setBusy(true);
    
    // Generate a temporary invoice number if DB doesn't have a trigger
    // Many Supabase setups require this if we don't have a server-side generator
    const tempInvoiceNo = `INV-${order.order_number}-${Math.floor(Math.random() * 1000)}`;

    const newSubtotal = computedSubtotal;
    const newGstTotal = billType === "gst" ? computedGst : 0;
    const newDiscount = computedDiscount;
    const newTotal = billType === "gst" ? computedTotal : (computedSubtotal - computedDiscount);

    // Sync orders table if gst_total or total was out of sync
    try {
      await supabase.from("orders").update({
        subtotal: computedSubtotal,
        gst_total: computedGst,
        total: computedTotal
      }).eq("id", order.id);
    } catch (syncErr) {
      console.warn("Order totals background sync note:", syncErr);
    }

    // Preserve existing amount paid and recompute payment status
    const existingAmountPaid = invoice ? Number(invoice.amount_paid || 0) : 0;
    let computedPaymentStatus: Database["public"]["Enums"]["payment_status"] = "unpaid";
    if (existingAmountPaid >= newTotal) {
      computedPaymentStatus = "paid";
    } else if (existingAmountPaid > 0) {
      computedPaymentStatus = "partial";
    }

    const { data, error } = await supabase.from("invoices").upsert({
      order_id: order.id, 
      shop_id: order.shop_id,
      type: billType,
      invoice_number: invoice?.invoice_number || tempInvoiceNo,
      sub_total: newSubtotal, 
      tax_amount: newGstTotal,
      discount_amount: newDiscount,
      total: newTotal,
      amount_paid: existingAmountPaid,
      payment_status: computedPaymentStatus,
      is_void: false
    } as unknown as Database["public"]["Tables"]["invoices"]["Insert"], { onConflict: 'order_id' }).select().single();

    setBusy(false);
    if (error) {
      console.error('[Context] Generate bill failed:', error);
      setBillOpen(false); // Close even on error to avoid overlay stuck
      return toast.error("Billing Failed: " + (error.message || "Unknown error"));
    }
    
    setBillOpen(false);
    toast.success(`${billType === "gst" ? "Tax invoice" : "Cash memo"} created successfully`);
    setInvoice(data);
    load(); // Reload order to update status conditional logic if any
  };

  const printThermal = async () => {
    if (!order || !invoice) return;
    
    const orderDateStr = fmtDate(order.order_date || order.created_at || invoice.created_at);
    const deliveryDateStr = order.delivered_at ? fmtDate(order.delivered_at) : (order.status === 'delivered' ? 'Delivered' : 'Pending');

    const isTaxInvoice = invoice.type === "gst";
    const thermalTax = isTaxInvoice ? (Number(invoice.tax_amount) > 0 ? Number(invoice.tax_amount) : computedGst) : 0;
    const thermalSubtotal = Number(invoice.sub_total) > 0 ? Number(invoice.sub_total) : computedSubtotal;
    const thermalDiscount = Number(invoice.discount_amount || 0);
    const thermalTotal = isTaxInvoice ? (thermalSubtotal + thermalTax - thermalDiscount) : (thermalSubtotal - thermalDiscount);

    const thermalData: ThermalInvoiceData = {
      businessName: COMPANY_NAME,
      businessTagline: COMPANY_TAGLINE,
      memoNumber: invoice.invoice_number,
      date: orderDateStr,
      orderDate: orderDateStr,
      deliveryDate: deliveryDateStr,
      orderNumber: order.order_number,
      billTo: order.shop.name,
      items: items.map((item, idx) => {
        const effGst = resolveEffectiveGstRate({
          gst_rate: item.gst_rate,
          cgst_rate: (item as Record<string, unknown>).cgst_rate as number | undefined ?? item.product?.cgst_rate,
          sgst_rate: (item as Record<string, unknown>).sgst_rate as number | undefined ?? item.product?.sgst_rate,
          igst_rate: (item as Record<string, unknown>).igst_rate as number | undefined ?? item.product?.igst_rate,
          hsn: item.product?.hsn,
          sku: item.product?.sku,
          name: item.product?.name,
          product: item.product
        });
        const lineExclusive = Number(item.unit_price) * Number(item.quantity);
        const lineTax = lineExclusive * (effGst / 100);
        return {
          srNo: idx + 1,
          product: item.product.name,
          variant: resolveDisplayUnit(item.pack_type, item.product),
          unit: resolveDisplayUnit(item.pack_type, item.product),
          sku: item.product.sku,
          qty: Number(item.quantity),
          rate: Number(item.unit_price),
          gst: `${effGst}%`,
          amount: isTaxInvoice ? (lineExclusive + lineTax) : lineExclusive
        };
      }),
      subtotal: thermalSubtotal,
      gst: thermalTax,
      discount: thermalDiscount,
      total: thermalTotal,
      footerNote: "This is a computer generated invoice."
    };

    const builder = new ThermalReceiptBuilder();
    const bytes = builder.buildInvoice(thermalData);
    
    setReceiptData({ bytes, lines: builder.getPreview(), thermalData });
    setPreviewOpen(true);
  };

  const shareBill = async () => {
    if (!invoice) return;
    setPdfPreviewOpen(true);
  };

  return (
    <div className="pb-32 sm:pb-12 relative">
      <PageHeader 
        title="Order Details"
        action={
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 rounded-xl text-slate-400 hover:text-slate-900 transition-all active:scale-95"
            onClick={() => navigate("/orders")}
          >
            <X size={24} />
          </Button>
        }
      />

      <ResponsiveContainer className="mt-6 space-y-8">
        <div className="flex flex-col gap-3 bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Line 1: Order ID */}
          <div className="w-full">
             <span className="text-base sm:text-2xl font-black text-slate-900 tracking-tight">
               Order #{order.order_number}
             </span>
          </div>

          {/* Line 2: Status Badge + Action Icons */}
          <div className="flex items-center justify-between gap-2 w-full pt-2 border-t border-slate-50">
            <Badge className={cn(
              "rounded-md px-2 py-0.5 h-5 text-[9px] font-black uppercase tracking-widest border-none whitespace-nowrap shadow-none",
              statusColor[order.status as keyof typeof statusColor]
            )}>
              {statusLabel[order.status] || order.status}
            </Badge>

            <div className="flex items-center gap-1 shrink-0">
                {can.edit && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 p-0 hover:bg-rose-50 transition-colors" 
                    onClick={navigateToEdit}
                  >
                    <Pencil size={18} className="text-rose-600" />
                  </Button>
                )}
                {can.dispatch && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 p-0 hover:bg-sky-50 transition-colors" 
                    onClick={() => setConfirmDispatch(true)}
                  >
                    <Truck size={18} className="text-sky-600" />
                  </Button>
                )}
                {can.deliver && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 p-0 hover:bg-emerald-50 transition-colors" 
                    onClick={() => setConfirmDeliver(true)}
                  >
                    <PackageCheck size={18} className="text-emerald-600" />
                  </Button>
                )}
                {isAdmin && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 p-0 hover:bg-rose-50 transition-colors" 
                    onClick={() => setOrderToDelete(true)}
                  >
                    <Trash2 size={18} className="text-rose-600" />
                  </Button>
                )}
            </div>
          </div>
          
          {/* Line 3: Order Date & Delivery Date */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-slate-600 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-brand-primary" />
              <span>Order Date: <strong className="font-bold text-slate-900">{fmtDate(order.order_date || order.created_at)}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <PackageCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Delivery Date: <strong className="font-bold text-slate-900">{order.delivered_at ? fmtDate(order.delivered_at) : (order.status === 'delivered' ? 'Delivered' : 'Pending')}</strong></span>
            </div>
          </div>
        </div>

        {/* ── Order Action Bar ── */}
        {nextAction && (
          <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-0 sm:relative sm:z-auto bg-white/80 backdrop-blur-md sm:bg-transparent border-t sm:border-none">
            <div className="max-w-md mx-auto sm:max-w-none">
              <Button 
                onClick={nextAction.action}
                className={cn(
                  "h-14 w-full rounded-2xl text-white font-black text-sm uppercase tracking-wider gap-3 shadow-xl active:scale-[0.98] transition-all",
                  nextAction.color
                )}
              >
                {nextAction.icon}
                {nextAction.label}
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-20">
        {/* Left Column: Summary */}
        <div className="lg:col-span-4 space-y-6 order-last lg:order-first">
          <Card className="border border-border/40 shadow-sm rounded-2xl overflow-hidden bg-white">
            <div className="p-5 bg-slate-50/50 border-b border-border/40 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-slate-500 shadow-sm border border-border/40">
                <Store size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 leading-none">{order.shop.name}</h3>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mt-1">Shop Details</p>
              </div>
            </div>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                <Row label="Account UID" value={order.shop.id.slice(0,8)} />
                <Row label="Mobile" value={order.shop.phone || "Not set"} />
                <Row label="GSTIN" value={order.shop.gstin || "Not provided"} />
                <Row label="Tier" value={order.shop.shop_type} />
              </div>

              <div className="h-px bg-slate-100" />

              <div className="space-y-3">
                <Row label="Placed on" value={fmtDateTime(order.created_at)} />
                <Row label="Salesperson" value={order.salesperson?.full_name || "Self"} />
      {order.dispatched_at && <Row label="Dispatched" value={fmtDateTime(order.dispatched_at)} />}
      {order.delivered_at && <Row label="Delivered" value={fmtDateTime(order.delivered_at)} />}
      {order.dispatched_at && order.delivered_at && (
        <Row 
          label="SLA (Total Time)" 
          value={`${Math.round((new Date(order.delivered_at).getTime() - new Date(order.created_at).getTime()) / (1000 * 60 * 60))} hrs`} 
        />
      )}
    </div>
              
              {isAdmin && profitability && (
                <div className="space-y-4 pt-6 mt-6 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Economics</p>
                    {profitability.isProjected && (
                      <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-bold bg-amber-50 text-amber-600 border-amber-200">PROJECTION</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-4 rounded-xl border border-border/40">
                       <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1">Cost</p>
                       <p className="text-sm font-bold text-slate-800">{fmtINR(profitability.totalCost)}</p>
                    </div>
                    <div className={cn(
                      "p-4 rounded-xl border",
                      profitability.profit >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"
                    )}>
                       <p className={cn(
                         "text-[10px] font-medium uppercase tracking-wider mb-1",
                         profitability.profit >= 0 ? "text-emerald-500" : "text-rose-500"
                       )}>Margin</p>
                       <p className={cn(
                         "text-sm font-bold",
                         profitability.profit >= 0 ? "text-emerald-700" : "text-rose-700"
                       )}>
                         {profitability.marginPercent.toFixed(1)}%
                       </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-1">
                     <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Net Profit:</span>
                     <span className={cn(
                       "font-bold text-base tabular-nums",
                       profitability.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                     )}>
                       {fmtINR(profitability.profit)}
                     </span>
                  </div>
                </div>
              )}
              
              {order.notes && (
                <div className="space-y-2 pt-4 border-t border-slate-100">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 ml-1">Notes</span>
                  <div className="bg-slate-50 border border-border/40 p-4 rounded-xl text-xs font-medium text-slate-700 leading-relaxed">
                    {order.notes}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: items & financials */}
        <div className="lg:col-span-8 space-y-6">
          {/* Company / Principal Audit Settlement Breakdown */}
          {companyAuditBreakdown.length > 0 && (
            <Card className="border border-border/40 shadow-sm rounded-2xl bg-white overflow-hidden">
              <div className="p-4 sm:p-5 bg-slate-50/50 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white shadow-sm border border-border/40 flex items-center justify-center text-slate-700">
                    <Building2 className="h-5 w-5 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Company / Principal Audit Breakdown</h3>
                    <p className="text-[10px] font-medium text-slate-400">
                      {companyAuditBreakdown.length === 1 ? "1 Brand Principal" : `${companyAuditBreakdown.length} Brand Principals in this order`}
                    </p>
                  </div>
                </div>
                {companyAuditBreakdown.length > 1 && (
                  <Badge variant="outline" className="text-[9px] font-black bg-brand-primary/5 text-brand-primary border-brand-primary/20 px-2 py-0.5">
                    Multi-Company Order
                  </Badge>
                )}
              </div>
              <CardContent className="p-4 sm:p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {companyAuditBreakdown.map((grp) => {
                    const percentOfOrder = order.total > 0 ? (grp.total / Number(order.total)) * 100 : 0;
                    return (
                      <div 
                        key={grp.id}
                        className="rounded-xl border p-3.5 bg-slate-50/50 relative overflow-hidden transition-all hover:bg-slate-50 shadow-2xs"
                        style={{ borderColor: grp.accent_hex + '35' }}
                      >
                        <div 
                          className="absolute top-0 bottom-0 left-0 w-1" 
                          style={{ backgroundColor: grp.accent_hex }} 
                        />
                        <div className="flex items-center justify-between mb-2 pl-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span 
                              className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                              style={{ backgroundColor: grp.accent_hex + '18', color: grp.accent_hex }}
                            >
                              {grp.short_code}
                            </span>
                            <span className="text-xs font-extrabold text-slate-900 truncate">
                              {grp.name}
                            </span>
                          </div>
                          <span className="text-[10px] font-black text-slate-400 tabular-nums shrink-0 ml-2">
                            {percentOfOrder.toFixed(0)}% share
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 pl-1 text-[10px]">
                          <div>
                            <span className="text-slate-400 block font-medium">Items</span>
                            <span className="font-bold text-slate-800 tabular-nums">{grp.items_count} SKU{grp.items_count > 1 ? 's' : ''}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-medium">Taxable</span>
                            <span className="font-bold text-slate-800 tabular-nums">{fmtINR(grp.subtotal)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-slate-400 block font-medium">Net Total</span>
                            <span className="font-black text-slate-900 tabular-nums">{fmtINR(grp.total)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border border-border/40 shadow-sm rounded-2xl bg-white overflow-hidden">
            <div className="p-4 sm:p-5 bg-slate-50/50 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-white shadow-sm border border-border/40 flex items-center justify-center text-slate-700">
                  <ClipboardList className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                   <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Order Items</h3>
                   <p className="text-[10px] font-medium text-slate-400">
                     {items.length} Product SKUs · {companyAuditBreakdown.length} {companyAuditBreakdown.length === 1 ? "Company" : "Companies"}
                   </p>
                </div>
              </div>

              {/* View mode toggle: Grouped by Company vs Flat List */}
              {companyAuditBreakdown.length > 1 && (
                <div className="flex items-center bg-slate-200/60 p-1 rounded-xl gap-1 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setItemViewMode("grouped")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      itemViewMode === "grouped"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>By Company</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemViewMode("flat")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                      itemViewMode === "flat"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-900"
                    )}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>Flat List</span>
                  </button>
                </div>
              )}
            </div>

            <CardContent className="p-0">
              {itemViewMode === "grouped" && companyAuditBreakdown.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {companyAuditBreakdown.map((grp) => {
                    const grpItems = grp.items;
                    return (
                      <div key={grp.id} className="bg-white">
                        {/* Company Group Header */}
                        <div 
                          className="px-4 py-3 sm:px-6 bg-slate-50/80 border-b border-border/30 flex flex-wrap items-center justify-between gap-2"
                          style={{ borderLeft: `4px solid ${grp.accent_hex}` }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span 
                              className="text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0"
                              style={{ 
                                backgroundColor: grp.accent_hex + '20', 
                                color: grp.accent_hex 
                              }}
                            >
                              {grp.short_code}
                            </span>
                            <h4 className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                              {grp.name}
                            </h4>
                            <span className="text-[10px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200 shrink-0">
                              {grp.items_count} SKU{grp.items_count > 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] font-semibold ml-auto">
                            <div className="text-right">
                              <span className="text-slate-400 mr-1 text-[10px]">Taxable:</span>
                              <span className="text-slate-700 tabular-nums">{fmtINR(grp.subtotal)}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-400 mr-1 text-[10px]">GST:</span>
                              <span className="text-slate-700 tabular-nums">{fmtINR(grp.gst)}</span>
                            </div>
                            <div className="text-right pl-2 border-l border-slate-200">
                              <span className="text-slate-400 mr-1 text-[10px]">Total:</span>
                              <span className="font-bold text-slate-900 tabular-nums">{fmtINR(grp.total)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Company Items Table */}
                        <AdaptiveTable
                          data={grpItems}
                          className="border-none shadow-none rounded-none"
                          keyExtractor={(item) => item.id}
                          columns={[
                            {
                              header: "Product",
                              id: "product",
                              className: "pl-6",
                              render: (item: OrderItem) => {
                                const pRec = item.product as Record<string, unknown> | null;
                                const iRec = item as Record<string, unknown>;
                                const effGst = resolveEffectiveGstRate({
                                  gst_rate: item.gst_rate,
                                  cgst_rate: (iRec.cgst_rate as number | undefined) ?? (pRec?.cgst_rate as number | undefined),
                                  sgst_rate: (iRec.sgst_rate as number | undefined) ?? (pRec?.sgst_rate as number | undefined),
                                  igst_rate: (iRec.igst_rate as number | undefined) ?? (pRec?.igst_rate as number | undefined),
                                  hsn: pRec?.hsn as string | undefined,
                                  sku: pRec?.sku as string | undefined,
                                  name: pRec?.name as string | undefined,
                                  product: item.product
                                });

                                return (
                                  <div className="py-3.5">
                                    <p className="font-semibold text-sm text-slate-900 leading-tight">
                                      {item.product.name}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                      {/* GST Rate Badge */}
                                      <Badge 
                                        variant="outline" 
                                        className={cn(
                                          "text-[9px] font-bold px-1.5 py-0 h-4 rounded-sm border",
                                          effGst === 5 && "border-emerald-200 text-emerald-700 bg-emerald-50",
                                          effGst === 12 && "border-blue-200 text-blue-700 bg-blue-50",
                                          effGst === 18 && "border-indigo-200 text-indigo-700 bg-indigo-50",
                                          effGst === 28 && "border-purple-200 text-purple-700 bg-purple-50",
                                          effGst === 0 && "border-slate-200 text-slate-600 bg-slate-50"
                                        )}
                                      >
                                        {effGst}% GST
                                      </Badge>

                                      {item.product?.hsn && (
                                        <span className="text-[9px] text-slate-400 font-mono">
                                          HSN: {item.product.hsn}
                                        </span>
                                      )}

                                      {item.batch?.batch_number && (
                                        <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 h-4 border-amber-100 text-amber-600 bg-amber-50 rounded-sm">
                                          {item.batch.batch_number}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                );
                              }
                            },
                            {
                              header: "Qty",
                              id: "qty",
                              className: "text-center",
                              render: (item: OrderItem) => (
                                <span className="font-semibold text-sm tabular-nums text-slate-700">
                                  {Number(item.quantity).toLocaleString()} {resolveDisplayUnit(item.pack_type, item.product)}
                                </span>
                              )
                            },
                            {
                              header: "Rate",
                              id: "rate",
                              className: "text-center",
                              render: (item: OrderItem) => (
                                <div>
                                  <span className="font-medium text-xs tabular-nums text-slate-700">
                                    {fmtINR(item.unit_price)}
                                  </span>
                                  <span className="block text-[9px] text-slate-400 font-normal">excl. tax</span>
                                </div>
                              )
                            },
                            {
                              header: "Amount",
                              id: "gross",
                              className: "text-right pr-6",
                              render: (item: OrderItem) => {
                                const pRec = item.product as Record<string, unknown> | null;
                                const iRec = item as Record<string, unknown>;
                                const effGst = resolveEffectiveGstRate({
                                  gst_rate: item.gst_rate,
                                  cgst_rate: (iRec.cgst_rate as number | undefined) ?? (pRec?.cgst_rate as number | undefined),
                                  sgst_rate: (iRec.sgst_rate as number | undefined) ?? (pRec?.sgst_rate as number | undefined),
                                  igst_rate: (iRec.igst_rate as number | undefined) ?? (pRec?.igst_rate as number | undefined),
                                  hsn: pRec?.hsn as string | undefined,
                                  sku: pRec?.sku as string | undefined,
                                  name: pRec?.name as string | undefined,
                                  product: item.product
                                });
                                const taxable = Number(item.unit_price) * Number(item.quantity);
                                const gstAmt = taxable * (effGst / 100);
                                const gross = taxable + gstAmt;

                                return (
                                  <div>
                                    <span className="font-bold text-sm tabular-nums text-slate-900">
                                      {fmtINR(Number(item.line_total || gross))}
                                    </span>
                                    {effGst > 0 && (
                                      <span className="block text-[9px] text-slate-400 tabular-nums">
                                        Tax: +{fmtINR(gstAmt)}
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                            }
                          ]}
                          renderMobileCard={(item: OrderItem) => {
                            const pRec = item.product as Record<string, unknown> | null;
                            const iRec = item as Record<string, unknown>;
                            const effGst = resolveEffectiveGstRate({
                              gst_rate: item.gst_rate,
                              cgst_rate: (iRec.cgst_rate as number | undefined) ?? (pRec?.cgst_rate as number | undefined),
                              sgst_rate: (iRec.sgst_rate as number | undefined) ?? (pRec?.sgst_rate as number | undefined),
                              igst_rate: (iRec.igst_rate as number | undefined) ?? (pRec?.igst_rate as number | undefined),
                              hsn: pRec?.hsn as string | undefined,
                              sku: pRec?.sku as string | undefined,
                              name: pRec?.name as string | undefined,
                              product: item.product
                            });
                            const taxable = Number(item.unit_price) * Number(item.quantity);
                            const gstAmt = taxable * (effGst / 100);

                            return (
                              <div className="p-4 border-b border-border/40 last:border-0 bg-white">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="min-w-0 flex-1 pr-4">
                                    <h4 className="font-semibold text-xs text-slate-900 leading-tight">
                                      {item.product.name}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                      <Badge 
                                        variant="outline" 
                                        className={cn(
                                          "text-[8px] font-bold px-1 py-0 h-3.5 rounded-sm border",
                                          effGst === 5 && "border-emerald-200 text-emerald-700 bg-emerald-50",
                                          effGst === 12 && "border-blue-200 text-blue-700 bg-blue-50",
                                          effGst === 18 && "border-indigo-200 text-indigo-700 bg-indigo-50",
                                          effGst === 28 && "border-purple-200 text-purple-700 bg-purple-50",
                                          effGst === 0 && "border-slate-200 text-slate-600 bg-slate-50"
                                        )}
                                      >
                                        {effGst}% GST
                                      </Badge>
                                      {item.batch?.batch_number && (
                                        <Badge variant="outline" className="text-[8px] font-bold px-1 py-0 h-3.5 border-amber-100 text-amber-600 bg-amber-50 rounded-sm">
                                          {item.batch.batch_number}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                     <p className="text-sm font-bold text-slate-900 tabular-nums">
                                        {fmtINR(Number(item.line_total))}
                                     </p>
                                     {effGst > 0 && (
                                       <span className="text-[9px] text-slate-400 tabular-nums">
                                         +GST: {fmtINR(gstAmt)}
                                       </span>
                                     )}
                                  </div>
                                </div>
                                
                                <div className="flex justify-between items-center text-[10px] sm:text-xs text-slate-500">
                                   <div>
                                      {item.quantity} {resolveDisplayUnit(item.pack_type, item.product)} × {fmtINR(item.unit_price)}
                                   </div>
                                </div>
                              </div>
                            );
                          }}
                        />

                        {/* Company Group Subtotal Footer */}
                        <div className="px-4 py-2 sm:px-6 bg-slate-50/40 border-t border-slate-100 flex items-center justify-between text-[10px] sm:text-xs text-slate-500">
                          <span>
                            Subtotal for <strong className="text-slate-800">{grp.short_code}</strong> ({grp.items_count} items)
                          </span>
                          <div className="flex items-center gap-3">
                            <span>Taxable: <strong className="text-slate-700 tabular-nums">{fmtINR(grp.subtotal)}</strong></span>
                            <span>GST: <strong className="text-slate-700 tabular-nums">{fmtINR(grp.gst)}</strong></span>
                            <span className="font-bold text-slate-900">Total: <strong className="text-slate-900 tabular-nums">{fmtINR(grp.total)}</strong></span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Flat view fallback or toggled */
                <AdaptiveTable
                  data={items}
                  className="border-none shadow-none rounded-none"
                  keyExtractor={(item) => item.id}
                  columns={[
                    {
                      header: "Product",
                      id: "product",
                      className: "pl-6",
                      render: (item: OrderItem) => {
                        const comp = resolveCompanyInfo(item.product);
                        const pRec = item.product as Record<string, unknown> | null;
                        const iRec = item as Record<string, unknown>;
                        const effGst = resolveEffectiveGstRate({
                          gst_rate: item.gst_rate,
                          cgst_rate: (iRec.cgst_rate as number | undefined) ?? (pRec?.cgst_rate as number | undefined),
                          sgst_rate: (iRec.sgst_rate as number | undefined) ?? (pRec?.sgst_rate as number | undefined),
                          igst_rate: (iRec.igst_rate as number | undefined) ?? (pRec?.igst_rate as number | undefined),
                          hsn: pRec?.hsn as string | undefined,
                          sku: pRec?.sku as string | undefined,
                          name: pRec?.name as string | undefined,
                          product: item.product
                        });

                        return (
                          <div className="py-4">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span 
                                className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                                style={{ 
                                  backgroundColor: comp.accent_hex + '18', 
                                  color: comp.accent_hex 
                                }}
                              >
                                {comp.short_code}
                              </span>
                              <p className="font-semibold text-sm text-slate-900 leading-tight truncate">{item.product.name}</p>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-[9px] font-bold px-1.5 py-0 h-4 rounded-sm border",
                                  effGst === 5 && "border-emerald-200 text-emerald-700 bg-emerald-50",
                                  effGst === 12 && "border-blue-200 text-blue-700 bg-blue-50",
                                  effGst === 18 && "border-indigo-200 text-indigo-700 bg-indigo-50",
                                  effGst === 28 && "border-purple-200 text-purple-700 bg-purple-50",
                                  effGst === 0 && "border-slate-200 text-slate-600 bg-slate-50"
                                )}
                              >
                                {effGst}% GST
                              </Badge>
                              {item.batch?.batch_number && (
                                <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 h-4 border-amber-100 text-amber-600 bg-amber-50 rounded-sm">
                                  {item.batch.batch_number}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      }
                    },
                    {
                      header: "Qty",
                      id: "qty",
                      className: "text-center",
                      render: (item: OrderItem) => (
                        <span className="font-semibold text-sm tabular-nums text-slate-700">
                          {Number(item.quantity).toLocaleString()} {resolveDisplayUnit(item.pack_type, item.product)}
                        </span>
                      )
                    },
                    {
                      header: "Rate",
                      id: "rate",
                      className: "text-center",
                      render: (item: OrderItem) => (
                        <span className="font-medium text-xs tabular-nums text-slate-500">
                          {fmtINR(item.unit_price)}
                        </span>
                      )
                    },
                    {
                      header: "Amount",
                      id: "gross",
                      className: "text-right pr-6",
                      render: (item: OrderItem) => (
                        <span className="font-bold text-sm tabular-nums text-slate-900">
                          {fmtINR(Number(item.line_total))}
                        </span>
                      )
                    }
                  ]}
                  renderMobileCard={(item: OrderItem) => {
                    const comp = resolveCompanyInfo(item.product);
                    const pRec = item.product as Record<string, unknown> | null;
                    const iRec = item as Record<string, unknown>;
                    const effGst = resolveEffectiveGstRate({
                      gst_rate: item.gst_rate,
                      cgst_rate: (iRec.cgst_rate as number | undefined) ?? (pRec?.cgst_rate as number | undefined),
                      sgst_rate: (iRec.sgst_rate as number | undefined) ?? (pRec?.sgst_rate as number | undefined),
                      igst_rate: (iRec.igst_rate as number | undefined) ?? (pRec?.igst_rate as number | undefined),
                      hsn: pRec?.hsn as string | undefined,
                      sku: pRec?.sku as string | undefined,
                      name: pRec?.name as string | undefined,
                      product: item.product
                    });

                    return (
                      <div className="p-4 border-b border-border/40 last:border-0 bg-white">
                        <div className="flex justify-between items-start mb-2">
                          <div className="min-w-0 flex-1 pr-4">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span 
                                className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
                                style={{ 
                                  backgroundColor: comp.accent_hex + '18', 
                                  color: comp.accent_hex 
                                }}
                              >
                                {comp.short_code}
                              </span>
                              <h4 className="font-semibold text-xs text-slate-900 leading-tight truncate">{item.product.name}</h4>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge 
                                variant="outline" 
                                className={cn(
                                  "text-[8px] font-bold px-1 py-0 h-3.5 rounded-sm border",
                                  effGst === 5 && "border-emerald-200 text-emerald-700 bg-emerald-50",
                                  effGst === 18 && "border-indigo-200 text-indigo-700 bg-indigo-50"
                                )}
                              >
                                {effGst}% GST
                              </Badge>
                              {item.batch?.batch_number && (
                                <Badge variant="outline" className="text-[8px] font-bold px-1 py-0 h-3.5 border-amber-100 text-amber-600 bg-amber-50 rounded-sm">
                                  {item.batch.batch_number}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                             <p className="text-sm font-bold text-slate-900 tabular-nums">
                                {fmtINR(Number(item.line_total))}
                             </p>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center text-[10px] sm:text-xs text-slate-500">
                           <div>
                              {item.quantity} {resolveDisplayUnit(item.pack_type, item.product)} × {fmtINR(item.unit_price)}
                           </div>
                        </div>
                      </div>
                    );
                  }}
                 />
              )}

               {/* Financial Summary & Itemized GST Breakdown */}
               <div className="p-6 sm:p-8 bg-slate-50/50 border-t border-border/40">
                  <div className="max-w-[380px] ml-auto space-y-3">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs text-slate-500">
                        <span>Items Total (Taxable Subtotal)</span>
                        <span className="tabular-nums font-semibold text-slate-800">{fmtINR(computedSubtotal)}</span>
                      </div>
                      
                      <div className="flex justify-between items-center text-xs text-slate-500">
                        <span>Total Tax (GST)</span>
                        <span className="tabular-nums font-semibold text-slate-800">
                          {fmtINR(computedGst)}
                        </span>
                      </div>
                      
                      {/* Enhanced Product-Linked GST Slabs Breakdown */}
                      {gstDetailedBreakdown.length > 0 && (
                        <div className="mt-2 space-y-2 pt-2 border-t border-dashed border-slate-200">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            GST Tax Breakdown by Slab
                          </p>
                          {gstDetailedBreakdown.map((slab) => {
                            const isExpanded = !!expandedGstSlabs[slab.rate];
                            return (
                              <div 
                                key={slab.rate} 
                                className="rounded-xl border border-slate-200/80 bg-white p-2.5 space-y-1.5 shadow-2xs"
                              >
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                    <span 
                                      className={cn(
                                        "w-2 h-2 rounded-full",
                                        slab.rate === 5 && "bg-emerald-500",
                                        slab.rate === 12 && "bg-blue-500",
                                        slab.rate === 18 && "bg-indigo-500",
                                        slab.rate === 28 && "bg-purple-500",
                                        slab.rate === 0 && "bg-slate-400"
                                      )} 
                                    />
                                    GST {slab.rate}% <span className="text-[10px] font-normal text-slate-400">(CGST {slab.cgstRate}% + SGST {slab.sgstRate}%)</span>
                                  </span>
                                  <span className="tabular-nums font-bold text-slate-900">
                                    {fmtINR(slab.totalTax)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                  <span>Taxable Base: <strong className="text-slate-600 tabular-nums">{fmtINR(slab.taxableSubtotal)}</strong></span>
                                  <button
                                    type="button"
                                    onClick={() => toggleGstSlabExpand(slab.rate)}
                                    className="text-brand-primary hover:underline font-bold flex items-center gap-0.5 text-[10px]"
                                  >
                                    <span>{slab.items.length} Product{slab.items.length > 1 ? 's' : ''}</span>
                                    <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                                  </button>
                                </div>

                                {/* Expanded list of products falling under this GST slab */}
                                <AnimatePresence>
                                  {isExpanded && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden pt-2 border-t border-slate-100 space-y-1.5"
                                    >
                                      {slab.items.map((prod) => (
                                        <div 
                                          key={prod.id} 
                                          className="flex items-start justify-between text-[10px] bg-slate-50 p-1.5 rounded-lg"
                                        >
                                          <div className="min-w-0 flex-1 pr-2">
                                            <div className="flex items-center gap-1">
                                              <span 
                                                className="text-[8px] font-black px-1 rounded uppercase tracking-wider shrink-0"
                                                style={{ 
                                                  backgroundColor: prod.company.accent_hex + '20', 
                                                  color: prod.company.accent_hex 
                                                }}
                                              >
                                                {prod.company.short_code}
                                              </span>
                                              <span className="font-semibold text-slate-800 truncate">{prod.name}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-400 mt-0.5">
                                              {prod.quantity} {prod.unit} × {fmtINR(prod.unitPrice)}
                                            </div>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <div className="font-bold text-slate-700 tabular-nums">{fmtINR(prod.taxableAmount)}</div>
                                            <div className="text-[9px] text-slate-400 tabular-nums">Tax: {fmtINR(prod.taxAmount)}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {Number(computedDiscount) > 0 && (
                        <div className="flex justify-between items-center text-xs text-rose-500 pt-1">
                          <span>Discount</span>
                          <span className="tabular-nums font-semibold">-{fmtINR(computedDiscount)}</span>
                        </div>
                      )}
                    </div>

                    <div className="h-px bg-border/40 my-3" />

                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Amount</span>
                      <div className="text-right">
                         <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{fmtINR(computedTotal)}</span>
                      </div>
                    </div>
                  </div>
               </div>
            </CardContent>
          </Card>

           {/* Billing & Payments Section */}
          {invoice && (
            <div className="space-y-4">
              <button 
                onClick={() => setInvoiceOpen(!invoiceOpen)}
                className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-border/40 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                    <Receipt size={16} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-slate-900 leading-none">Billing & Invoice</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{invoice.invoice_number}</p>
                  </div>
                </div>
                <ChevronRight className={cn("h-5 w-5 text-slate-300 transition-transform", invoiceOpen && "rotate-90")} />
              </button>

              <AnimatePresence>
                {invoiceOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="border border-border/40 shadow-sm rounded-2xl overflow-hidden bg-slate-900 text-white">
                        <CardContent className="p-6 space-y-6">
                           <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Tax Invoice</p>
                              <p className="text-xl font-bold">{invoice.invoice_number}</p>
                           </div>
                           
                           <div className="grid grid-cols-3 gap-2">
                              <Button onClick={shareBill} className="bg-white text-slate-900 hover:bg-white/90 rounded-xl h-10 font-bold text-[11px] border-none px-1">
                                 <Share2 className="mr-1 h-3.5 w-3.5" /> Share
                              </Button>
                              <Button onClick={printThermal} className="bg-white/5 text-white hover:bg-white/10 border-white/10 rounded-xl h-10 font-bold text-[11px] px-1">
                                 <Printer className="mr-1 h-3.5 w-3.5" /> Thermal
                              </Button>
                              <Button onClick={() => setBillOpen(true)} className="bg-white/5 text-white hover:bg-white/10 border-white/10 rounded-xl h-10 font-bold text-[11px] px-1">
                                 <RefreshCw className="mr-1 h-3.5 w-3.5" /> Re-bill
                              </Button>
                           </div>
                        </CardContent>
                      </Card>

                      <Card className="border border-border/40 shadow-sm rounded-2xl overflow-hidden bg-indigo-600 text-white">
                        <CardContent className="p-6 flex flex-col justify-between h-full min-h-[140px]">
                           <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1">Outstanding</p>
                              <p className="text-3xl font-bold tabular-nums">
                                 {fmtINR(Math.max(0, Number(invoice.total) - payments.reduce((s,p)=>s+Number(p.amount),0)))}
                              </p>
                           </div>
                           
                           <Button 
                              onClick={() => setPayOpen(true)} 
                              disabled={Number(invoice.total) <= payments.reduce((s,p)=>s+Number(p.amount),0)}
                              className="bg-white text-indigo-600 hover:bg-white/90 rounded-xl h-10 font-bold text-xs border-none mt-4"
                           >
                              <Plus className="mr-2 h-4 w-4" /> Record Payment
                           </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {payments.length > 0 && (
            <div className="space-y-4">
              <button 
                onClick={() => setPaymentsOpen(!paymentsOpen)}
                className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-border/40 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                    <IndianRupeeIcon size={16} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-slate-900 leading-none">Payment History</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{payments.length} Records</p>
                  </div>
                </div>
                <ChevronRight className={cn("h-5 w-5 text-slate-300 transition-transform", paymentsOpen && "rotate-90")} />
              </button>

              <AnimatePresence>
                {paymentsOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <Card className="border border-border/40 shadow-sm rounded-2xl overflow-hidden">
                      <CardContent className="p-0">
                         <div className="overflow-x-auto">
                            <Table>
                               <TableHeader>
                                  <TableRow className="h-10 bg-slate-50/30 border-border/40">
                                     <TableHead className="font-bold text-[10px] uppercase tracking-wider px-6">Date</TableHead>
                                     <TableHead className="font-bold text-[10px] uppercase tracking-wider">Method</TableHead>
                                     <TableHead className="font-bold text-[10px] uppercase tracking-wider">Reference</TableHead>
                                     <TableHead className="text-right font-bold text-[10px] uppercase tracking-wider px-6">Amount</TableHead>
                                  </TableRow>
                               </TableHeader>
                               <TableBody>
                                  {payments.map(p => (
                                     <TableRow key={p.id} className="border-border/40 group hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="px-6 font-medium text-xs text-slate-500 tabular-nums">
                                           {fmtDate(p.paid_at || p.created_at)}
                                        </TableCell>
                                        <TableCell>
                                           {p.notes?.toLowerCase().includes("discount") ? (
                                              <Badge variant="outline" className="rounded-sm text-[9px] font-bold uppercase px-1.5 h-4 border-amber-100 text-amber-600 bg-amber-50">
                                                 Discount
                                              </Badge>
                                           ) : (
                                              <Badge variant="outline" className="rounded-sm text-[9px] font-bold uppercase px-1.5 h-4 border-emerald-100 text-emerald-600 bg-emerald-50">
                                                 {p.payment_method}
                                              </Badge>
                                           )}
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500">
                                           {p.notes || "Recorded"}
                                        </TableCell>
                                        <TableCell className="px-6 text-right">
                                           <div className="flex items-center justify-end gap-2">
                                              <span className={cn(
                                                 "font-bold text-sm tabular-nums",
                                                 p.notes?.toLowerCase().includes("discount") ? "text-amber-600" : "text-emerald-600"
                                              )}>
                                                 {p.notes?.toLowerCase().includes("discount") ? "-" : "+"}{fmtINR(p.amount)}
                                              </span>
                                              {isAdmin && (
                                                 <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-7 w-7 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all"
                                                    onClick={() => setPaymentToDelete(p.id)}
                                                 >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                 </Button>
                                              )}
                                           </div>
                                        </TableCell>
                                     </TableRow>
                                  ))}
                               </TableBody>
                            </Table>
                         </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      </ResponsiveContainer>

      <Sheet open={billOpen} onOpenChange={setBillOpen}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("p-0 focus:outline-none border-l border-slate-100 shadow-2xl overflow-hidden flex flex-col", isMobile ? "h-[92dvh] rounded-t-[2.5rem]" : "w-full md:max-w-md")}>
          <SheetHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
            <SheetTitle className="text-xl font-black text-slate-800">Generate Bill / Invoice</SheetTitle>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Billing & Settlement Protocol</p>
          </SheetHeader>
          <div className="p-8 space-y-6 flex-1 overflow-y-auto">
            <RadioGroup value={billType} onValueChange={(v)=>setBillType(v as "gst" | "cash")} className="grid grid-cols-1 gap-4">
              <Label 
                htmlFor="gst" 
                className={cn(
                  "flex items-center gap-4 p-6 rounded-2xl border-2 transition-all cursor-pointer",
                  billType === "gst" ? "border-primary bg-primary/5 shadow-xl shadow-primary/5" : "border-slate-200 hover:bg-slate-50"
                )}
              >
                <RadioGroupItem value="gst" id="gst" className="sr-only" />
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-all", billType === "gst" ? "bg-primary text-white" : "bg-slate-100 text-slate-400")}>
                  <FileText className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <div className="text-lg font-black tracking-tight text-slate-800">Tax Invoice (GST)</div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{order.shop.gstin ? `Registered: ${order.shop.gstin}` : "GST Calculated from Product Details"}</div>
                </div>
                {billType === "gst" && <Check className="h-6 w-6 text-primary animate-in zoom-in duration-300" />}
              </Label>
              <Label 
                htmlFor="cash" 
                className={cn(
                  "flex items-center gap-4 p-6 rounded-2xl border-2 transition-all cursor-pointer",
                  billType === "cash" ? "border-slate-900 bg-slate-900/5 shadow-xl shadow-slate-900/5" : "border-slate-200 hover:bg-slate-50"
                )}
              >
                <RadioGroupItem value="cash" id="cash" className="sr-only" />
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center transition-all", billType === "cash" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400")}>
                  <Receipt className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <div className="text-lg font-black tracking-tight text-slate-800">Loose Bill / Cash Memo</div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Internal Trading Document</div>
                </div>
                {billType === "cash" && <Check className="h-6 w-6 text-slate-900 animate-in zoom-in duration-300" />}
              </Label>
            </RadioGroup>
            
            <Button 
              className="w-full h-18 rounded-2xl bg-primary text-lg font-black uppercase tracking-[0.2em] text-white shadow-2xl hover:scale-[1.02] active:scale-95 transition-all border-none ring-8 ring-primary/5 mt-4" 
              size="lg" 
              disabled={busy} 
              onClick={generateBill}
            >
              {busy ? <Loader2 className="animate-spin h-6 w-6" /> : "FINALIZE STATEMENT"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {invoicePDFData && (
        <InvoicePDFPreviewModal
          isOpen={pdfPreviewOpen}
          onClose={() => setPdfPreviewOpen(false)}
          data={invoicePDFData}
        />
      )}

      {invoice && (
        <RecordPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          invoice={invoice}
          onSaved={load}
        />
      )}

      {receiptData && receiptData.thermalData ? (
        <InvoicePreviewModal
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          data={receiptData.thermalData}
          onPrint={async () => {
            setPreviewOpen(false);
            if (receiptData?.bytes) await print(receiptData.bytes);
          }}
        />
      ) : receiptData && (
        <ReceiptPreviewModal
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          previewLines={receiptData.lines}
          onPrint={async () => {
            setPreviewOpen(false);
            if (receiptData?.bytes) await print(receiptData.bytes);
          }}
        />
      )}

      <AlertDialog open={orderToDelete} onOpenChange={setOrderToDelete}>
        <AlertDialogContent className="rounded-3xl border-2 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black">Delete Order Permanently?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium">
              This will permanently remove the order, all its items, invoices, and associated payments.
              This action belongs to the administrative hierarchy and is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-2xl font-bold uppercase tracking-widest text-[10px] h-12">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteOrder}
              className="rounded-2xl font-bold uppercase tracking-widest text-[10px] h-12 bg-destructive hover:bg-destructive/90"
            >
              Verify & Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!paymentToDelete} onOpenChange={(open) => !open && setPaymentToDelete(null)}>
        <AlertDialogContent className="rounded-3xl border-2 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black">Remove Payment Record?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium">
              This will remove the payment entry and increase the outstanding balance of the invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-2xl font-bold uppercase tracking-widest text-[10px] h-12">Keep Record</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deletePayment}
              className="rounded-2xl font-bold uppercase tracking-widest text-[10px] h-12 bg-destructive hover:bg-destructive/90"
            >
              Confirm Deletion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveDialog 
        open={confirmApprove} 
        onOpenChange={setConfirmApprove}
        title="Approve Order"
      >
        <div className="space-y-6 pt-2 pb-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Approval Date & Time</Label>
              <Input 
                type="datetime-local" 
                value={dateVal} 
                onChange={e => setDateVal(e.target.value)}
                className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-sm" 
              />
            </div>
            <p className="text-xs text-slate-500 font-medium italic">Selecting a past date will backdate the approval record.</p>
          </div>

          <div className="flex gap-3">
             <Button 
               variant="outline" 
               className="flex-1 h-16 rounded-[1.5rem] font-bold text-slate-400 uppercase tracking-widest text-[10px]"
               onClick={() => setConfirmApprove(false)}
             >
               Abort
             </Button>
             <Button 
               className="flex-[2] h-16 rounded-[1.5rem] bg-emerald-600 text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-emerald-600/20"
               onClick={approveOrder}
               disabled={busy}
             >
               {busy ? "Approving..." : "Confirm Approval"}
             </Button>
          </div>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog 
        open={confirmDispatch} 
        onOpenChange={setConfirmDispatch}
        title="Finalize Dispatch"
      >
        <div className="space-y-6 pt-2 pb-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Dispatch Date & Time</Label>
                <Input 
                  type="datetime-local" 
                  value={dateVal} 
                  onChange={e => setDateVal(e.target.value)}
                  className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-sm" 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Vehicle Number *</Label>
                <Input 
                  placeholder="e.g. MH 12 AB 1234" 
                  value={vehicleNumber}
                  onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                  className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-sm" 
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Driver Name *</Label>
                <Input 
                  placeholder="Full Name" 
                  value={driverName}
                  onChange={e => setDriverName(e.target.value)}
                  className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-sm" 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">E-Way Bill (Optional)</Label>
                <Input 
                  placeholder="12-digit number" 
                  value={ewayBillNo}
                  onChange={e => setEwayBillNo(e.target.value)}
                  className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-sm" 
                  maxLength={12}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
             <Button 
               variant="outline" 
               className="flex-1 h-16 rounded-[1.5rem] font-bold text-slate-400 uppercase tracking-widest text-[10px]"
               onClick={() => setConfirmDispatch(false)}
             >
               Abort
             </Button>
             <Button 
               className="flex-[2] h-16 rounded-[1.5rem] bg-indigo-600 text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-indigo-600/20"
               onClick={dispatchOrder}
               disabled={busy || !vehicleNumber || !driverName}
             >
               {busy ? "Confirming..." : "Finalize & Dispatch"}
             </Button>
          </div>
        </div>
      </ResponsiveDialog>

      <ResponsiveDialog 
        open={confirmDeliver} 
        onOpenChange={setConfirmDeliver}
        title="Delivery Confirmation"
      >
        <div className="space-y-6 pt-2 pb-6">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Completion Date & Time</Label>
              <Input 
                type="datetime-local" 
                value={dateVal} 
                onChange={e => setDateVal(e.target.value)}
                className="h-14 rounded-2xl bg-slate-50 border-none font-bold text-sm" 
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Receiver's Note / Remarks</Label>
              <Textarea 
                value={deliveryNote} 
                onChange={e => setDeliveryNote(e.target.value)}
                placeholder="Proof of delivery details or special remarks..." 
                className="rounded-3xl bg-slate-50 border-none font-bold text-sm p-5 h-32 resize-none" 
              />
            </div>
          </div>

          <div className="flex gap-3">
             <Button 
               variant="outline" 
               className="flex-1 h-16 rounded-[1.5rem] font-bold text-slate-400 uppercase tracking-widest text-[10px]"
               onClick={() => setConfirmDeliver(false)}
             >
               Back
             </Button>
             <Button 
               className="flex-[2] h-16 rounded-[1.5rem] bg-emerald-600 text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-xl shadow-emerald-600/20"
               onClick={deliverOrder}
               disabled={busy}
             >
               {busy ? "Saving..." : "Acknowledge Delivery"}
             </Button>
          </div>
        </div>
      </ResponsiveDialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent className="rounded-3xl border-2 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel This Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Stock will be restored and the invoice voided. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction onClick={cancelOrder} disabled={busy}
              className="bg-destructive text-white">
              {busy ? "Cancelling..." : "Yes, Cancel Order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRevertEdit} onOpenChange={setConfirmRevertEdit}>
        <AlertDialogContent className="rounded-3xl border-2 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Revert Order to Edit?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                This order is <strong>{order?.status}</strong>. Editing it will:
                <ul className="mt-2 pl-5 list-disc space-y-1">
                  <li>Reset status back to <strong>Approved</strong></li>
                  <li>Void the existing invoice</li>
                  <li>Restore deducted stock to inventory</li>
                </ul>
                <p className="mt-2 italic">You will need to re-bill and re-dispatch after editing.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel — Keep as {order?.status}</AlertDialogCancel>
            <AlertDialogAction onClick={performRevertAndEdit}>
              Yes, Revert & Edit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 border-b border-slate-50 last:border-0">
      <span className={cn(
        "text-xs font-medium text-slate-500", 
        bold && "text-slate-900 font-semibold"
      )}>
        {label}
      </span>
      <span className={cn(
        "text-xs tabular-nums text-right", 
        bold ? "font-bold text-slate-900" : "text-slate-700"
      )}>
        {value}
      </span>
    </div>
  );
}


