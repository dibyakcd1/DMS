/**
 * BHARAT MASALA PRICING ENGINE
 * Centralized logic for landed costs, margins, tiered pricing, and RBP/MRP fallbacks.
 */

import { isProductDozenPackaging } from "./packaging";
import type { Product } from "@/types";

export type ShopType = "premium" | "gold" | "silver" | "bronze" | "basic";
export type PackType = "pcs" | "packet" | "case" | "kg" | "g" | "ml" | "ltr" | "doz" | "unit";
export type LandedCostBasis = 'pcs' | 'case' | 'kg' | 'g' | 'packet' | 'doz';

export interface PricingProduct {
  id: string;
  name?: string;
  sku?: string;
  brand?: string;
  preferred_sell_unit?: string;
  hsn?: string;
  company?: { id?: string; name?: string; short_code?: string; accent_hex?: string; };
  units_per_packet?: number;
  packets_per_case?: number;
  units_per_case?: number;
  mrp?: number;
  selling_price?: number;
  rbp_unit?: number;
  cost_price?: number;
  is_mrp_priced?: boolean;
  target_margin_premium?: number;
  target_margin_gold?: number;
  target_margin_silver?: number;
  target_margin_bronze?: number;
  target_margin_basic?: number;
  pack_size_value?: number;
  pack_size_unit?: string;
  unit_type?: "pcs" | "packet" | "kg_g";
  weight_per_unit_grams?: number;
  item_pack_type?: string;
}

// ─── Step 1: Base Multipliers ────────────────────────────────────────────────
export function getPackMultiplier(p: PricingProduct, type: PackType): number {
  if (!type || type === "pcs" || type === "unit") return 1;
  if (type === "doz") return 12;
  if (type === "packet") return p.units_per_packet || 1;
  if (type === "case") {
    if (p.units_per_case && Number(p.units_per_case) > 1) return Number(p.units_per_case);
    const upp = Number(p.units_per_packet) || 1;
    const ppc = Number(p.packets_per_case) || 1;
    if (upp * ppc > 1) return upp * ppc;
    return 1;
  }
  
  if (type === "kg" || type === "ltr") {
    if (p.weight_per_unit_grams && Number(p.weight_per_unit_grams) > 0) return 1000 / Number(p.weight_per_unit_grams);
    const val = Number(p.pack_size_value) || 0;
    const unit = (p.pack_size_unit || "").toLowerCase();
    if (val > 0) {
      if (['g', 'gms', 'grams', 'gm', 'ml'].includes(unit)) return 1000 / val;
      if (['kg', 'kilogram', 'kilograms', 'l', 'ltr', 'litre', 'liter'].includes(unit)) return 1 / val;
    }
    return 1;
  }
  
  if (type === "g" || type === "ml") {
    if (p.weight_per_unit_grams && Number(p.weight_per_unit_grams) > 0) return 1 / Number(p.weight_per_unit_grams);
    const val = Number(p.pack_size_value) || 0;
    const unit = (p.pack_size_unit || "").toLowerCase();
    if (val > 0) {
      if (['g', 'gms', 'grams', 'gm', 'ml'].includes(unit)) return 1 / val;
      if (['kg', 'kilogram', 'kilograms', 'l', 'ltr', 'litre', 'liter'].includes(unit)) return 0.001 / val;
    }
    return 0.001;
  }
  
  return 1;
}

