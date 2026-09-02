import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download, Eye, Loader2, X } from "lucide-react";
import { generateInvoicePDF } from "@/lib/invoice-pdf";
import { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Shop = Database["public"]["Tables"]["shops"]["Row"];

interface InvoicePDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    invoice: Invoice;
    order: { 
      order_number: string; 
      order_date?: string | null; 
      delivered_at?: string | null; 
      created_at?: string | null 
    };
    shop: Shop;
    items: {
      name: string;
      sku: string;
      unit: string;
      quantity: number;
      unit_price: number;
      gst_rate: number;
      line_total: number;
    }[];
  };
}

export const InvoicePDFPreviewModal: React.FC<InvoicePDFPreviewModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [format, setFormat] = useState<'A4' | '80mm'>('A4');

  useEffect(() => {
    let currentUrl: string | null = null;
    if (isOpen) {
      setLoading(true);
      generateInvoicePDF({ ...data, format }).then(doc => {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        currentUrl = url;
        setPdfUrl(url);
        setLoading(false);
      });
    }

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      setPdfUrl(null);
    };
  }, [isOpen, data, format]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = `Invoice_${data.invoice.invoice_number}_${format}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl h-[90vh] bg-white p-0 overflow-hidden rounded-[2.5rem] border-0 shadow-2xl flex flex-col">
        <DialogHeader className="p-8 bg-slate-900 text-white flex flex-row items-center justify-between space-y-0">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-2xl font-black tracking-tight flex items-center gap-4">
              <Eye className="h-6 w-6 text-brand-primary" /> 
              <span>Invoice Preview</span>
              <div className="flex bg-white/10 p-1 rounded-xl ml-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setFormat('A4')}
                  className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-4 h-8 rounded-lg transition-all",
                    format === 'A4' ? "bg-brand-primary text-white" : "text-white/40 hover:text-white"
                  )}
                >
                  A4 Page
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setFormat('80mm')}
                  className={cn(
                    "text-[10px] font-black uppercase tracking-widest px-4 h-8 rounded-lg transition-all",
                    format === '80mm' ? "bg-brand-primary text-white" : "text-white/40 hover:text-white"
                  )}
                >
                  80mm Roll
                </Button>
              </div>
            </DialogTitle>
            <DialogDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">
              Ref: {data.invoice.invoice_number} · {data.shop.name}
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white/40 hover:text-white hover:bg-white/10 rounded-xl">
            <X className="h-6 w-6" />
          </Button>
        </DialogHeader>
        
        <div className="flex-1 bg-slate-100 relative overflow-hidden">
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Generating Document...</p>
            </div>
          ) : pdfUrl ? (
            <iframe 
              src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`} 
              className={cn(
                "h-full border-0 shadow-inner transition-all duration-500 mx-auto",
                format === '80mm' ? "w-[400px]" : "w-full"
              )}
              title="Invoice Preview"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-destructive font-bold">
              Failed to load preview
            </div>
          )}
        </div>

        <DialogFooter className="p-8 bg-white border-t border-slate-100 flex gap-4 md:flex-row flex-col">
          <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest self-center text-center md:text-left">
            Layout: {format === 'A4' ? 'ISO Standard A4 (210x297mm)' : 'Thermal Roll (80mm Continuous)'}
          </div>
          <div className="flex gap-3">
             <Button variant="outline" onClick={handleDownload} className="rounded-2xl h-14 px-8 font-black text-[10px] uppercase tracking-widest border-2 hover:bg-slate-50">
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            <Button onClick={handlePrint} className="bg-slate-900 hover:bg-slate-800 text-white rounded-2xl h-14 px-10 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-slate-900/20">
              <Printer className="mr-2 h-4 w-4" /> Print {format}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

