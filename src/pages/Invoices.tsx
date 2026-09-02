import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { COMPANY_NAME, COMPANY_TAGLINE } from "@/lib/config";
import { Search, ClipboardList, Settings2, Trash2, Calendar, Loader2, FileText, ChevronRight, Printer } from "lucide-react";
import { fmtDate, fmtINR, fmtCompactINR, payStatusLabel } from "@/lib/format";
import { resolveDisplayUnit } from "@/lib/unitLabel";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { Button } from "@/components/ui/button";
import { useFilters } from "@/hooks/useFilters";
import { useInvoices, useVoidInvoice } from "@/hooks/useInvoices";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useIsMobile } from "@/lib/responsive";
import { usePrinter } from "@/printer/PrinterContextCore";
import { ThermalReceiptBuilder } from "@/printer/ThermalReceiptBuilder";
import { InvoiceData as ThermalInvoiceData } from "@/printer/InvoiceData.types";
import { InvoicePreviewModal } from "@/components/invoice/InvoicePreviewModal";
import { supabase } from "@/integrations/supabase/client";
import { resolveEffectiveGstRate } from "@/lib/company-helpers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Cancelled" },
];

import { 
  ResponsiveContainer, 
  AdaptiveTable 
} from "@/components/ui/responsive-ui";
import { ListCard } from "@/components/ListCard";

interface ExpandedInvoice {
  id: string;
  invoice_number: string;
  payment_status: string;
  type: string;
  total: number;
  amount_paid: number;
  is_void: boolean;
  created_at: string;
  order_number: string;
  order_status: string;
  order_date: string;
  shop_name: string;
  shop_id: string;
  order_id: string;
}

