import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Scale } from "lucide-react";
import { InvoiceData } from "@/printer/InvoiceData.types";
import { fmtINR } from "@/lib/format";

interface InvoicePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: InvoiceData;
  onPrint: () => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  onClose,
  data,
  onPrint,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-brand-primary text-white">
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <Printer className="h-5 w-5" /> Thermal Invoice
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-8 bg-muted/30 max-h-[60vh] overflow-y-auto">
          <div className="bg-white p-8 shadow-sm border border-border/50 rounded-xl font-mono text-[10px] space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-sm font-black uppercase tracking-tighter">{data.businessName}</h3>
              <p className="opacity-70">{data.businessTagline}</p>
              <p className="opacity-70">{data.businessAddress}</p>
            </div>
            
            <div className="border-t border-dashed border-border py-2 space-y-0.5">
              <p>MEMO: {data.memoNumber}</p>
              <p>DATE: {data.date}</p>
              <p>ORDER: {data.orderNumber}</p>
              <p>BILL TO: {data.billTo}</p>
            </div>

            <table className="w-full border-t border-dashed border-border pt-2">
              <thead>
                <tr className="text-left border-b border-dashed border-border">
                  <th className="py-1">ITEM</th>
                  <th className="text-right py-1">QTY</th>
                  <th className="text-right py-1">UNIT</th>
                  <th className="text-right py-1">AMT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dashed divide-border">
                {data.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-1 pr-2">
                      <div className="font-bold">{item.product}</div>
                    </td>
                    <td className="text-right py-1 align-top">{item.qty}</td>
                    <td className="text-right py-1 align-top">{item.unit || "Unit"}</td>
                    <td className="text-right py-1 align-top">{fmtINR(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed border-border pt-2 space-y-1">
              <div className="flex justify-between">
                <span>SUBTOTAL:</span>
                <span>{fmtINR(data.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST:</span>
                <span>{fmtINR(data.gst)}</span>
              </div>
              <div className="flex justify-between text-sm font-black">
                <span>TOTAL:</span>
                <span>{fmtINR(data.total)}</span>
              </div>
            </div>

            <div className="text-center pt-4 opacity-70 text-[8px]">
              {data.footerNote}
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 bg-white border-t border-border/40 gap-3">
          <Button variant="outline" onClick={onClose} className="rounded-xl font-bold uppercase text-[10px] tracking-widest">
            Close
          </Button>
          <Button onClick={onPrint} className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl font-black uppercase text-[10px] tracking-widest px-8 shadow-brand">
            Print thermal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