// ─── Step 2: Landed cost per level ───────────────────────────────────────────
export function landedCostPerLevel(
  p: PricingProduct, 
  baseLandedCost: number = 0, 
  basisOrLegacy: LandedCostBasis | boolean = 'case'
): Record<PackType, number> {
  const basis: LandedCostBasis = typeof basisOrLegacy === 'boolean'
    ? (basisOrLegacy ? 'pcs' : 'case')
    : basisOrLegacy;

  const unitsInPacket = p.units_per_packet || 1;
  const packetsInCase = p.packets_per_case || 1;
  const totalUnits = (p.units_per_case && Number(p.units_per_case) > 1) 
    ? Number(p.units_per_case) 
    : (unitsInPacket * packetsInCase);
  const weightPerUnitG = Number(p.weight_per_unit_grams) || 0;

  let costPerUnit: number;

  switch (basis) {
    case 'pcs':
      costPerUnit = baseLandedCost;
      break;

    case 'doz':
      costPerUnit = baseLandedCost / 12;
      break;

    case 'case':
      costPerUnit = baseLandedCost / (totalUnits || 1);
      break;

    case 'packet':
      costPerUnit = baseLandedCost / (unitsInPacket || 1);
      break;

    case 'kg':
      // Input is ₹ per kg. Convert to ₹ per pcs.
      // costPerUnit = (₹/kg) × (weightPerUnitG / 1000)
      if (weightPerUnitG > 0) {
        costPerUnit = baseLandedCost * (weightPerUnitG / 1000);
      } else {
        // Fallback: no weight data → treat as per-pcs
        console.warn(`[landedCostPerLevel] basis='kg' requested but weight_per_unit_grams is missing for product ${p.id}. Falling back to per-unit.`);
        costPerUnit = baseLandedCost;
      }
      break;

    case 'g':
      if (weightPerUnitG > 0) {
        costPerUnit = baseLandedCost * weightPerUnitG;
      } else {
        costPerUnit = baseLandedCost;
      }
      break;

    default:
      costPerUnit = baseLandedCost / (totalUnits || 1);
  }

  const costPerCase   = Math.round(costPerUnit * totalUnits * 10000) / 10000;
  const costPerPacket = Math.round(costPerUnit * unitsInPacket * 10000) / 10000;
  const costPerDoz    = Math.round(costPerUnit * 12 * 10000) / 10000;
  const costPerKg     = weightPerUnitG > 0 ? costPerUnit / (weightPerUnitG / 1000) : 0;
  const costPerG      = weightPerUnitG > 0 ? costPerUnit / weightPerUnitG : 0;
  
  // For liquid products using pack_size_value in ml/ltr:
  const packSizeVal   = Number(p.pack_size_value) || 0;
  const packSizeUnit  = (p.pack_size_unit || '').toLowerCase();
  const packSizeMl    = packSizeUnit === 'ml' ? packSizeVal : (packSizeUnit === 'ltr' || packSizeUnit === 'l') ? packSizeVal * 1000 : 0;
  const costPerMl     = packSizeMl > 0 ? costPerUnit / packSizeMl : 0;
  const costPerLtr    = packSizeMl > 0 ? costPerUnit * (1000 / packSizeMl) : 0;

  return {
    pcs:    costPerUnit,
    unit:   costPerUnit,
    packet: costPerPacket,
    doz:    costPerDoz,
    case:   costPerCase,
    kg:     costPerKg,
    g:      costPerG,
    ml:     costPerMl,
    ltr:    costPerLtr,
  };
}

/** @deprecated Use basis: LandedCostBasis instead */
export function landedCostPerLevelLegacy(
  p: PricingProduct, 
  baseLandedCost: number = 0, 
  isPerUnit: boolean = false
): Record<PackType, number> {
  return landedCostPerLevel(p, baseLandedCost, isPerUnit ? 'pcs' : 'case');
}

/**
 * Determines the correct landed cost input basis for a product.
 */
