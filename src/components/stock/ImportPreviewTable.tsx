import * as React from "react";
import { type StockItem } from "@/hooks/useStockImport";
import { type Product } from "@/types";
import { type PricingProduct, getPackMultiplier, landedCostPerLevel, autoCalcAllTiers, getAllocationInfo, getItemWeightKg } from "@/lib/pricing";
import { resolveUnitProfile } from "@/lib/packaging";
import { fmtINR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Edit2, Trash2, Box, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BatchPriceVariancePanel } from "@/components/inventory/BatchPriceVariancePanel";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";

interface ImportPreviewTableProps {
  items: StockItem[];
  products: Product[];
  totalFreight: number;
  totalHandling: number;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export const ImportPreviewTable = ({ 
  items, 
  products, 
  totalFreight, 
  totalHandling, 
  onEdit, 
  onRemove 
}: ImportPreviewTableProps) => {
  const { varianceThreshold } = useGlobalSettings();

  const { totalWeightKG, allLinesHaveWeight, totalInvoiceValue } = React.useMemo(() => {
    let weight = 0;
    let invVal = 0;
    let allWeight = items.length > 0;
    items.forEach((it) => {
      const itP = products.find(px => px.id === it.productId);
      const mult = getPackMultiplier({ 
        id: it.productId, 
        units_per_packet: it.unitsPerPacket, 
        packets_per_case: it.packetsPerCase, 
        pack_size_value: itP?.pack_size_value || 0, 
        pack_size_unit: itP?.pack_size_unit || "g" 
      }, it.packType);
      const pcs = (Number(it.quantity) || 0) * mult;
      const lineWeight = getItemWeightKg(pcs, itP?.pack_size_value, itP?.pack_size_unit);
      if (lineWeight <= 0 && pcs > 0) allWeight = false;
      weight += lineWeight;
      invVal += (Number(it.quantity) || 0) * (Number(it.unitCost) || 0);
    });
    if (weight <= 0) allWeight = false;
    return { totalWeightKG: weight, allLinesHaveWeight: allWeight, totalInvoiceValue: invVal };
  }, [items, products]);

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pFull = products.find(p => p.id === item.productId);
        const pricingProd: PricingProduct = {
           id: item.productId,
           units_per_packet: item.unitsPerPacket,
           packets_per_case: item.packetsPerCase,
           mrp: pFull?.mrp,
           pack_size_value: pFull?.pack_size_value,
           pack_size_unit: pFull?.pack_size_unit
        };
        
        const unitProfile = resolveUnitProfile(item.packType, pFull, {
          units_per_packet: item.unitsPerPacket,
          packets_per_case: item.packetsPerCase,
          pack_size_value: pFull?.pack_size_value,
          pack_size_unit: pFull?.pack_size_unit
        });

        const multiplier = unitProfile.baseMultiplier || getPackMultiplier(pricingProd, item.packType);
        const caseMultiplier = getPackMultiplier(pricingProd, "case");
        const baseUnitsCount = (Number(item.quantity) || 0) * multiplier;
        const itemInvoicedBaseCost = (Number(item.unitCost) || 0) / (multiplier || 1);
        const itemWeightKg = getItemWeightKg(baseUnitsCount, pFull?.pack_size_value, pFull?.pack_size_unit);
        
        const allocation = getAllocationInfo({
           itemQty: item.quantity,
           itemUnitCost: item.unitCost,
           itemBaseUnits: baseUnitsCount,
           itemWeightKg: itemWeightKg,
           totalFreight: totalFreight,
           totalHandling: totalHandling,
           totalWeightKG: allLinesHaveWeight ? totalWeightKG : 0,
           totalInvoiceValue: totalInvoiceValue,
           manifestLineCount: items.length,
           allLinesHaveWeight
        });

        // Current landed cost for this item (as imported)
        const invoicedCostPerPack = Number(item.unitCost) || 0;
        const freightForLine = item.freightTotal !== undefined ? item.freightTotal : allocation.freightAmount;
        const handlingForLine = item.handlingTotal !== undefined ? item.handlingTotal : allocation.handlingAmount;

        const landedPerPack = invoicedCostPerPack + (freightForLine / (Number(item.quantity) || 1)) + (handlingForLine / (Number(item.quantity) || 1));
        
        // Normalize to per-pcs
        const landedPerPcs = multiplier > 0 ? landedPerPack / multiplier : landedPerPack;

        const allLanded = landedCostPerLevel(pricingProd, landedPerPcs, 'pcs');
        const landedBaseCost = allLanded.pcs;

        const isWeightBased = pFull?.case_qty_unit?.toLowerCase() === 'kg' || (pFull?.pack_size_unit && ['kg', 'g', 'gram', 'gram'].includes(pFull.pack_size_unit.toLowerCase()));
        const landedKg = allLanded.kg;
        const rowWeight = itemWeightKg;
        
        const tiers = autoCalcAllTiers(pricingProd, landedBaseCost, 'pcs');
        const sell = tiers.find(t => t.shop_type === "bronze" && t.pack_type === "pcs")?.price || (landedBaseCost/0.65);
        const profitPct = ((sell - landedBaseCost)/sell * 100);

        const prevWacPcs = pFull?.inventory?.avg_landed_cost || pFull?.cost_price || 0;
        const perPieceWeightKg = getItemWeightKg(1, pFull?.pack_size_value, pFull?.pack_size_unit);
        const prevWacKg = (prevWacPcs > 0 && perPieceWeightKg > 0) ? (prevWacPcs / perPieceWeightKg) : 0;

        const lineNet = item.netValue !== undefined ? item.netValue : ((Number(item.quantity) || 0) * (Number(item.unitCost) || 0));
        const effGst = item.taxPct !== undefined ? item.taxPct : (pFull?.gst_rate || 0);
        const lineTax = item.taxAmount !== undefined ? item.taxAmount : (lineNet * (effGst / 100));
        const lineGross = item.grossValue !== undefined ? item.grossValue : (lineNet + lineTax);

        return (
          <div key={item.id} className="bg-white border border-black/5 rounded-xl overflow-hidden group shadow-sm flex flex-col transition-all duration-200">
            <div className="p-4 border-b border-black/5 flex items-start justify-between">
              <div className="min-w-0 flex-1 pr-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-bold text-zinc-900 truncate leading-tight uppercase tracking-tight">{item.name}</h3>
                  {effGst > 0 && (
                    <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] h-4 font-bold">
                      {item.cgstPct && item.sgstPct 
                        ? `GST ${effGst}% (${item.cgstPct}%+${item.sgstPct}%)` 
                        : `GST ${effGst}%`}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-tighter">{item.sku}</p>
                  {unitProfile.warnings.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {unitProfile.warnings[0].message}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => onEdit(item.id)}
                  className="h-11 w-11 md:h-8 md:w-8 flex items-center justify-center text-zinc-400 hover:text-blue-500 rounded-md hover:bg-blue-50 transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => onRemove(item.id)}
                  className="h-11 w-11 md:h-8 md:w-8 flex items-center justify-center text-zinc-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
               <div className="space-y-0.5">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Importing</p>
                  <p className="text-[12px] font-black text-zinc-900 leading-none">
                    {item.quantity} <span className="uppercase text-primary font-bold">{unitProfile.canonicalUnit.toUpperCase()}</span>
                    {unitProfile.baseMultiplier > 1 && (
                      <span className="block text-[10px] font-mono text-zinc-500 font-semibold mt-0.5">
                        = {item.quantity * unitProfile.baseMultiplier} {unitProfile.baseUnitLabel}
                      </span>
                    )}
                  </p>
               </div>
               <div className="space-y-0.5 text-right">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Invoice Cost</p>
                  <p className="text-[12px] font-black text-zinc-900 leading-none">
                    {fmtINR(item.unitCost)} <span className="opacity-40 text-[10px]">/{item.packType}</span>
                  </p>
                  <span className="block text-[10px] font-mono text-zinc-500 font-semibold mt-0.5">
                    Net: {fmtINR(lineNet)}{lineTax > 0 ? ` + Tax: ${fmtINR(lineTax)}` : ''}
                  </span>
               </div>

               <div className="col-span-2 py-2 flex items-center gap-3">
                  <div className="flex-1 h-[2px] bg-zinc-100" />
                  <Info className="h-3 w-3 text-zinc-200" />
                  <div className="flex-1 h-[2px] bg-zinc-100" />
               </div>

               <div className="space-y-0.5">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Landed Unit</p>
                  <p className="text-[12px] font-black text-blue-600 leading-none">{fmtINR(landedBaseCost)}</p>
               </div>
               <div className="space-y-0.5 text-right">
                  <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Expected Profit</p>
                  <p className={cn("text-[12px] font-black leading-none", profitPct > 20 ? "text-emerald-600" : profitPct > 10 ? "text-amber-600" : "text-red-600")}>
                    {profitPct.toFixed(1)}%
                  </p>
               </div>

               <div className="col-span-2 pt-2 mt-1 border-t border-zinc-50">
                  <BatchPriceVariancePanel 
                    product={pricingProd}
                    existingWac={prevWacPcs}
                    newBatchLanded={landedBaseCost}
                    existingQty={pFull?.inventory?.quantity || 0}
                    incomingQty={baseUnitsCount}
                    threshold={varianceThreshold}
                    breakdown={{
                      invoicedCost: itemInvoicedBaseCost,
                      freight: freightForLine / (baseUnitsCount || 1),
                      handling: handlingForLine / (baseUnitsCount || 1)
                    }}
                  />
                  {isWeightBased && (
                    <div className="mt-2 flex justify-between items-center text-[9px] font-bold text-zinc-400 uppercase tracking-widest px-1">
                      <span>Total weight of this line</span>
                      <span className="text-zinc-600">{rowWeight.toFixed(2)} KG</span>
                    </div>
                  )}
               </div>
            </div>

            <div className="px-4 py-2 bg-zinc-50/50 border-t border-black/5 flex justify-between items-center">
               <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Expiry</span>
                  <span className="text-[10px] font-mono font-bold text-zinc-600">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : "PENDING"}</span>
               </div>
               <Badge className="bg-zinc-200/50 text-zinc-500 text-[9px] h-4 font-bold border-none shadow-none uppercase px-1.5 rounded-sm">
                  Alloc: {fmtINR(allocation.freightAmount)} Fr
               </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
};
