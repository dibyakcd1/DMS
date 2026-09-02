import * as React from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtINR } from "@/lib/format";
import { type PricingProduct, detectLandedCostBasis, landedCostPerLevel, computeWacClient } from "@/lib/pricing";

interface BatchPriceVariancePanelProps {
  product: PricingProduct;
  existingWac: number;      // per pcs
  newBatchLanded: number;   // normalized to per pcs
  existingQty: number;      // total stock in pcs
  incomingQty: number;      // new stock in pcs
  breakdown?: {
    invoicedCost: number;
    freight: number;
    handling: number;
  };
  threshold?: number;
}

export function BatchPriceVariancePanel({
  product,
  existingWac,
  newBatchLanded,
  existingQty,
  incomingQty,
  breakdown,
  threshold = 5
}: BatchPriceVariancePanelProps) {
  const { hasWeight } = detectLandedCostBasis(product);
  
  // Convert everything to per-kg if product is weight-based
  const weightG = Number(product.weight_per_unit_grams) || 0;
  
  const levelsOld = landedCostPerLevel(product, existingWac, 'pcs');
  const levelsNew = landedCostPerLevel(product, newBatchLanded, 'pcs');
  
  // Single Source of Truth for Blended WAC
  const wac = computeWacClient(existingQty, existingWac, incomingQty, newBatchLanded, product, 'pcs');
  const blendedWac = wac.blendedWacPerPcs;
  const levelsBlended = landedCostPerLevel(product, blendedWac, 'pcs');

  const diffRaw = newBatchLanded - existingWac;
  const diffPct = existingWac > 0 ? (diffRaw / existingWac) * 100 : 0;
  const isUp = diffPct > threshold;
  const isDown = diffPct < -threshold;
  const isStable = !isUp && !isDown;

  const total = Math.max(0, existingQty) + Math.max(0, incomingQty);

  return (
    <div className="rounded-[2rem] border-2 border-slate-100 bg-white overflow-hidden shadow-xl shadow-slate-200/20">
      {breakdown && (
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 grid grid-cols-3 gap-4">
           <div className="flex flex-col">
             <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Inv. Cost</span>
             <span className="text-[11px] font-bold text-slate-700">{fmtINR(breakdown.invoicedCost)}</span>
           </div>
           <div className="flex flex-col">
             <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Freight</span>
             <span className="text-[11px] font-bold text-slate-700">+{fmtINR(breakdown.freight)}</span>
           </div>
           <div className="flex flex-col">
             <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Handling</span>
             <span className="text-[11px] font-bold text-slate-700">+{fmtINR(breakdown.handling)}</span>
           </div>
        </div>
      )}
      <div className="p-5 bg-slate-50/50 border-b-2 border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shadow-lg transition-all",
            isUp ? "bg-rose-500 text-white shadow-rose-200" : 
            isDown ? "bg-emerald-500 text-white shadow-emerald-200" : 
            "bg-slate-500 text-white shadow-slate-200"
          )}>
            {isUp ? <TrendingUp size={20} /> : isDown ? <TrendingDown size={20} /> : <Scale size={20} />}
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Inventory Valuation</div>
            <div className="text-sm font-black text-slate-800">
              {isUp ? "Cost Inflation Detected" : isDown ? "Cost Deflation Detected" : "Stable Valuation"}
            </div>
          </div>
        </div>
        
        {!isStable && (
          <div className={cn(
            "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border-2",
            isUp ? "bg-rose-50 border-rose-100 text-rose-600" : "bg-emerald-50 border-emerald-100 text-emerald-600"
          )}>
            {isUp ? "+" : ""}{diffPct.toFixed(1)}%
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block px-1">Previous WAC</span>
            <div className="font-black text-lg text-slate-900 tabular-nums">{fmtINR(levelsOld.pcs)}<span className="text-[10px] text-slate-400 font-bold ml-1 uppercase">/ unit</span></div>
            {hasWeight && weightG > 0 && (
              <div className="text-[10px] font-bold text-slate-400 font-mono italic px-1">{fmtINR(levelsOld.kg)} / kg</div>
            )}
          </div>
          
          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block px-1">Batch Landed</span>
            <div className={cn("font-black text-lg tabular-nums", isUp ? "text-rose-600" : isDown ? "text-emerald-600" : "text-slate-900")}>
              {fmtINR(levelsNew.pcs)}<span className="text-[10px] font-bold ml-1 uppercase opacity-60">/ unit</span>
            </div>
            {hasWeight && weightG > 0 && (
              <div className="text-[10px] font-bold text-slate-400 font-mono italic px-1">{fmtINR(levelsNew.kg)} / kg</div>
            )}
          </div>
        </div>

        <div className="p-5 bg-brand-primary/[0.03] rounded-2xl border-2 border-brand-primary/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <TrendingUp size={64} className="text-brand-primary" />
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest text-brand-primary/60 block mb-1">Projected Blended WAC</span>
          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-slate-900 tabular-nums">{fmtINR(levelsBlended.pcs)}</div>
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">/ base unit</div>
          </div>
          {hasWeight && weightG > 0 && (
            <div className="mt-1 text-xs font-bold text-brand-primary/60 font-mono">{fmtINR(levelsBlended.kg)} / kg</div>
          )}
          
          <div className="mt-4 pt-4 border-t-2 border-brand-primary/5 flex items-center justify-between text-[10px]">
             <div className="flex flex-col">
               <span className="font-bold text-slate-400 uppercase tracking-widest leading-none">Variance Abs</span>
               <span className={cn("font-black mt-1", isUp ? "text-rose-600" : isDown ? "text-emerald-600" : "text-slate-500")}>
                 {isUp ? "+" : ""}{fmtINR(blendedWac - existingWac)}
               </span>
             </div>
             <div className="text-right flex flex-col">
               <span className="font-bold text-slate-400 uppercase tracking-widest leading-none">Impact Factor</span>
               <span className="font-black mt-1 text-slate-700">{(incomingQty / total * 100).toFixed(0)}% contribution</span>
             </div>
          </div>
        </div>

        {isUp && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border-2 border-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] font-bold text-amber-700 leading-relaxed uppercase tracking-tight">
               <span className="underline">Margin Warning</span>: Significant cost increase. Recommended to review tier pricing before posting to prevent margin erosion.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
