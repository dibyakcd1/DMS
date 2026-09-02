import React from "react";
import { Package, Inbox, Layers, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { Product } from "@/types";
import { getDetailedStockBreakdown } from "@/lib/packaging";
import { resolveDisplayUnit } from "@/lib/unitLabel";

interface StockBreakdownDisplayProps {
  stockBaseUnits: number;
  product: Partial<Product>;
  className?: string;
  variant?: "compact" | "full";
}

export const StockBreakdownDisplay: React.FC<StockBreakdownDisplayProps> = ({
  stockBaseUnits,
  product,
  className,
  variant = "full"
}) => {
  const breakdown = getDetailedStockBreakdown(stockBaseUnits, product);
  const unitLabel = resolveDisplayUnit('pcs', product);
  
  const isWeightApplicable = product.unit_type === 'kg_g' || (product.weight_per_unit_grams || 0) > 0;
  
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
        {breakdown.hasCases && (
          <span className={cn(
            "flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-md border transition-all shadow-sm",
            breakdown.cases > 0 ? "text-amber-700 bg-amber-50 border-amber-200 shadow-amber-500/5" : "text-slate-400 bg-slate-50 border-slate-100 opacity-60"
          )}>
            <Inbox className={cn("h-2.5 w-2.5", breakdown.cases > 0 && "text-amber-500")} /> {breakdown.cases} CS
          </span>
        )}
        {breakdown.hasPackets && (
          <span className={cn(
            "flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-md border transition-all shadow-sm",
            breakdown.packets > 0 ? "text-blue-700 bg-blue-50 border-blue-200 shadow-blue-500/5" : "text-slate-400 bg-slate-50 border-slate-100 opacity-60"
          )}>
            <Layers className={cn("h-2.5 w-2.5", breakdown.packets > 0 && "text-blue-500")} /> {breakdown.packets} PKT
          </span>
        )}
        <span className={cn(
          "flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-md border transition-all shadow-sm",
          breakdown.units > 0 ? "text-emerald-700 bg-emerald-50 border-emerald-200 shadow-emerald-500/5" : "text-slate-400 bg-slate-50 border-slate-100 opacity-60"
        )}>
          <Package className={cn("h-2.5 w-2.5", breakdown.units > 0 && "text-emerald-500")} /> {breakdown.units} {unitLabel.toUpperCase()}
        </span>
        {isWeightApplicable && (
          <span className="flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-md border text-slate-500 bg-slate-100 border-slate-200 ml-auto whitespace-nowrap">
            <Scale className="h-2.5 w-2.5 opacity-50" /> {breakdown.weightValue.toFixed(breakdown.weightValue >= 10 ? 1 : 2)} {breakdown.weightUnit.toUpperCase()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400/80">Inventory Distribution</span>
        {isWeightApplicable && (
          <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-900 bg-white/95 shadow-sm border border-slate-100 px-3 py-1.5 rounded-xl">
            <Scale className="h-3.5 w-3.5 text-slate-400" />
            {breakdown.weightValue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} <span className="text-[9px] opacity-40">{breakdown.weightUnit.toUpperCase()}</span>
          </div>
        )}
      </div>

      <div className={cn(
        "grid gap-3",
        breakdown.hasCases && breakdown.hasPackets ? "grid-cols-3" : 
        breakdown.hasCases || breakdown.hasPackets ? "grid-cols-2" : "grid-cols-1"
      )}>
        {/* Cases */}
        {breakdown.hasCases && (
            <div className={cn(
              "relative overflow-hidden group p-4 rounded-[1.5rem] border-2 transition-all duration-500 flex flex-col items-center justify-center text-center",
              breakdown.cases > 0 
                ? "bg-amber-50/30 border-amber-200/50 shadow-[0_8px_20px_rgba(245,158,11,0.08)] hover:scale-[1.02]" 
                : "bg-slate-50/50 border-slate-100/80 opacity-40 grayscale"
            )}>
              {breakdown.cases > 0 && <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />}
              <div className={cn(
                "h-10 w-10 rounded-2xl flex items-center justify-center mb-2 transition-all duration-500",
                breakdown.cases > 0 ? "bg-amber-100 text-amber-600 shadow-inner group-hover:rotate-12" : "bg-slate-100 text-slate-300"
              )}>
                <Inbox className="h-6 w-6" />
              </div>
              <div className="text-xl font-black text-slate-900 tracking-tighter leading-none">{breakdown.cases}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">Cases</div>
            </div>
        )}

        {/* Packets */}
        {breakdown.hasPackets && (
          <div className={cn(
            "relative overflow-hidden group p-4 rounded-[1.5rem] border-2 transition-all duration-500 flex flex-col items-center justify-center text-center",
            breakdown.packets > 0 
              ? "bg-blue-50/30 border-blue-200/50 shadow-[0_8px_20px_rgba(59,130,246,0.08)] hover:scale-[1.02]" 
              : "bg-slate-50/50 border-slate-100/80 opacity-40 grayscale"
          )}>
            {breakdown.packets > 0 && <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />}
            <div className={cn(
              "h-10 w-10 rounded-2xl flex items-center justify-center mb-2 transition-all duration-500",
              breakdown.packets > 0 ? "bg-blue-100 text-blue-600 shadow-inner group-hover:rotate-12" : "bg-slate-100 text-slate-300"
            )}>
              <Layers className="h-6 w-6" />
            </div>
            <div className="text-xl font-black text-slate-900 tracking-tighter leading-none">{breakdown.packets}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">Packets</div>
          </div>
        )}

        {/* Units */}
        <div className={cn(
          "relative overflow-hidden group p-4 rounded-[1.5rem] border-2 transition-all duration-500 flex flex-col items-center justify-center text-center",
          breakdown.units > 0 || (!breakdown.hasCases && !breakdown.hasPackets)
            ? "bg-emerald-50/30 border-emerald-200/50 shadow-[0_8px_20px_rgba(16,185,129,0.08)] hover:scale-[1.02]" 
            : "bg-slate-50/50 border-slate-100/80 opacity-40 grayscale"
        )}>
          {(breakdown.units > 0 || (!breakdown.hasCases && !breakdown.hasPackets)) && <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />}
          <div className={cn(
            "h-10 w-10 rounded-2xl flex items-center justify-center mb-2 transition-all duration-500",
            breakdown.units > 0 || (!breakdown.hasCases && !breakdown.hasPackets) ? "bg-emerald-100 text-emerald-600 shadow-inner group-hover:rotate-12" : "bg-slate-100 text-slate-300"
          )}>
            <Package className="h-6 w-6" />
          </div>
          <div className="text-xl font-black text-slate-900 tracking-tighter leading-none">{breakdown.units}</div>
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1.5">Loose {unitLabel}</div>
        </div>
      </div>
      
      {!breakdown.hasCases && !breakdown.hasPackets && (
        <div className="flex items-center justify-center gap-2 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest opacity-60">Linear Inventory Model</p>
            <div className="h-1.5 w-1.5 rounded-full bg-slate-200" />
        </div>
      )}
    </div>
  );
};
