import * as React from "react";
import { type Product } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, ChevronRight, Copy, Trash2 } from "lucide-react";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getCompactStockString } from "@/lib/packaging";
import { normalizeDivisionCategory } from "@/lib/taxonomy";
import { Button } from "@/components/ui/button";

interface ProductCardProps {
  product: Product;
  onClick: () => void;
  onClone?: (id: string, e: React.MouseEvent) => void;
  onDelete?: (id: string, name: string, e: React.MouseEvent) => void;
  viewMode?: 'list' | 'grid';
}

export const ProductCard = ({ product: p, onClick, onClone, onDelete, viewMode = 'list' }: ProductCardProps) => {
  const qty = p.inventory?.quantity ?? 0;
  const isActuallyInactive = !p.is_active || qty === 0;
  
  if (viewMode === 'grid') {
    return (
      <div 
        onClick={onClick}
        className={cn(
          "group relative flex flex-col p-4 rounded-2xl border bg-white cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] min-h-[210px] h-auto", 
          isActuallyInactive ? "opacity-50 grayscale border-dashed border-slate-300" : "border-border/40 hover:border-slate-900/10"
        )} 
      >
        <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none rounded-full px-2 py-0.5 h-auto text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
              {p.sku}
            </Badge>
            {p.company && (
              <span
                className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                style={{
                  background: p.company.accent_hex + '18',
                  color: p.company.accent_hex
                }}
              >
                {p.company.short_code}
              </span>
            )}
            {onClone && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5 rounded-md hover:bg-slate-100 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Clone Product"
                onClick={(e) => onClone(p.id, e)}
              >
                <Copy size={10} />
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-5 w-5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Delete Product & Stock"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p.id, p.name, e);
                }}
              >
                <Trash2 size={10} />
              </Button>
            )}
          </div>
          
          <Badge className={cn(
             "border-none rounded-xl px-2.5 py-1 text-[10px] font-bold shadow-sm whitespace-normal break-words leading-tight text-center shrink-0 max-w-full ml-auto",
             qty > 100 ? "bg-emerald-50 text-emerald-700" : qty > 10 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
          )}>
            {getCompactStockString(qty, p)}
          </Badge>
        </div>

        <div className="flex-1 min-w-0 mb-3">
          <h4 className="font-semibold text-slate-900 text-sm leading-snug break-words group-hover:text-slate-900 transition-colors">
            {p.name}
          </h4>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1 break-words">
            {p.division_category || normalizeDivisionCategory(p.division_category, p.name, p.hsn)}
          </p>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-50 gap-2">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">MRP</span>
            <span className="font-bold text-slate-900 text-base tabular-nums leading-none">{fmtINR(p.mrp)}</span>
          </div>
          
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Landed</span>
            <span className="font-semibold text-slate-500 text-xs tabular-nums leading-none">{fmtINR(p.inventory?.avg_landed_cost || 0)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-4 py-4 px-5 border-b border-border/10 last:border-none cursor-pointer transition-all hover:bg-slate-50/50 bg-white text-left", 
        isActuallyInactive ? "opacity-40 grayscale select-none" : "opacity-100"
      )} 
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-none rounded-full px-2 py-0.5 h-auto text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
            {p.sku}
          </Badge>
          {p.company && (
            <span
              className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
              style={{
                background: p.company.accent_hex + '18',
                color: p.company.accent_hex
              }}
            >
              {p.company.short_code}
            </span>
          )}
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap opacity-60">
            {p.division_category || normalizeDivisionCategory(p.division_category, p.name, p.hsn)}
          </span>
          {isActuallyInactive && (
            <Badge className="bg-rose-50 text-rose-500 border-none rounded-full px-2 py-0.5 h-auto text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
              {qty === 0 ? "Empty" : "Inactive"}
            </Badge>
          )}
        </div>
        
        <h4 className="font-semibold text-slate-900 text-sm leading-snug mb-3 pr-1 group-hover:text-slate-900 transition-colors break-words">
          {p.name}
        </h4>
        
        <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">MRP</span>
            <span className="font-bold text-slate-900 text-base tabular-nums leading-none">{fmtINR(p.mrp)}</span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Landed</span>
            <span className="font-semibold text-slate-500 text-xs tabular-nums leading-none">{fmtINR(p.inventory?.avg_landed_cost || 0)}</span>
          </div>
          
          <div className={cn(
            "border-none rounded-xl px-3 py-1 text-[10px] font-bold shadow-sm flex items-center justify-center whitespace-normal break-words leading-tight ml-auto text-center max-w-[200px]",
            qty > 100 ? "bg-emerald-50 text-emerald-700" : qty > 10 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
          )}>
            {getCompactStockString(qty, p)}
          </div>

          {onClone && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Clone Product"
              onClick={(e) => {
                e.stopPropagation();
                onClone(p.id, e);
              }}
            >
              <Copy size={14} />
            </Button>
          )}

          {onDelete && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              title="Delete Product & Stock"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(p.id, p.name, e);
              }}
            >
              <Trash2 size={14} />
            </Button>
          )}
        </div>
      </div>
      
      <div className="shrink-0 hidden sm:flex items-center ml-2">
        <ChevronRight className="h-5 w-5 text-slate-300 transition-transform group-hover:translate-x-1" />
      </div>
    </div>
  );
};