export default function Invoices() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const shadowRef = React.useRef<HTMLDivElement>(null);
  const initialStatusValue = searchParams.get("status") || "all";
  const initialStatus = STATUS_FILTERS.find(f => f.value === initialStatusValue)?.label || "All";
  
  const { 
    state, 
    debouncedSearch, 
    setSearch, 
    setCategory, 
    reset: clearFilters 
  } = useFilters({ category: initialStatus });

  const navigate = useNavigate();

  const statusFilter = STATUS_FILTERS.find(f => f.label === state.category)?.value || 'all';
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading
  } = useInvoices(debouncedSearch, statusFilter);

  const voidMutation = useVoidInvoice();
  const { print } = usePrinter();
  const [printingId, setPrintingId] = React.useState<string | null>(null);
  const [previewData, setPreviewData] = React.useState<ThermalInvoiceData | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkPrint = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    
    const tid = toast.loading(`Preparing ${ids.length} invoices for print...`);
    try {
      const selectedInvoices = allInvoices.filter(i => selectedIds.has(i.id));
      for (const inv of selectedInvoices) {
        // Fetch items sequentially or use Promise.all. 
        // For thermal printing, a serial approach might be safer for sequential spooling.
        const { data: items } = await supabase
          .from('order_items')
          .select('*, product:products(*)')
          .eq('order_id', inv.order_id);
        const { data: order } = await supabase.from('orders').select('*').eq('id', inv.order_id).single();
        
        if (items && order) {
          const orderDateStr = fmtDate(order.order_date || order.created_at || inv.created_at);
          const deliveryDateStr = order.delivered_at ? fmtDate(order.delivered_at) : (order.status === 'delivered' ? 'Delivered' : 'Pending');

          const computedGst = Number(order.gst_total) > 0 
            ? Number(order.gst_total)
            : items.reduce((acc, item) => {
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
                  product: item.product as Partial<Product> | null
                });
                return acc + (price * qty * (rate / 100));
              }, 0);

          const thermalData: ThermalInvoiceData = {
            businessName: COMPANY_NAME,
            businessTagline: "Bulk Print Run",
            memoNumber: inv.invoice_number,
            date: orderDateStr,
            orderDate: orderDateStr,
            deliveryDate: deliveryDateStr,
            orderNumber: inv.order_number,
            billTo: inv.shop_name,
            items: items.map((item, idx) => {
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
                product: item.product as Partial<Product> | null
              });
              const lineExclusive = Number(item.unit_price) * Number(item.quantity);
              const lineTax = lineExclusive * (effGst / 100);
              return {
                srNo: idx + 1,
                product: (item.product as { name?: string } | null)?.name || "Unknown",
                variant: resolveDisplayUnit(item.pack_type, item.product as Partial<Product> | null),
                unit: resolveDisplayUnit(item.pack_type, item.product as Partial<Product> | null),
                sku: (item.product as { sku?: string } | null)?.sku || "N/A",
                qty: Number(item.quantity),
                rate: Number(item.unit_price),
                gst: `${effGst}%`,
                amount: lineExclusive + lineTax
              };
            }),
            subtotal: Number(order.subtotal),
            gst: computedGst,
            discount: Number(order.discount_amount || 0),
            total: Number(inv.total),
            footerNote: "EOD Batch Copy"
          };
          
          const builder = new ThermalReceiptBuilder();
          const bytes = builder.buildInvoice(thermalData);
          await print(bytes);
        }
      }
      toast.success(`Sent ${ids.length} invoices to printer`, { id: tid });
      setSelectedIds(new Set());
    } catch (err) {
      toast.error("Bulk print failed", { id: tid });
    }
  };
  const handlePrint = async (inv: ExpandedInvoice) => {
    if (!inv.order_id) {
      toast.error("Cannot locate items for this record.");
      return;
    }
    setPrintingId(inv.id);
    try {
      // 1. Fetch order items
      const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select('*, product:products(*)')
        .eq('order_id', inv.order_id);
      
      if (itemsErr) throw itemsErr;

      // 2. Fetch order details (for subtotal/gst)
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('*')
        .eq('id', inv.order_id)
        .single();
      
      if (orderErr) throw orderErr;

      // 3. Format for thermal printer
      const orderDateStr = fmtDate(order.order_date || order.created_at || inv.created_at);
      const deliveryDateStr = order.delivered_at ? fmtDate(order.delivered_at) : (order.status === 'delivered' ? 'Delivered' : 'Pending');

      const computedGst = Number(order.gst_total) > 0 
        ? Number(order.gst_total)
        : items.reduce((acc, item) => {
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
              product: item.product as Partial<Product> | null
            });
            return acc + (price * qty * (rate / 100));
          }, 0);

      const thermalData: ThermalInvoiceData = {
        businessName: COMPANY_NAME,
        businessTagline: COMPANY_TAGLINE,
        memoNumber: inv.invoice_number,
        date: orderDateStr,
        orderDate: orderDateStr,
        deliveryDate: deliveryDateStr,
        orderNumber: inv.order_number,
        billTo: inv.shop_name,
        items: items.map((item, idx) => {
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
            product: item.product as Partial<Product> | null
          });
          const lineExclusive = Number(item.unit_price) * Number(item.quantity);
          const lineTax = lineExclusive * (effGst / 100);
          return {
            srNo: idx + 1,
            product: (item.product as { name?: string } | null)?.name || "Unknown",
            variant: resolveDisplayUnit(item.pack_type, item.product as Partial<Product> | null),
            unit: resolveDisplayUnit(item.pack_type, item.product as Partial<Product> | null),
            sku: (item.product as { sku?: string } | null)?.sku || "N/A",
            qty: Number(item.quantity),
            rate: Number(item.unit_price),
            gst: `${effGst}%`,
            amount: lineExclusive + lineTax
          };
        }),
        subtotal: Number(order.subtotal),
        gst: computedGst,
        discount: Number(order.discount_amount || 0),
        total: Number(inv.total),
        footerNote: "Computer generated ledger copy."
      };

      setPreviewData(thermalData);
    } catch (err: unknown) {
      console.error("Print error:", err);
      const message = err instanceof Error ? err.message : String(err);
      toast.error("Failed to load invoice data: " + message);
    } finally {
      setPrintingId(null);
    }
  };

  const allInvoices = React.useMemo(() => {
    return data?.pages.flatMap(p => p.data) || [];
  }, [data]);

  React.useEffect(() => {
    const nextParams = new URLSearchParams(searchParams);
    if (state.category === "All") {
      nextParams.delete("status");
    } else {
      const val = STATUS_FILTERS.find(f => f.label === state.category)?.value || state.category.toLowerCase();
      nextParams.set("status", val);
    }
    setSearchParams(nextParams);
  }, [state.category, setSearchParams, searchParams]);

  const totalBalance = React.useMemo(() => {
    return allInvoices.reduce((acc, i) => acc + (Number(i.total || 0) - Number(i.amount_paid || 0)), 0);
  }, [allInvoices]);

  const categories = STATUS_FILTERS.map(f => ({ label: f.label }));

  return (
    <ResponsiveContainer className="space-y-6 pb-24 px-4 sm:px-0">
      <PageHeader 
        title="Invoices" 
        titleColor="var(--color-brand-primary)"
        onBack={() => navigate("/")}
        action={selectedIds.size > 0 && (
          <Button 
            className="rounded-2xl font-black uppercase tracking-widest text-xs h-11 px-6 shadow-xl shadow-brand-primary/20 bg-brand-primary text-white"
            onClick={handleBulkPrint}
          >
            <Printer size={16} className="mr-2" />
            Print Selected ({selectedIds.size})
          </Button>
        )}
      />

      <SearchFilterBar 
        categories={categories}
        filters={[]}
        totalCount={allInvoices.length}
        currentSearch={state.search}
        currentCategory={state.category}
        currentFilters={{}}
        onSearchChange={setSearch}
        onCategoryChange={setCategory}
        onFilterChange={() => {}}
        onClearFilters={clearFilters}
      />

      <AdaptiveTable
        data={allInvoices}
        isLoading={isLoading}
        onRowClick={(inv) => navigate(`/invoices/${inv.id}`)}
        emptyMessage={
          debouncedSearch 
            ? "No invoices found matching your search." 
            : state.category === "All" 
              ? "No invoices found."
              : `No ${state.category.toLowerCase()} invoices found.`
        }
        columns={[
          {
            header: (
              <div className="flex items-center justify-center">
                <input 
                  type="checkbox" 
                  className="h-5 w-5 rounded-lg border-2 border-slate-200 text-brand-primary focus:ring-brand-primary cursor-pointer transition-all"
                  checked={selectedIds.size > 0 && selectedIds.size === allInvoices.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(allInvoices.map(i => i.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                />
              </div>
            ),
            id: "select",
            className: "w-10 px-4",
            render: (inv: ExpandedInvoice) => (
              <div onClick={e => e.stopPropagation()} className="flex items-center justify-center">
                 <input 
                  type="checkbox" 
                  className="h-5 w-5 rounded-lg border-2 border-slate-200 text-brand-primary focus:ring-brand-primary cursor-pointer transition-all"
                  checked={selectedIds.has(inv.id)}
                  onChange={() => toggleSelect(inv.id)}
                 />
              </div>
            )
          },
          {
            header: "Shop",
            render: (inv: ExpandedInvoice) => (
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                  inv.payment_status === "paid" ? "bg-emerald-100/30 text-emerald-600" :
                  inv.payment_status === "partial" ? "bg-amber-100/30 text-amber-600" :
                  "bg-rose-100/30 text-rose-600"
                )}>
                  <FileText size={18} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-black text-slate-900 leading-tight">{inv.shop_name || "Unknown Client"}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold text-slate-400 font-mono tracking-tight">{inv.invoice_number}</span>
                    {inv.order_number && (
                      <span className="text-[10px] font-bold text-brand-primary/60 font-mono tracking-tight">#{inv.order_number}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          },
          {
            header: "Order & Delivery",
            render: (inv: ExpandedInvoice) => (
              <div className="flex flex-col">
                <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest px-2 h-5 border-slate-200 bg-slate-50 text-slate-500 w-fit">
                  {inv.order_status?.replace('_', ' ') || 'N/A'}
                </Badge>
                <span className="text-[10px] font-bold text-slate-700 mt-1">{fmtDate(inv.order_date || inv.created_at)}</span>
                <span className="text-[9px] font-medium text-slate-400">{inv.delivered_at ? `Delivered: ${fmtDate(inv.delivered_at)}` : (inv.order_status === 'delivered' ? 'Delivered' : 'Delivery: Pending')}</span>
              </div>
            )
          },
          {
            header: "Status",
            id: "status",
            render: (inv: ExpandedInvoice) => (
              <Badge variant="outline" className={cn(
                "px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border-none shadow-none",
                inv.payment_status === "paid" ? "bg-emerald-50 text-emerald-700" :
                inv.payment_status === "partial" ? "bg-amber-50 text-amber-700" :
                "bg-rose-50 text-rose-700"
              )}>
                {payStatusLabel[inv.payment_status || "unpaid"]}
              </Badge>
            )
          },
          {
            header: "Total",
            id: "amount",
            className: "text-right",
            render: (inv: ExpandedInvoice) => (
              <div className="flex flex-col items-end">
                <span className="font-black tabular-nums text-slate-900">{fmtINR(inv.total)}</span>
                {Number(inv.total) - Number(inv.amount_paid) > 0 && (
                  <span className="text-[10px] font-black text-rose-500 tabular-nums">-{fmtINR(Number(inv.total) - Number(inv.amount_paid))}</span>
                )}
              </div>
            )
          },
          {
            header: "Order Date",
            id: "date",
            className: "text-muted-foreground font-medium text-right",
            hideOnMobile: true,
            render: (inv: ExpandedInvoice) => fmtDate(inv.order_date || inv.created_at)
          },
          {
            header: "",
            id: "actions",
            className: "w-20",
            render: (inv: ExpandedInvoice) => (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-brand-primary hover:bg-brand-primary/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrint(inv);
                  }}
                  disabled={printingId === inv.id}
                >
                  {printingId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                </Button>
                <DropdownMenu tabIndex={-1}>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-lg hover:bg-slate-100 transition-all"
                    >
                      <Settings2 size={14} className="text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 rounded-2xl border-border shadow-2xl p-2">
                    <DropdownMenuItem 
                      className="text-rose-600 font-bold focus:bg-rose-50 focus:text-rose-700 cursor-pointer rounded-xl py-3"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!window.confirm("CRITICAL: Cancel this invoice?")) return;
                        
                        voidMutation.mutate(inv.id, {
                          onSuccess: () => toast.success("Invoice cancelled"),
                          onError: (error) => toast.error(friendlyError(error))
                        });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> 
                      Void Record
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          }
        ]}
        renderMobileCard={(inv: ExpandedInvoice) => (
          <div className="relative flex items-center gap-3">
            <div 
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(inv.id);
              }}
              className="px-1"
            >
              <input 
                type="checkbox" 
                className="h-6 w-6 rounded-lg border-2 border-slate-200 text-brand-primary focus:ring-brand-primary cursor-pointer transition-all"
                checked={selectedIds.has(inv.id)}
                readOnly
              />
            </div>
            <div className="flex-1 min-w-0">
              <ListCard 
                title={inv.shop_name || "Unknown Client"}
                className={cn(selectedIds.has(inv.id) && "border-brand-primary bg-brand-primary/5")}
                subtitle={`${inv.invoice_number} ${inv.order_number ? `· #${inv.order_number}` : ''}`}
                badge={
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge variant="outline" className={cn(
                      "px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border-none shadow-none",
                      inv.payment_status === "paid" ? "bg-emerald-50 text-emerald-700" :
                      inv.payment_status === "partial" ? "bg-amber-50 text-amber-700" :
                      "bg-rose-50 text-rose-700"
                    )}>
                      {payStatusLabel[inv.payment_status || "unpaid"]}
                    </Badge>
                    <Badge variant="outline" className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter h-4 border-slate-100 text-slate-400">
                      {inv.order_status?.replace('_', ' ') || 'N/A'}
                    </Badge>
                    <Button 
                      size="icon" 
                      variant="outline" 
                      className="h-8 w-8 rounded-full border-slate-100 bg-white shadow-sm mt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrint(inv);
                      }}
                      disabled={printingId === inv.id}
                    >
                      {printingId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} className="text-brand-primary" />}
                    </Button>
                  </div>
                }
                meta={
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Balance</span>
                      <span className={cn(
                        "text-lg font-black tracking-tighter",
                        Number(inv.total) - Number(inv.amount_paid) > 0 ? "text-rose-500" : "text-emerald-600"
                      )}>
                        {fmtINR(inv.total - inv.amount_paid)}
                      </span>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</p>
                       <p className="text-xs font-bold text-slate-900">{fmtINR(inv.total)}</p>
                    </div>
                  </div>
                }
                onClick={() => navigate(`/invoices/${inv.id}`)}
              />
            </div>
          </div>
        )}
      />

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-xl font-bold text-xs uppercase h-11 px-8 border-slate-200"
          >
            {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Load More Records
          </Button>
        </div>
      )}

      {previewData && (
        <InvoicePreviewModal
          isOpen={!!previewData}
          onClose={() => setPreviewData(null)}
          data={previewData}
          onPrint={async () => {
            const builder = new ThermalReceiptBuilder();
            const bytes = builder.buildInvoice(previewData);
            setPreviewData(null);
            await print(bytes);
          }}
        />
      )}
    </ResponsiveContainer>
  );
}
