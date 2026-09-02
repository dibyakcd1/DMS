import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { type PricingProduct, getPackMultiplier } from "@/lib/pricing";
import { type PackType } from "@/lib/packaging";
import { fmtINR } from "@/lib/format";

interface LandedCostFieldsProps {
  product: PricingProduct;
  packType: string;
  qty: number;
  unitCost: number;
  freightTotal: number;
  handlingTotal: number;
  taxPct: number;
  onFreightChange: (val: number) => void;
  onHandlingChange: (val: number) => void;
  onTaxChange: (val: number) => void;
}

export function LandedCostFields({
  product,
  packType,
  qty,
  unitCost,
  freightTotal,
  handlingTotal,
  taxPct,
  onFreightChange,
  onHandlingChange,
  onTaxChange
}: LandedCostFieldsProps) {
  const mult = getPackMultiplier(product, packType as PackType);
  const totalInvoiced = (Number(qty) || 0) * (Number(unitCost) || 0);
  const totalLanded = totalInvoiced + (Number(freightTotal) || 0) + (Number(handlingTotal) || 0);
  const landedPerPack = (Number(qty) || 0) > 0 ? totalLanded / Number(qty) : 0;
  const landedPerPcs = mult > 0 ? landedPerPack / mult : landedPerPack;

  return (
    <div className="space-y-3 bg-zinc-50/80 border border-zinc-200/80 rounded-xl p-3.5">
      <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
        <span className="uppercase tracking-wider">Landed Cost Calculation</span>
        <span className="text-blue-700 font-mono font-black">
          Landed: {fmtINR(landedPerPack)} / {packType.toUpperCase()}
          {mult > 1 && <span className="text-zinc-500 font-normal ml-1">({fmtINR(landedPerPcs)}/pc)</span>}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[9px] font-bold uppercase text-zinc-400">Freight (₹)</Label>
          <Input
            type="number"
            value={freightTotal || ""}
            onChange={e => onFreightChange(Number(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-xs bg-white"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[9px] font-bold uppercase text-zinc-400">Handling (₹)</Label>
          <Input
            type="number"
            value={handlingTotal || ""}
            onChange={e => onHandlingChange(Number(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-xs bg-white"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[9px] font-bold uppercase text-zinc-400">GST Rate (%)</Label>
          <Input
            type="number"
            value={taxPct || ""}
            onChange={e => onTaxChange(Number(e.target.value) || 0)}
            placeholder="0"
            className="h-8 text-xs bg-white"
          />
        </div>
      </div>
    </div>
  );
}