export function detectLandedCostBasis(p: PricingProduct): { 
  basis: LandedCostBasis; 
  label: string;        // human-readable, e.g. "per kg" or "per unit"
  hasWeight: boolean;
} {
  const weightG = Number(p.weight_per_unit_grams) || 0;
  const isKgType = p.unit_type === 'kg_g';
  const itemPack = (p.item_pack_type || '').toLowerCase();
  const rawPref = (p.preferred_sell_unit || '').toLowerCase();

  if (
    itemPack === 'doz' || itemPack === 'dozen' || itemPack === 'dz' || 
    rawPref === 'doz' || rawPref === 'dozen' || rawPref === 'dz' ||
    p.units_per_packet === 12 ||
    isProductDozenPackaging(p as unknown as Product)
  ) {
    return { basis: 'doz', label: 'per dozen', hasWeight: false };
  }

  if (weightG > 0) {
    return { basis: 'kg', label: 'per kg', hasWeight: true };
  }

  if (isKgType) {
    // Declared as weight product but weight missing — warn, still default to kg basis
    // so the user can enter the weight and fix it
    console.warn(`[detectLandedCostBasis] Product ${p.id} has unit_type='kg_g' but weight_per_unit_grams is null/0. Defaulting to 'kg' so weight field shows.`);
    return { basis: 'kg', label: 'per kg (⚠ weight missing)', hasWeight: false };
  }

  return { basis: 'pcs', label: 'per unit', hasWeight: false };
}

// ─── Step 3: Selling price from landed cost + margin ─────────────────────────
// Formula: selling_price = landed ÷ (1 − margin%)
export function sellingPrice(
  landedCost: number, 
  marginPct: number,
  roundTo: 0.1 | 0.5 | 1 | 2 | 5 | 10 = 0.5
): number {
  if (isNaN(landedCost) || isNaN(marginPct) || landedCost <= 0) return 0;
  if (marginPct >= 100) return landedCost;
  const factor = 1 - (marginPct / 100);
  if (factor <= 0) return landedCost;
  const raw = landedCost / factor;
  return Math.ceil(raw / roundTo) * roundTo; // Round UP to nearest increment
}

// ─── Step 4: Margin Helpers ──────────────────────────────────────────────────
export function getTargetMargin(p: PricingProduct, shopType: ShopType): number {
  const defaults: Record<ShopType, number> = {
    premium: 3.5,
    gold:    5.0,
    silver:  7.0,
    bronze:  8.5,
    basic:   10.0,
  };
  
  if (!shopType || !defaults[shopType]) {
    shopType = "silver";
  }

  const fieldMap: Record<ShopType, keyof PricingProduct> = {
    premium: 'target_margin_premium',
    gold: 'target_margin_gold',
    silver: 'target_margin_silver',
    bronze: 'target_margin_bronze',
    basic: 'target_margin_basic'
  };
  
  const val = p[fieldMap[shopType]];
  if (typeof val === 'number' && val > 0) {
    return val;
  }
  
  return defaults[shopType];
}

// ─── Step 4.1: Freight Allocation shared logic ────────────────────────────────
export function getItemWeightKg(
  units: number, 
  pack_size_value?: number | null, 
  pack_size_unit?: string | null
): number {
  const unit = (pack_size_unit || '').toLowerCase().trim();
  const val = pack_size_value || 0;
  const gramsPerUnit = 
    ['g', 'gm', 'gms', 'grams', 'ml'].includes(unit) ? val :
    ['kg', 'kilogram', 'kilograms', 'ltr', 'l', 'litre', 'liter'].includes(unit) ? val * 1000 :
    0;
  return (units * gramsPerUnit) / 1000;
}

export interface AllocationResult {
  freightAmount: number;
  handlingAmount: number;
  method: "⚖ Weight" | "₹ Invoice" | "N/A";
}

