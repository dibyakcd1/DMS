import { detectLandedCostBasis, landedCostPerLevel, type PricingProduct, type PackType, type LandedCostBasis } from "@/lib/pricing";

interface LandedCostFieldsProps {
  product: PricingProduct;
  packType: PackType;
  qty: number;              // in the GRN item's pack_type units
  unitCost: number;         // invoice cost (per pack_type unit)
  freightTotal: number;     // ₹ total freight for this line
  handlingTotal: number;    // ₹ other charges for this line
  taxPct: number;           // GST %
  onFreightChange: (v: number) => void;
  onHandlingChange: (v: number) => void;
  onTaxChange: (v: number) => void;
}

export function LandedCostFields({
  product, packType, qty, unitCost, freightTotal, handlingTotal, taxPct,
  onFreightChange, onHandlingChange, onTaxChange
}: LandedCostFieldsProps) {
  const { basis: pBasis, hasWeight } = detectLandedCostBasis(product);
  
  // 1. Calculate the landed cost in the input unit (as provided in GRN)
  const landedInInputUnit = unitCost + (freightTotal / (qty || 1)) + (handlingTotal / (qty || 1));
  
  // 2. Normalize to all levels
  const basisForLevels: LandedCostBasis = (packType === 'unit' ? 'pcs' : packType) as LandedCostBasis;
  const allLevels = landedCostPerLevel(product, landedInInputUnit, basisForLevels);
  
  const displayLanded = pBasis === 'kg' ? allLevels.kg : pBasis === 'doz' ? allLevels.doz : allLevels.pcs;
  const displayUnit   = pBasis === 'kg' ? '/ kg' : pBasis === 'doz' ? '/ doz' : '/ unit';
  const landedInclTax = displayLanded * (1 + taxPct / 100);

  return (
    <div className="space-y-3 p-4 bg-white rounded-xl border-2 border-slate-100">
      <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Landed Cost Modifiers</div>
      
      {/* Freight */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-600 w-24 shrink-0">Freight (₹)</label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={freightTotal || ''}
          onChange={e => onFreightChange(Number(e.target.value))}
          className="flex-1 h-8 px-3 text-sm border-2 border-slate-100 rounded-lg font-mono focus:border-brand-primary/30 outline-none transition-all"
          placeholder="0.00"
        />
      </div>

      {/* Handling */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-600 w-24 shrink-0">Handling (₹)</label>
        <input
          type="number"
          min={0}
          step={0.01}
          value={handlingTotal || ''}
          onChange={e => onHandlingChange(Number(e.target.value))}
          className="flex-1 h-8 px-3 text-sm border-2 border-slate-100 rounded-lg font-mono focus:border-brand-primary/30 outline-none transition-all"
          placeholder="0.00"
        />
      </div>

      {/* Tax */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-slate-600 w-24 shrink-0">GST %</label>
        <select
          value={taxPct}
          onChange={e => onTaxChange(Number(e.target.value))}
          className="flex-1 h-8 px-2 text-sm border-2 border-slate-100 rounded-lg bg-white outline-none focus:border-brand-primary/30"
        >
          {[0, 5, 12, 18, 28].map(r => (
            <option key={r} value={r}>{r}%</option>
          ))}
        </select>
      </div>

      {/* Computed Landed Cost Display */}
      <div className={`mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-xs font-mono
        ${pBasis === 'kg' && hasWeight ? 'bg-brand-primary/5 border-2 border-brand-primary/10' : 'bg-slate-50 border-2 border-slate-100'}`}>
        <div className="flex flex-col">
          <span className="font-bold text-slate-500 uppercase tracking-widest text-[9px]">
            Landed {displayUnit}
          </span>
          {pBasis === 'kg' && !hasWeight && (
            <span className="text-[8px] text-amber-600 font-bold uppercase mt-0.5">⚠ missing weight</span>
          )}
        </div>
        <div className="text-right">
          <div className="font-black text-slate-900 text-sm">₹{displayLanded.toFixed(2)}</div>
          {taxPct > 0 && (
            <div className="text-[9px] text-slate-400 font-bold">
              incl. GST: ₹{landedInclTax.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Show dozen and piece breakdown */}
      {pBasis === 'doz' && allLevels.pcs > 0 && (
        <div className="text-[9px] text-slate-400 font-bold font-mono text-right mt-1 px-1">
          ≈ ₹{allLevels.pcs.toFixed(2)} / pc
        </div>
      )}

      {/* Show kg landed if product has weight AND we're not already in kg basis */}
      {hasWeight && pBasis !== 'kg' && allLevels.kg > 0 && (
        <div className="text-[9px] text-slate-400 font-bold font-mono text-right mt-1 px-1">
          ≈ ₹{allLevels.kg.toFixed(2)} / kg
        </div>
      )}
    </div>
  );
}
