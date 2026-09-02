import * as React from "react";
import { type Product } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, ChevronRight } from "lucide-react";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StockBreakdownDisplay } from "@/components/StockBreakdownDisplay";

function getCategoryColor(cat?: string | null): string {
  const c = (cat || "").toLowerCase();
  if (c.includes("spice")) return "bg-orange-50 text-orange-600";
  if (c.includes("beverage") || c.includes("drink")) return "bg-blue-50 text-blue-600";
  if (c.includes("dairy") || c.includes("milk")) return "bg-sky-50 text-sky-700";
  if (c.includes("snack") || c.includes("namkeen")) return "bg-yellow-50 text-yellow-700";
  if (c.includes("oil") || c.includes("ghee")) return "bg-amber-50 text-amber-700";
  if (c.includes("pulse") || c.includes("dal")) return "bg-emerald-50 text-emerald-600";
  if (c.includes("flour") || c.includes("grain")) return "bg-stone-100 text-stone-600";
  if (c.includes("sauce") || c.includes("condiment") || c.includes("ketchup")) return "bg-red-50 text-red-600";
  if (c.includes("personal") || c.includes("care")) return "bg-pink-50 text-pink-600";
  if (c.includes("household")) return "bg-violet-50 text-violet-600";
  return "bg-slate-100 text-slate-600";
}

interface ProductTableRowProps {
  product: Product;
  onClick: () => void;
}

export const ProductTableRow = ({ product: p, onClick }: ProductTableRowProps) => {
  const qty = p.inventory?.quantity ?? 0;
  const low = qty <= (p.min_stock || 0);

  return (
    <div 
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-4 py-4 px-6 border-b border-slate-100 last:border-none cursor-pointer transition-all hover:bg-slate-50/80 bg-white", 
        !p.is_active ? "opacity-50" : "opacity-100"
      )} 
    >
      {/* TE Logo / Brand Icon */}
      <div className={cn(
        "h-14 w-14 rounded-2xl flex items-center justify-center text-xs font-black shadow-inner shrink-0 transition-all group-hover:rotate-3 group-hover:scale-105",
        getCategoryColor(p.division_category)
      )}>
        {p.company?.short_code || (p.brand === "TE" || p.brand === "BM" || !p.brand ? "TE" : p.brand.substring(0, 2).toUpperCase())}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Badge variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-none rounded-lg px-2 py-0.5 text-[9px] font-bold tracking-tight">
            {p.sku}
          </Badge>
          <span className="text-slate-400 text-[10px] font-bold uppercase tracking-tight">
            {p.division_category || "General"}
          </span>
          {!p.is_active && (
            <Badge className="bg-slate-100 text-slate-400 border-none rounded-lg px-2 py-0.5 text-[9px] font-bold tracking-tight">
              Inactive
            </Badge>
          )}
        </div>
        
        <h4 className="font-bold text-slate-900 text-sm leading-tight mb-1 group-hover:text-primary transition-colors">
          {p.name}
        </h4>
        
        <div className="flex items-center gap-3">
          <span className="font-black text-slate-900 text-sm tracking-tight">{fmtINR(p.mrp)}</span>
          <span className="text-slate-400 text-[10px] font-black tracking-widest uppercase">MRP</span>
          <Badge className={cn(
            "border-none rounded-full px-2.5 py-0.5 text-[9px] font-black shadow-sm",
            qty > 50 ? "bg-emerald-100 text-emerald-700" : qty > 10 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
          )}>
            {qty} units
          </Badge>
        </div>
      </div>
      
      <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-primary transition-colors" />
        {p.inventory?.avg_landed_cost && p.mrp && p.mrp > 0 && p.inventory.avg_landed_cost > 0 && (
           <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
             {Math.max(0, Math.min(40, ((p.mrp - p.inventory.avg_landed_cost) / p.mrp) * 100)).toFixed(0)}% MGN
           </span>
        )}
      </div>
    </div>
  );
};