export function getAllocationInfo(opts: {
  itemQty: number;
  itemUnitCost: number;
  itemBaseUnits: number;
  itemWeightGrams?: number;
  itemWeightKg?: number;
  itemWeightKG?: number;
  totalFreight: number;
  totalHandling?: number;
  totalWeightKG: number;
  totalInvoiceValue: number;
  manifestLineCount?: number;
  allLinesHaveWeight?: boolean;
}): AllocationResult {
  const { 
    itemQty, 
    itemUnitCost, 
    itemBaseUnits, 
    itemWeightGrams,
    itemWeightKg,
    itemWeightKG,
    totalFreight, 
    totalHandling = 0,
    totalWeightKG, 
    totalInvoiceValue,
    manifestLineCount = 1,
    allLinesHaveWeight
  } = opts;
  
  if (itemBaseUnits <= 0 || (totalFreight <= 0 && totalHandling <= 0)) {
    return { freightAmount: 0, handlingAmount: 0, method: "N/A" };
  }

  const resolvedItemWeightKg = itemWeightKg ?? itemWeightKG ?? (itemWeightGrams !== undefined ? (itemBaseUnits * itemWeightGrams) / 1000 : 0);
  const itemValue = itemQty * itemUnitCost;

  const isWeightApplicable = (allLinesHaveWeight !== undefined ? allLinesHaveWeight : (totalWeightKG > 0 && resolvedItemWeightKg > 0)) && totalWeightKG > 0 && resolvedItemWeightKg > 0;

  if (isWeightApplicable) {
    return {
      freightAmount: totalFreight > 0 ? (resolvedItemWeightKg / totalWeightKG) * totalFreight : 0,
      handlingAmount: totalHandling > 0 ? (resolvedItemWeightKg / totalWeightKG) * totalHandling : 0,
      method: "⚖ Weight"
    };
  }

  if (totalInvoiceValue > 0) {
    return {
      freightAmount: totalFreight > 0 ? (itemValue / totalInvoiceValue) * totalFreight : 0,
      handlingAmount: totalHandling > 0 ? (itemValue / totalInvoiceValue) * totalHandling : 0,
      method: "₹ Invoice"
    };
  }

  const fallbackFreight = manifestLineCount > 0 ? totalFreight / manifestLineCount : 0;
  const fallbackHandling = manifestLineCount > 0 ? totalHandling / manifestLineCount : 0;

  return { freightAmount: fallbackFreight, handlingAmount: fallbackHandling, method: "N/A" };
}

// ─── Step 5: Advanced Tier Price Calculation ──────────────────────────────────
export function calculateTierPrice(
  p: PricingProduct, 
  shopType: ShopType, 
  packType: PackType, 
  baseLandedCost: number, 
  basisOrLegacy: LandedCostBasis | boolean = 'case'
): number {
  const basis: LandedCostBasis = typeof basisOrLegacy === 'boolean'
    ? (basisOrLegacy ? 'pcs' : 'case')
    : basisOrLegacy;
    
  const lc = landedCostPerLevel(p, baseLandedCost, basis);
  const margin = getTargetMargin(p, shopType);
  const landed = lc[packType] || 0;
  
  if (landed <= 0) return 0;
  return sellingPrice(landed, margin);
}

// ─── Step 6: Generate ALL tier prices for a product ──────────────────────────
export function autoCalcAllTiers(
  p: PricingProduct, 
  baseLandedCost: number, 
  basisOrLegacy: LandedCostBasis | boolean = 'case'
): {
  shop_type: ShopType;
  pack_type: PackType;
  landed_cost: number;
  price: number;
  margin_pct: number;
}[] {
  const basis: LandedCostBasis = typeof basisOrLegacy === 'boolean'
    ? (basisOrLegacy ? 'pcs' : 'case')
    : basisOrLegacy;
    
  const lc = landedCostPerLevel(p, baseLandedCost, basis);
  const shopTypes: ShopType[] = ["premium", "gold", "silver", "bronze", "basic"];
  const packTypes: PackType[] = ["pcs", "packet", "case", "doz", "kg", "g", "ml", "ltr"];

  const result = [];
  for (const st of shopTypes) {
    const margin = getTargetMargin(p, st);
    for (const pt of packTypes) {
      const landed = lc[pt];
      const price = sellingPrice(landed, margin);
      if (price > 0) {
        result.push({
          shop_type: st,
          pack_type: pt,
          landed_cost: landed,
          price,
          margin_pct: margin,
        });
      }
    }
  }
  return result;
}

