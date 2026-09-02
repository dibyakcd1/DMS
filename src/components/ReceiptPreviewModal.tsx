import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";

interface ReceiptPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewLines: Record<string, unknown>[];
  onPrint: () => void;
}

export const ReceiptPreviewModal: React.FC<ReceiptPreviewModalProps> = ({
  isOpen,
  onClose,
  previewLines,
  onPrint,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-brand-primary text-white">
          <DialogTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <Printer className="h-5 w-5" /> Receipt Preview
          </DialogTitle>
        </DialogHeader>
        
        <div className="p-8 bg-muted/30">
          <div className="bg-white p-6 shadow-sm border border-border/50 rounded-xl font-mono text-[10px] space-y-1">
            {previewLines.map((line, i) => (
              <div key={i} className="flex justify-between">
                {line.type === 'divider' ? (
                  <div className="w-full border-t border-dashed border-gray-300 my-2" />
                ) : (
                  <>
                    <span>{line.value || line.name || ''}</span>
                    <span>{line.qty ? `x${line.qty} ${line.amount}` : line.value ? '' : ''}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="p-6 bg-white border-t border-border/40 gap-3">
          <Button variant="outline" onClick={onClose} className="rounded-xl font-bold uppercase text-[10px] tracking-widest">
            Cancel
          </Button>
          <Button onClick={onPrint} className="bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl font-black uppercase text-[10px] tracking-widest px-8 shadow-brand">
            Print Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