// ─── Step 7: Price resolution at order time ───────────────────────────────────
export function resolvePrice(opts: {
  product:       PricingProduct;
  packType:      PackType;
  shopType:      ShopType;
  savedTiers?:    Map<string, number>;       // key: `${shopType}:${packType}`
  shopOverride?: number | null;
  rbpFallback?:  number | null;
  landedCost?:   number | null;
}): { price: number; source: 'override' | 'tier' | 'auto' | 'rbp' } {
  const { product, packType, shopType, savedTiers, shopOverride, rbpFallback, landedCost } = opts;

  if (shopOverride != null && shopOverride > 0 && !isNaN(shopOverride)) return { price: shopOverride, source: 'override' };

  const isDoz = isProductDozenPackaging(product as unknown as Product) || 
    product.units_per_packet === 12 || 
    (product.preferred_sell_unit || '').toLowerCase() === 'doz';
  const mult = getPackMultiplier(product, packType);

  const tier = savedTiers?.get(`${shopType}:${packType}`);
  if (tier != null && tier > 0) {
    let isCorruptTier = false;

    // Check 1: If product has single-piece MRP > 0, a pcs tier shouldn't be a corrupt fraction (< 25% of piece MRP)
    const singlePieceMrp = (product.mrp && product.mrp > 0)
      ? (isDoz && product.mrp >= 60 ? product.mrp / 12 : product.mrp)
      : 0;

    if (singlePieceMrp > 0 && packType === 'pcs' && tier < singlePieceMrp * 0.25) {
      isCorruptTier = true;
    }

    if (isDoz && packType === 'pcs') {
      const dozTier = savedTiers?.get(`${shopType}:doz`);
      if (dozTier && dozTier > 0 && tier > dozTier * 0.4) {
        isCorruptTier = true;
      }
    } else if (isDoz && packType === 'doz') {
      const pcsTier = savedTiers?.get(`${shopType}:pcs`);
      if (pcsTier && pcsTier > 0 && tier < pcsTier * 2) {
        isCorruptTier = true;
      }
    }

    if (!isCorruptTier) {
      return { price: tier, source: 'tier' };
    }
  }

  if (rbpFallback != null && rbpFallback > 0) return { price: rbpFallback, source: 'rbp' };

  // Calculate based on landed cost and margin if available & realistic
  if (landedCost != null && landedCost > 0) {
    let costPerPcs = landedCost;
    if (isDoz) {
      // Determine what a single piece MRP or selling price is
      const singlePieceMrp = (product.mrp && product.mrp > 0)
        ? (product.mrp >= 60 && (product.units_per_packet === 12 || (product.preferred_sell_unit || '').toLowerCase() === 'doz') ? product.mrp / 12 : product.mrp)
        : ((product.selling_price && product.selling_price > 0) ? product.selling_price : 0);

      // A landed cost is at dozen-level ONLY if it exceeds 1.5x of a single piece's expected value/MRP
      const isDozenLevelCost = singlePieceMrp > 0
        ? landedCost > (singlePieceMrp * 1.5)
        : landedCost > 200;

      if (isDozenLevelCost) {
        costPerPcs = landedCost / 12;
      }
    }
    const lc = landedCostPerLevel(product, costPerPcs, 'pcs');
    const landed = lc[packType] || (costPerPcs * mult);
    const margin = getTargetMargin(product, shopType);
    const price = sellingPrice(landed, margin);
    
    // Sanity check: Ensure price is not a zero/broken fraction (< 2%) of base MRP / selling price when MRP > 50
    const isCorruptFraction = (
      (product.mrp && product.mrp > 50 && price < product.mrp * mult * 0.02) ||
      (product.selling_price && product.selling_price > 50 && price < product.selling_price * mult * 0.02)
    );

    if (price > 0 && !isCorruptFraction) return { price, source: 'auto' };
  }

  // If this is a dozen product and we have a valid dozen tier, derive pcs price from dozen tier
  if (isDoz && packType === 'pcs') {
    const dozTier = savedTiers?.get(`${shopType}:doz`);
    if (dozTier && dozTier > 0) {
      const pcsPrice = Math.round((dozTier / 12) * 100) / 100;
      if (pcsPrice > 0) return { price: pcsPrice, source: 'auto' };
    }
  }

  // Fallback to explicit selling_price if set
  if (product.selling_price && product.selling_price > 0) {
    return { price: Math.round(product.selling_price * mult * 100) / 100, source: 'auto' };
  }

  // Fallback to RBP unit if set
  if (product.rbp_unit && product.rbp_unit > 0) {
    return { price: Math.round(product.rbp_unit * mult * 100) / 100, source: 'rbp' };
  }

  // Fallback to MRP based price if set
  if (product.mrp && product.mrp > 0) {
    const price = mrpBasedPrice(product.mrp * mult, shopType);
    return { price, source: 'auto' };
  }

  // Fallback to 0 if nothing else works
  return { price: 0, source: 'rbp' };
}

// ─── Step 8: WAC Calculation ───────────────────────────────────────────────────
export function computeWacClient(
  existingQty: number,           // in pcs
  existingWacPerPcs: number,     // ₹ per pcs (what's in products.cost_price or avg_landed_cost)
  newQtyPcs: number,             // new batch qty in pcs
  newLandedCostInput: number,    // raw input (could be ₹/kg, ₹/pcs, or per-pcs landed)
  product: PricingProduct,       // needed to convert kg→pcs if required
  inputBasisOverride?: LandedCostBasis
): { 
  blendedWacPerPcs: number; 
  blendedWacPerKg: number | null;  // null if no weight data
  deltaPct: number; 
  deltaAbs: number;
  inputBasis: LandedCostBasis;
  newLandedPerPcs: number;
} {
  const detected = detectLandedCostBasis(product);
  const basis: LandedCostBasis = inputBasisOverride || detected.basis;
  
  // Step 1: Convert newLandedCostInput → per-pcs
  const levels = landedCostPerLevel(product, newLandedCostInput, basis);
  const newLandedPerPcs = levels.pcs;

  // Step 2: WAC blend in per-pcs space
  const safeExistingQty = Math.max(0, Number(existingQty) || 0);
  const safeExistingWac = Math.max(0, Number(existingWacPerPcs) || 0);
  const safeNewQty = Math.max(0, Number(newQtyPcs) || 0);
  const safeNewLanded = Math.max(0, Number(newLandedPerPcs) || 0);

  const total = safeExistingQty + safeNewQty;
  const blendedWacPerPcs = total === 0 
    ? safeNewLanded 
    : ((safeExistingQty * safeExistingWac) + (safeNewQty * safeNewLanded)) / total;

  // Step 3: Also express in per-kg for display (if weight available)
  const weightG = Number(product.weight_per_unit_grams) || 0;
  const blendedWacPerKg = weightG > 0 ? blendedWacPerPcs * (1000 / weightG) : null;

  const deltaPct = safeExistingWac > 0
    ? ((blendedWacPerPcs - safeExistingWac) / safeExistingWac) * 100
    : 0;

  return {
    blendedWacPerPcs,
    blendedWacPerKg,
    deltaPct: Math.round(deltaPct * 100) / 100,
    deltaAbs: blendedWacPerPcs - safeExistingWac,
    inputBasis: basis,
    newLandedPerPcs: safeNewLanded,
  };
}

// ─── Step 9: Utils ───────────────────────────────────────────────────────────
export function actualMarginPct(price: number, landedCost: number): number {
  if (price <= 0 || price <= landedCost) return 0;
  return Math.round(((price - landedCost) / price) * 100 * 10) / 10;
}

export function mrpBasedPrice(mrp: number, shopType: ShopType): number {
  if (isNaN(mrp)) return 0;
  const discounts: Record<ShopType, number> = {
    premium: 0.60,
    gold:    0.70,
    silver:  0.80,
    bronze:  0.85,
    basic:   0.95,
  };
  return Math.round(mrp * (discounts[shopType] || 0.8) * 100) / 100;
}

// Backward Compatibility Alias
export const calculateLandedUnitPrice = (p: PricingProduct) => {
  const lc = landedCostPerLevel(p);
  return lc.pcs;
};
