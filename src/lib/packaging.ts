import { Product } from "@/types";
import { normalizeDivisionCategory, normalizeDivisionCategoryForDb, inferTaxonomyCategory, inferTaxonomyDivision, computeTaxBreakdown } from "@/lib/taxonomy";
import { lookupHsnTaxonomy } from "@/lib/hsnTaxonomy";
import { resolveDisplayUnit } from "@/lib/unitLabel";

export type CanonicalUnitTier = 'base' | 'mid' | 'top';

export type CanonicalPackType = 
  | 'pcs' 
  | 'unit' 
  | 'packet' 
  | 'case' 
  | 'doz' 
  | 'kg' 
  | 'g' 
  | 'ml' 
  | 'ltr' 
  | 'box' 
  | 'pouch' 
  | 'bottle' 
  | 'strip' 
  | 'jar' 
  | 'tin' 
  | 'can' 
  | 'bag';

export interface ImportWarning {
  severity: 'info' | 'warning' | 'conflict';
  field: string;
  message: string;
  suggestedFix?: string;
}

export interface UnitProfile {
  rawUnit: string;
  canonicalUnit: string;
  packType: "pcs" | "packet" | "case" | "kg" | "g" | "ml" | "ltr" | "doz" | "unit";
  dbPackType: "unit" | "packet" | "case" | "pouch" | "box" | "jar" | "bottle" | "tin" | "can" | "acb" | "sachet" | "kg" | "doz" | "ltr" | "g" | "ml";
  unit_type: 'pcs' | 'packet' | 'kg_g';
  tier: CanonicalUnitTier;
  
  // Hierarchy multipliers
  units_per_packet: number;
  packets_per_case: number;
  units_per_case: number;
  
  // Base unit conversion multiplier: 1 incoming pack = baseMultiplier base units
  baseMultiplier: number;
  
  // Labels
  baseUnitLabel: string;
  midUnitLabel: string | null;
  topUnitLabel: string;
  displayConversion: string;
  
  // Recommended Product Master Sync fields
  syncPayload: {
    unit_type: 'pcs' | 'packet' | 'kg_g';
    pack_size_unit: string | null;
    preferred_sell_unit: string;
    item_pack_type: string;
    units_per_packet: number;
    packets_per_case: number;
    units_per_case: number;
  };
  
  // Conflict & drift detection
  warnings: ImportWarning[];
  hasConflict: boolean;
}

export interface PackagingInfo {
  baseUnit: string;
  midUnit: string | null;
  topUnit: string;
  midMultiplier: number; // units per mid
  topMultiplier: number; // mid per top (if mid exists) OR units per top
  totalItemsInTop: number;
  retailMin: string;
  whsleMin: string;
  distrMin: string;
  allowKg: boolean;
}

/**
 * Normalizes any free-text unit alias into a standard canonical unit name.
 */
export function normalizePackUnit(rawUnit?: string | null): string {
  if (!rawUnit) return 'pcs';
  const u = rawUnit.toLowerCase().trim().replace(/[^a-z0-9_.]/g, '');
  
  // Dozen aliases
  if (['dz', 'doz', 'dozen', 'dozens', 'dzn', '12s'].includes(u)) return 'doz';
  
  // Case / Carton / Outer box aliases
  if (['cs', 'case', 'cases', 'ctn', 'carton', 'cartons', 'master', 'mastercase', 'outer'].includes(u)) return 'case';
  if (['box', 'boxes', 'bx', 'bxs'].includes(u)) return 'box';
  if (['bag', 'bags', 'sack', 'sacks', 'bsta', 'basta'].includes(u)) return 'bag';
  
  // Packet / Pouch / Inner aliases
  if (['pkt', 'packet', 'packets', 'pack', 'packs', 'pk', 'pkg', 'pkgs', 'pck', 'pckt'].includes(u)) return 'packet';
  if (['pouch', 'pouches', 'pch', 'pchs', 'zipper', 'zipperpouch'].includes(u)) return 'pouch';
  if (['btl', 'bottle', 'bottles', 'bot'].includes(u)) return 'bottle';
  if (['strip', 'strips', 'strp'].includes(u)) return 'strip';
  if (['jar', 'jars'].includes(u)) return 'jar';
  if (['tin', 'tins', 'can', 'cans', 'cn'].includes(u)) return 'tin';
  if (['sachet', 'sachets', 'sch'].includes(u)) return 'sachet';
  
  // Weight & Volume
  if (['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos'].includes(u)) return 'kg';
  if (['g', 'gm', 'gms', 'gram', 'grams', '.gms', 'grm', 'grms'].includes(u)) return 'g';
  if (['ml', 'mls', 'milliliter', 'milliliters', 'millilitre', 'millilitres'].includes(u)) return 'ml';
  if (['l', 'lt', 'ltr', 'ltrs', 'liter', 'liters', 'litre', 'litres'].includes(u)) return 'ltr';
  
  // Discrete base units
  if (['pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'ea', 'each', 'nos', 'no', 'num', 'item', 'items'].includes(u)) return 'pcs';
  
  return u || 'pcs';
}

/**
 * Robust detection of whether a product is packaged/sold in dozens.
 */
export function isProductDozenPackaging(p?: Partial<Product> | null): boolean {
  if (!p) return false;
  const rawPref = (p.preferred_sell_unit || '').toLowerCase().trim();
  if (['doz', 'dozen', 'dz', 'dozens'].includes(rawPref)) return true;

  const rawUnit = ((p as Record<string, unknown>).unit as string || '').toLowerCase().trim();
  if (['doz', 'dozen', 'dz', 'dozens'].includes(rawUnit)) return true;

  if (p.units_per_packet === 12 || p.units_per_case === 12) return true;

  const ipt = (p.item_pack_type || '').toLowerCase().trim();
  if (['doz', 'dozen', 'dz', 'dozens'].includes(ipt)) return true;

  const psu = (p.pack_size_unit || '').toLowerCase().trim();
  if (['doz', 'dozen', 'dz', 'dozens'].includes(psu)) return true;

  const hsn = (p.hsn || '').trim();
  if (hsn === '33074100' || hsn === '3307' || hsn.startsWith('3307')) return true;

  const name = (p.name || '').toLowerCase();
  if (/\b(doz|dozen|dz|12\s*pcs|12pcs|12\s*pc|12pc)\b/i.test(name)) return true;

  const brand = (p.brand || '').toLowerCase();
  const companyCode = (p.company?.short_code || '').toLowerCase();
  const companyName = (p.company?.name || '').toLowerCase();
  const sku = (p.sku || '').toUpperCase();

  // Madhukunj / MK items or Incense / Agarbatti / Pooja / Dhoop items
  const isMadhukunj = brand.includes('madhukunj') || brand.includes('mk') || 
    companyCode === 'mk' || companyName.includes('madhukunj') || 
    name.includes('madhukunj') || name.startsWith('mk ') || name.includes(' mk') ||
    sku.startsWith('MK-') || sku.startsWith('ITEM--MK') || sku.startsWith('ITEM--') || sku.includes('MK');

  const isPoojaOrIncense = /\b(agarbatti|incense|dhoop|sambrani|pooja|bhola|radhe\s*radhe|nature\s*series|real\s*100|zipper\s*real|zipper|camphor|kapoor|pouch|cone|matchbox|loban|guggal|chandan|rose|mogra|lavender|jasmine|sandal)\b/i.test(name);

  if (isMadhukunj || isPoojaOrIncense) {
    const isExplicitWeight = p.unit_type === 'kg_g' || ['kg', 'g', 'ltr', 'ml'].includes(psu);
    if (!isExplicitWeight) return true;
  }

  return false;
}

/**
 * Infers unit type for backward compatibility with old products.
 */
export function inferUnitType(p: Partial<Product>): 'pcs' | 'packet' | 'kg_g' {
  const psu = (p.pack_size_unit || '').toLowerCase();
  const cqu = (p.case_qty_unit || '').toLowerCase();
  const fmt = (p.item_pack_type || '').toLowerCase();
  
  if (['g','gms','kg', 'kilogram', 'kilograms', 'ml','ltr','l'].includes(psu) || cqu === 'kg' || fmt === 'kg') {
    return 'kg_g';
  }
  if ((p.units_per_packet || 0) > 1) return 'packet';
  return 'pcs';
}

/**
 * Detects discrepancies between incoming invoice packaging specifications and product master.
 */
export function detectPackagingConflicts(
  product: Partial<Product> | null | undefined,
  invoicePack: {
    rawUnit?: string;
    packType?: string;
    unitsPerPacket?: number;
    packetsPerCase?: number;
    unitsPerCase?: number;
    packSizeValue?: number;
    packSizeUnit?: string;
  }
): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  if (!product) return warnings;

  const invUpp = invoicePack.unitsPerPacket;
  const prodUpp = product.units_per_packet;
  if (invUpp && prodUpp && invUpp > 1 && prodUpp > 1 && invUpp !== prodUpp) {
    warnings.push({
      severity: 'warning',
      field: 'units_per_packet',
      message: `Invoice specifies ${invUpp} units/pack, but product master configured for ${prodUpp} units/pack.`,
      suggestedFix: `Update product master units_per_packet to ${invUpp}.`
    });
  }

  const invUpc = invoicePack.unitsPerCase || ((invoicePack.unitsPerPacket || 1) * (invoicePack.packetsPerCase || 1));
  const prodUpc = product.units_per_case || ((product.units_per_packet || 1) * (product.packets_per_case || 1));
  if (invUpc > 1 && prodUpc > 1 && invUpc !== prodUpc) {
    warnings.push({
      severity: 'warning',
      field: 'units_per_case',
      message: `Invoice specifies ${invUpc} total units/case, but product master has ${prodUpc} units/case.`,
      suggestedFix: `Update product master units_per_case to ${invUpc}.`
    });
  }

  const invUnit = normalizePackUnit(invoicePack.rawUnit || invoicePack.packType);
  const isProdWeight = product.unit_type === 'kg_g' || ['kg', 'g', 'ml', 'ltr'].includes((product.pack_size_unit || '').toLowerCase());
  const isInvWeight = ['kg', 'g', 'ml', 'ltr'].includes(invUnit);

  if (isInvWeight && !isProdWeight && product.name) {
    warnings.push({
      severity: 'info',
      field: 'unit_type',
      message: `Received line in weight unit '${invUnit}' for piece product '${product.name}'.`,
      suggestedFix: `Configure unit_type='kg_g' and pack weight if this is sold by weight.`
    });
  }

  return warnings;
}

/**
 * Universal Unit-Label Auto-Sync Engine:
 * Resolves raw incoming unit text, product configuration, and extracted multipliers into
 * a canonical, self-describing packaging profile with hierarchy multipliers, base conversions,
 * display labels, and product sync payloads.
 */
export function resolveUnitProfile(
  rawUnit?: string | null,
  product?: Partial<Product> | null,
  extractedMultipliers?: {
    units_per_packet?: number;
    packets_per_case?: number;
    units_per_case?: number;
    pack_size_value?: number;
    pack_size_unit?: string;
  } | null
): UnitProfile {
  const safeP = product || {};
  const normalizedUnit = normalizePackUnit(rawUnit);
  const explicitUpp = extractedMultipliers?.units_per_packet || safeP.units_per_packet;
  const isDozenItem = normalizedUnit === 'doz' || safeP.preferred_sell_unit === 'doz' || explicitUpp === 12 || (isProductDozenPackaging(safeP) && (!explicitUpp || explicitUpp === 1 || explicitUpp === 12));

  // 1. Resolve Multipliers from Extracted Info or Product Master
  let upp = 1;
  if (extractedMultipliers?.units_per_packet && extractedMultipliers.units_per_packet > 1) {
    upp = Number(extractedMultipliers.units_per_packet);
  } else if (safeP.units_per_packet && Number(safeP.units_per_packet) > 1) {
    upp = Number(safeP.units_per_packet);
  } else if (isDozenItem) {
    upp = 12;
  }

  let ppc = 1;
  if (extractedMultipliers?.packets_per_case && extractedMultipliers.packets_per_case > 1) {
    ppc = Number(extractedMultipliers.packets_per_case);
  } else if (safeP.packets_per_case && Number(safeP.packets_per_case) > 1) {
    ppc = Number(safeP.packets_per_case);
  }

  let upc = upp * ppc;
  if (extractedMultipliers?.units_per_case && extractedMultipliers.units_per_case > 1) {
    upc = Number(extractedMultipliers.units_per_case);
  } else if (safeP.units_per_case && Number(safeP.units_per_case) > 1) {
    upc = Number(safeP.units_per_case);
  }

  if (upc < upp * ppc && ppc > 1) {
    upc = upp * ppc;
  }

  // 2. Resolve Unit Type
  let unitType: 'pcs' | 'packet' | 'kg_g' = 'pcs';
  const psu = (extractedMultipliers?.pack_size_unit || safeP.pack_size_unit || '').toLowerCase();
  const isWeightOrVolume = ['g', 'gms', 'gm', 'kg', 'kgs', 'ml', 'ltr', 'l'].includes(normalizedUnit) ||
    ['g', 'gms', 'gm', 'kg', 'kgs', 'ml', 'ltr', 'l'].includes(psu) ||
    safeP.unit_type === 'kg_g';

  if (isWeightOrVolume) {
    unitType = 'kg_g';
  } else if (upp > 1 && !isDozenItem) {
    unitType = 'packet';
  } else {
    unitType = 'pcs';
  }

  // 3. Resolve Tier and Base Multiplier for the Incoming Pack
  let tier: CanonicalUnitTier = 'base';
  let baseMultiplier = 1;
  let packType: UnitProfile['packType'] = 'pcs';

  if (normalizedUnit === 'doz') {
    tier = 'mid';
    baseMultiplier = 12;
    packType = 'doz';
  } else if (['case', 'carton', 'bag', 'tin'].includes(normalizedUnit)) {
    tier = 'top';
    baseMultiplier = Math.max(1, upc);
    packType = 'case';
  } else if (['packet', 'box', 'strip', 'pouch', 'jar', 'sachet'].includes(normalizedUnit)) {
    tier = upp > 1 ? 'mid' : 'base';
    baseMultiplier = Math.max(1, upp);
    packType = 'packet';
  } else if (normalizedUnit === 'kg') {
    tier = 'base';
    packType = 'kg';
    const wpug = safeP.weight_per_unit_grams || 
      (['g', 'gms', 'gm', 'grams', 'ml'].includes(psu) ? safeP.pack_size_value : 
      (['kg', 'ltr', 'l'].includes(psu) ? (safeP.pack_size_value || 0) * 1000 : 0)) || 0;
    baseMultiplier = wpug > 0 ? (1000 / wpug) : 1000;
  } else if (normalizedUnit === 'g') {
    tier = 'base';
    packType = 'g';
    const wpug = safeP.weight_per_unit_grams || safeP.pack_size_value || 0;
    baseMultiplier = wpug > 0 ? (1 / wpug) : 1;
  } else if (normalizedUnit === 'ltr') {
    tier = 'base';
    packType = 'ltr';
    const mlVal = (safeP.pack_size_unit === 'ml' ? safeP.pack_size_value : 0) || 0;
    baseMultiplier = mlVal > 0 ? (1000 / mlVal) : 1000;
  } else if (normalizedUnit === 'ml') {
    tier = 'base';
    packType = 'ml';
    const mlVal = (safeP.pack_size_unit === 'ml' ? safeP.pack_size_value : 0) || 0;
    baseMultiplier = mlVal > 0 ? (1 / mlVal) : 1;
  } else {
    tier = 'base';
    baseMultiplier = 1;
    packType = 'pcs';
  }

  // 4. Derive Base, Mid, and Top Labels
  const rawBaseLabel = resolveDisplayUnit('pcs', safeP);
  const baseUnitLabel = unitType === 'kg_g' ? (safeP.pack_size_unit || 'g') : (['Unit/Pcs', 'Unit'].includes(rawBaseLabel) ? 'Pcs' : rawBaseLabel);
  let midUnitLabel: string | null = null;
  if (isDozenItem) {
    midUnitLabel = 'Dozen';
  } else if (normalizedUnit === 'box') {
    midUnitLabel = 'Box';
  } else if (normalizedUnit === 'strip') {
    midUnitLabel = 'Strip';
  } else if (upp > 1) {
    midUnitLabel = 'Packet';
  }

  let topUnitLabel = 'Case';
  if (normalizedUnit === 'bag' || safeP.item_pack_type === 'bag') {
    topUnitLabel = 'Bag';
  } else if (normalizedUnit === 'carton' || safeP.item_pack_type === 'carton') {
    topUnitLabel = 'Carton';
  }

  // 5. Display Conversion String
  let displayConversion = `1 ${normalizedUnit.toUpperCase()} = ${baseMultiplier} ${baseUnitLabel}`;
  if (normalizedUnit === 'doz') {
    displayConversion = `1 Doz = 12 ${baseUnitLabel}`;
  } else if (normalizedUnit === 'case') {
    if (midUnitLabel && ppc > 1) {
      displayConversion = `1 ${topUnitLabel} = ${ppc} ${midUnitLabel} (${upc} ${baseUnitLabel})`;
    } else {
      displayConversion = `1 ${topUnitLabel} = ${upc} ${baseUnitLabel}`;
    }
  } else if (normalizedUnit === 'packet' || normalizedUnit === 'box') {
    displayConversion = `1 ${midUnitLabel || 'Packet'} = ${upp} ${baseUnitLabel}`;
  }

  // 6. Preferred Sell Unit & Item Pack Type for Database Sync
  let preferredSellUnit = safeP.preferred_sell_unit || (isDozenItem ? 'doz' : (unitType === 'kg_g' ? (psu.startsWith('k') ? 'kg' : 'g') : (upp > 1 ? 'packet' : 'pcs')));
  if (isDozenItem && (!safeP.preferred_sell_unit || safeP.preferred_sell_unit === 'pcs')) {
    preferredSellUnit = 'doz';
  }

  const itemPackType = safeP.item_pack_type || (isDozenItem ? 'doz' : (normalizedUnit === 'box' ? 'box' : (normalizedUnit === 'strip' ? 'strip' : (normalizedUnit === 'pouch' ? 'pouch' : (unitType === 'kg_g' ? (psu.startsWith('k') ? 'kg' : 'g') : 'packet')))));

  const dbPackType = toDbPackType(normalizedUnit || itemPackType);

  // 7. Detect Conflicts
  const warnings = detectPackagingConflicts(safeP, {
    rawUnit: normalizedUnit,
    packType,
    unitsPerPacket: upp,
    packetsPerCase: ppc,
    unitsPerCase: upc,
    packSizeValue: extractedMultipliers?.pack_size_value,
    packSizeUnit: extractedMultipliers?.pack_size_unit
  });

  return {
    rawUnit: rawUnit || 'pcs',
    canonicalUnit: normalizedUnit,
    packType,
    dbPackType,
    unit_type: unitType,
    tier,
    units_per_packet: upp,
    packets_per_case: ppc,
    units_per_case: upc,
    baseMultiplier,
    baseUnitLabel,
    midUnitLabel,
    topUnitLabel,
    displayConversion,
    syncPayload: {
      unit_type: unitType,
      pack_size_unit: psu || (unitType === 'kg_g' ? 'g' : null),
      preferred_sell_unit: preferredSellUnit,
      item_pack_type: itemPackType,
      units_per_packet: upp,
      packets_per_case: ppc,
      units_per_case: upc
    },
    warnings,
    hasConflict: warnings.some(w => w.severity === 'conflict')
  };
}

function deriveKgPackaging(p: Partial<Product>): PackagingInfo {
  const dw = (p.display_weight_unit || p.pack_size_unit || 'g').toLowerCase();
  const isLiquid = ['ml','ltr','l'].includes(dw);
  const baseUnit = isLiquid ? 'ml' : 'g';
  const topUnit = p.item_pack_type === 'bag' ? 'Bag' : (p.item_pack_type === 'box' || p.item_pack_type === 'carton' ? 'Carton' : 'Case');
  
  const midMultiplier = p.units_per_packet || 1;
  const topMultiplier = p.packets_per_case || 1;
  let totalItemsInTop = p.units_per_case || (midMultiplier * topMultiplier);

  // If we have case_qty_value/unit and it matches weight units, use that for total pcs in case
  if (totalItemsInTop <= 1 && (p.case_qty_value || 0) > 0 && (p.pack_size_value || 0) > 0) {
    const psu = (p.pack_size_unit || 'g').toLowerCase();
    const cqu = (p.case_qty_unit || 'unit').toLowerCase();
    
    if (cqu === 'kg' && ['g', 'gms', 'gm', 'grams'].includes(psu)) {
      totalItemsInTop = ((p.case_qty_value || 0) * 1000) / (p.pack_size_value || 1);
    } else if (cqu === psu) {
      totalItemsInTop = (p.case_qty_value || 0) / (p.pack_size_value || 1);
    }
  }

  return {
    baseUnit,
    midUnit: midMultiplier > 1 ? 'Packet' : null,
    topUnit,
    midMultiplier,
    topMultiplier: midMultiplier > 1 ? topMultiplier : totalItemsInTop,
    totalItemsInTop: Math.round(totalItemsInTop),
    retailMin: `1 ${dw}`,
    whsleMin: `1 ${topUnit}`,
    distrMin: `1 ${topUnit}`,
    allowKg: true
  };
}

function derivePacketPackaging(p: Partial<Product>): PackagingInfo {
  const midMultiplier = p.units_per_packet || 1;
  const topMultiplier = p.packets_per_case || 1;
  const totalItemsInTop = p.units_per_case || (midMultiplier * topMultiplier);

  return {
    baseUnit: 'pcs',
    midUnit: 'Packet',
    topUnit: 'Case',
    midMultiplier,
    topMultiplier,
    totalItemsInTop: Math.round(totalItemsInTop),
    retailMin: `1 Packet`,
    whsleMin: `1 Case`,
    distrMin: `1 Case`,
    allowKg: false
  };
}

function deriveDozenPackaging(p: Partial<Product>): PackagingInfo {
  const ppc = p.packets_per_case || 1;
  const hasCase = ppc > 1 || (p.units_per_case && p.units_per_case > 12);

  if (hasCase) {
    const totalItems = p.units_per_case || (ppc * 12);
    return {
      baseUnit: 'pcs',
      midUnit: 'Doz',
      topUnit: 'Case',
      midMultiplier: 12,
      topMultiplier: ppc,
      totalItemsInTop: Math.round(totalItems),
      retailMin: '1 pcs',
      whsleMin: '1 Doz',
      distrMin: '1 Case',
      allowKg: false
    };
  }

  return {
    baseUnit: 'pcs',
    midUnit: null,
    topUnit: 'Doz',
    midMultiplier: 1,
    topMultiplier: 12,
    totalItemsInTop: 12,
    retailMin: '1 pcs',
    whsleMin: '1 Doz',
    distrMin: '1 Doz',
    allowKg: false
  };
}

function derivePcsPackaging(p: Partial<Product>): PackagingInfo {
  const totalItemsInTop = p.units_per_case || 1;
  return {
    baseUnit: 'pcs',
    midUnit: null,
    topUnit: 'Case',
    midMultiplier: 1,
    topMultiplier: totalItemsInTop,
    totalItemsInTop: Math.round(totalItemsInTop),
    retailMin: p.is_chain_item ? `1 unit` : `1 pcs`,
    whsleMin: `1 Case`,
    distrMin: `1 Case`,
    allowKg: false
  };
}

export function derivePackaging(p: Partial<Product> | null | undefined): PackagingInfo {
  const safeP = p || {};
  if (isProductDozenPackaging(safeP)) {
    return deriveDozenPackaging(safeP);
  }
  const unitType = safeP.unit_type || inferUnitType(safeP);

  if (unitType === 'kg_g') {
    return deriveKgPackaging(safeP);
  } else if (unitType === 'packet') {
    return derivePacketPackaging(safeP);
  } else {
    return derivePcsPackaging(safeP);
  }
}

/**
 * Returns the sell units a product can be sold in, in order of preference.
 */
export function getAvailableSellUnits(p: Partial<Product>): string[] {
  const safeP = p || {};
  const psu = (safeP.pack_size_unit || '').toLowerCase();
  const dw = (safeP.display_weight_unit || psu || '').toLowerCase();
  const isLiquid = ['ltr', 'l', 'liter', 'litre'].includes(dw) || ['ltr', 'l', 'liter', 'litre'].includes(psu);
  const isBulkKg = ['kg', 'kilogram', 'kilograms'].includes(dw) || ['kg', 'kilogram', 'kilograms'].includes(psu) || (safeP.unit_type === 'kg_g') || (safeP.weight_per_unit_grams || 0) >= 1000;
  
  const rawPref = (safeP.preferred_sell_unit || '').toLowerCase().trim();
  const isDozen = isProductDozenPackaging(safeP);

  const upp = Number(safeP.units_per_packet) || 1;
  const ppc = Number(safeP.packets_per_case) || 1;
  const upc = (safeP.units_per_case && Number(safeP.units_per_case) > 1) 
    ? Number(safeP.units_per_case) 
    : (upp * ppc);

  const units: string[] = [];

  if (isDozen) {
    // For dozen items (agarbatti, pooja pouches, etc.), primary units are Doz and Pcs
    if (rawPref === 'pcs' || rawPref === 'unit' || rawPref === 'pc') {
      units.push('pcs', 'doz');
    } else {
      units.push('doz', 'pcs');
    }
    // Only include case if there is a real outer master carton (> 12 pcs)
    if (upc > 12 && ppc > 1) {
      units.push('case');
    }
  } else if (isBulkKg) {
    if (rawPref === 'g' || rawPref === 'gms') {
      units.push('g', 'kg', 'pcs');
    } else {
      units.push('kg', 'g', 'pcs');
    }
  } else if (isLiquid) {
    if (rawPref === 'ml') {
      units.push('ml', 'ltr', 'pcs');
    } else {
      units.push('ltr', 'ml', 'pcs');
    }
  } else {
    // Standard FMCG piece/packet/case
    if (upp > 1 && upc > upp) {
      if (rawPref === 'case') units.push('case', 'packet', 'pcs');
      else if (rawPref === 'pcs') units.push('pcs', 'packet', 'case');
      else units.push('packet', 'pcs', 'case');
    } else if (upp > 1) {
      if (rawPref === 'pcs') units.push('pcs', 'packet');
      else units.push('packet', 'pcs');
    } else if (upc > 1) {
      if (rawPref === 'case') units.push('case', 'pcs');
      else units.push('pcs', 'case');
    } else {
      units.push('pcs');
    }
  }

  // Ensure preferred_sell_unit is always present
  if (rawPref) {
    const normPref = (rawPref === 'unit' || rawPref === 'pc') ? 'pcs' 
      : (rawPref === 'pkt' ? 'packet' 
      : (rawPref === 'dozen' || rawPref === 'dz' ? 'doz' 
      : (rawPref === 'carton' || rawPref === 'ctn' ? 'case' : rawPref)));
    if (['pcs', 'packet', 'case', 'doz', 'kg', 'g', 'ltr', 'ml'].includes(normPref) && !units.includes(normPref)) {
      units.unshift(normPref);
    }
  }

  return units.length > 0 ? units : ['pcs'];
}

/**
 * Frontend mirror of the DB convert_to_base_units() function.
 */
export function convertToBaseUnits(
  qty: number,
  sellUnit: string,
  p: Partial<Product>
): number {
  const safeP = p || {};
  const unitType = safeP.unit_type || inferUnitType(safeP);
  const upp = safeP.units_per_packet || 1;
  const ppc = safeP.packets_per_case || 1;
  const upc = (safeP.units_per_case && Number(safeP.units_per_case) > 1) 
    ? Number(safeP.units_per_case) 
    : ((upp * ppc) > 1 ? (upp * ppc) : 1);
  const unit = (sellUnit || 'pcs').toLowerCase();

  const isPieceUnit = ['pcs', 'unit', 'pc', 'pouch', 'jar', 'bottle', 'can', 'bag', 'box', 'strip'].includes(unit);

  if (unit === 'doz' || unit === 'dozen' || unit === 'dz') return qty * 12;

  if (unitType === 'kg_g') {
    const psu = (safeP.pack_size_unit || 'g').toLowerCase();
    const wpug = safeP.weight_per_unit_grams || 
      (['g', 'gms', 'gm', 'grams', 'ml'].includes(psu) ? safeP.pack_size_value : 
      (['kg', 'ltr', 'l'].includes(psu) ? (safeP.pack_size_value || 0) * 1000 : 0)) || 0;

    if (wpug && wpug > 0) {
      if (isPieceUnit) return qty;
      if (unit === 'packet' || unit === 'pkt') return qty * upp;
      if (unit === 'case' || unit === 'ctn' || unit === 'carton') return qty * upc;
      if (unit === 'g' || unit === 'gms' || unit === 'ml') return qty / wpug;
      if (unit === 'kg' || unit === 'ltr' || unit === 'l') return (qty * 1000) / wpug;
    } else {
      if (isPieceUnit) return qty;
      if (unit === 'packet' || unit === 'pkt') return qty * upp;
      if (unit === 'case' || unit === 'ctn' || unit === 'carton') return qty * upc;
      if (unit === 'g' || unit === 'gms' || unit === 'ml') return qty;
      if (unit === 'kg' || unit === 'ltr' || unit === 'l') return qty * 1000;
    }
  } else {
    if (isPieceUnit) return qty;
    if (unit === 'packet' || unit === 'pkt') return qty * upp;
    if (unit === 'case' || unit === 'ctn' || unit === 'carton') return qty * upc;
  }

  return qty;
}

export interface StockBreakdown {
  cases: number;
  packets: number;
  dozens: number;
  units: number;
  weightValue: number;
  weightUnit: string;
  isLiquid: boolean;
  hasCases: boolean;
  hasPackets: boolean;
  hasDozens: boolean;
}

/**
 * Returns a detailed breakdown of stock into top/mid/base units.
 */
export function getDetailedStockBreakdown(stockBaseUnits: number, p: Partial<Product>): StockBreakdown {
  const safeP = p || {};
  const isDozen = isProductDozenPackaging(safeP);

  const upp = safeP.units_per_packet || (isDozen ? 12 : 1);
  const ppc = safeP.packets_per_case || 1;
  const upc = safeP.units_per_case && Number(safeP.units_per_case) > 1 
    ? Number(safeP.units_per_case) 
    : (isDozen ? (ppc > 1 ? 12 * ppc : 12) : (upp * ppc));

  // If dozen item and upc <= 12, it doesn't have a separate outer case
  const hasCases = isDozen ? (upc > 12 && ppc > 1) : (upc > 1);
  const hasPackets = !isDozen && upp > 1;
  const hasDozens = isDozen;

  const psu = (safeP.pack_size_unit || 'g').toLowerCase();
  const wpug = safeP.weight_per_unit_grams || 
    (['g', 'gms', 'gm', 'grams', 'ml'].includes(psu) ? safeP.pack_size_value : 
    (['kg', 'ltr', 'l'].includes(psu) ? (safeP.pack_size_value || 0) * 1000 : 0)) || 0;
  
  const dw = (safeP.display_weight_unit || safeP.pack_size_unit || 'g').toLowerCase();
  const isLiquid = ['ml','ltr','l'].includes(dw);
  
  let cases = 0;
  let packets = 0;
  let dozens = 0;
  let units = stockBaseUnits;
  
  if (hasCases && upc > 1) {
    cases = Math.floor(stockBaseUnits / upc);
    units = stockBaseUnits % upc;
  }
  
  if (hasDozens) {
    dozens = Math.floor(units / 12);
    units = units % 12;
  } else if (hasPackets && upp > 1) {
    packets = Math.floor(units / upp);
    units = units % upp;
  }

  // Weight Calculation
  let weightValue = 0;
  let weightUnit = isLiquid ? 'ltr' : 'kg';
  
  if (wpug && wpug > 0) {
    const totalGrams = stockBaseUnits * wpug;
    if (totalGrams < 1000) {
      weightValue = totalGrams;
      weightUnit = isLiquid ? 'ml' : 'g';
    } else {
      weightValue = totalGrams / 1000;
    }
  } else {
    // Loose bulk
    if (stockBaseUnits < 1000) {
      weightValue = stockBaseUnits;
      weightUnit = isLiquid ? 'ml' : 'g';
    } else {
      weightValue = stockBaseUnits / 1000;
    }
  }

  return {
    cases,
    packets,
    dozens,
    units,
    weightValue,
    weightUnit,
    isLiquid,
    hasCases,
    hasPackets,
    hasDozens
  };
}

/**
 * Returns a highly compact inventory string for cards/mobile views: DOZ/CS/PKT/U/KG
 */
export function getCompactStockString(stockBaseUnits: number, p: Partial<Product>): string {
  if (!stockBaseUnits || stockBaseUnits <= 0) return "0 Stock";

  const breakdown = getDetailedStockBreakdown(stockBaseUnits, p);
  
  // If unit_type is explicitly weight-based, prioritize total weight
  if (p.unit_type === 'kg_g') {
    const w = breakdown.weightValue >= 10 ? Math.round(breakdown.weightValue) : breakdown.weightValue.toFixed(1);
    return `${w} ${breakdown.weightUnit}`;
  }

  const parts: string[] = [];
  
  // Cases
  if (breakdown.hasCases && breakdown.cases > 0) {
     parts.push(`${breakdown.cases} Cs`);
  }

  // Dozens
  if (breakdown.hasDozens && breakdown.dozens > 0) {
    parts.push(`${breakdown.dozens} Doz`);
  }
  
  // Packets
  if (breakdown.hasPackets && breakdown.packets > 0) {
    parts.push(`${breakdown.packets} Pkt`);
  }
  
  // Loose Units
  if (breakdown.units > 0 || parts.length === 0) {
    const rawLabel = resolveDisplayUnit('pcs', p);
    const label = rawLabel === 'Unit/Pcs' ? 'Pcs' : rawLabel === 'Pouch' ? 'Pouch' : rawLabel === 'Jar' ? 'Jar' : rawLabel;
    parts.push(`${breakdown.units} ${label}`);
  }
  
  return parts.join(" + ");
}

/**
 * Returns a human-readable stock string appropriate for this product's unit_type.
 */
export function formatStockDisplay(stockBaseUnits: number, p: Partial<Product>): string {
  const safeP = p || {};
  const isDozen = isProductDozenPackaging(safeP);

  if (isDozen) {
    const dozens = Math.floor(stockBaseUnits / 12);
    const rem = stockBaseUnits % 12;
    if (dozens > 0 && rem > 0) return `${dozens} doz + ${rem} pcs`;
    if (dozens > 0) return `${dozens} doz`;
    return `${stockBaseUnits} pcs`;
  }

  const unitType = p.unit_type || inferUnitType(p);
  const upp = p.units_per_packet || 1;
  const upc = p.units_per_case || 1;

  if (unitType === 'pcs') {
    if (upc > 1 && stockBaseUnits >= upc) {
      const cases = Math.floor(stockBaseUnits / upc);
      const rem   = Math.round((stockBaseUnits % upc) * 100) / 100;
      return rem > 0 ? `${cases} case${cases > 1 ? 's' : ''} + ${rem} pcs` : `${cases} case${cases > 1 ? 's' : ''}`;
    }
    return `${stockBaseUnits} pcs`;
  }

  if (unitType === 'packet') {
    if (upp > 1) {
      const pkts = Math.floor(stockBaseUnits / upp);
      const rem  = Math.round((stockBaseUnits % upp) * 100) / 100;
      const parts = [];
      if (pkts > 0) parts.push(`${pkts} packet${pkts > 1 ? 's' : ''}`);
      if (rem  > 0) parts.push(`${rem} pcs`);
      return parts.length ? parts.join(' + ') : '0 packets';
    }
    return `${stockBaseUnits} pcs`;
  }

  if (unitType === 'kg_g') {
    const psu = (p.pack_size_unit || 'g').toLowerCase();
    const wpug = p.weight_per_unit_grams || 
      (['g', 'gms', 'gm', 'grams', 'ml'].includes(psu) ? p.pack_size_value : 
      (['kg', 'ltr', 'l'].includes(psu) ? (p.pack_size_value || 0) * 1000 : 0)) || 0;
    const dw   = (p.display_weight_unit || p.pack_size_unit || 'g').toLowerCase();
    const isLiquid = ['ml','ltr','l'].includes(dw);

    if (wpug && wpug > 0) {
      const totalGrams = stockBaseUnits * wpug;
      const unitLabel = resolveDisplayUnit('pcs', p);
      if (dw === 'kg' || dw === 'ltr' || totalGrams >= 1000) {
        return `${(totalGrams / 1000).toFixed(3)} ${isLiquid ? 'ltr' : 'kg'} (${stockBaseUnits} ${unitLabel})`;
      }
      return `${totalGrams.toFixed(0)} ${isLiquid ? 'ml' : 'g'} (${stockBaseUnits} ${unitLabel})`;
    } else {
      if (dw === 'kg' || dw === 'ltr' || stockBaseUnits >= 1000) {
        return `${(stockBaseUnits / 1000).toFixed(3)} ${isLiquid ? 'ltr' : 'kg'}`;
      }
      return `${stockBaseUnits.toFixed(0)} ${isLiquid ? 'ml' : 'g'}`;
    }
  }

  return `${stockBaseUnits}`;
}

export function buildPackLabel(p: Partial<Product>): string {
  const info = derivePackaging(p);
  const parts = [];
  
  if (info.midUnit && info.midMultiplier > 1) {
    parts.push(`1 ${info.midUnit} = ${info.midMultiplier} ${info.baseUnit}`);
  }
  
  if (info.midUnit) {
    parts.push(`1 ${info.topUnit} = ${info.topMultiplier} ${info.midUnit}`);
  } else if (info.topMultiplier > 1) {
    parts.push(`1 ${info.topUnit} = ${info.topMultiplier} ${info.baseUnit}`);
  }
  
  return parts.join(" | ");
}

/** @deprecated Use formatStockDisplay instead */
export function formatStockBreakdown(stockUnits: number, p: Partial<Product>): string {
  return formatStockDisplay(stockUnits, p);
}

export function computeWeightPerUnit(value: number | null, unit: string | null): number | null {
  if (!value || !unit) return null;
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'gms' || u === '.gms' || u === 'ml') return value;
  if (u === 'kg' || u === 'kgs' || u === 'ltr' || u === 'l') return value * 1000;
  return null;
}

/**
 * Safely converts any UI/internal pack type string into a valid Postgres public.pack_type enum value.
 * Expanded to preserve doz, ltr, g, ml lossless representations.
 */
export function toDbPackType(packType?: string | null): "unit" | "packet" | "case" | "pouch" | "box" | "jar" | "bottle" | "tin" | "can" | "acb" | "sachet" | "kg" | "doz" | "ltr" | "g" | "ml" {
  if (!packType) return "unit";
  const pt = packType.toLowerCase().trim();
  if (pt === "unit" || pt === "pcs" || pt === "pc") return "unit";
  if (pt === "doz" || pt === "dozen" || pt === "dz") return "doz";
  if (pt === "ltr" || pt === "l" || pt === "liter" || pt === "litre") return "ltr";
  if (pt === "g" || pt === "gms" || pt === "gm" || pt === "grams") return "g";
  if (pt === "ml" || pt === "milliliter") return "ml";
  if (pt === "kg" || pt === "kgs" || pt === "kilogram") return "kg";
  if (pt === "case" || pt === "ctn" || pt === "carton") return "case";
  if (pt === "packet" || pt === "pkt" || pt === "pack") return "packet";
  if (pt === "pouch") return "pouch";
  if (pt === "box") return "box";
  if (pt === "jar") return "jar";
  if (pt === "bottle" || pt === "btl") return "bottle";
  if (pt === "tin") return "tin";
  if (pt === "can") return "can";
  if (pt === "acb") return "acb";
  if (pt === "sachet") return "sachet";
  return "unit";
}

export interface ProductDbPayload {
  name: string;
  sku: string;
  mrp: number;
  hsn: string | null;
  min_stock: number;
  is_active: boolean;
  units_per_packet: number;
  packets_per_case: number;
  units_per_case: number;
  item_pack_type: string | null;
  division_category: string;
  division?: string | null;
  sub_category?: string | null;
  gst_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  preferred_sell_unit: string | null;
  brand: string | null;
  pack_size_value: number | null;
  pack_size_unit: string | null;
  unit: string | null;
  company_id?: string | null;
  weight_per_unit_grams?: number | null;
  selling_price?: number | null;
}

/**
 * Sanitizes any raw product or form state into a strictly-valid payload matching the Supabase `products` table schema.
 */
export function sanitizeProductForDb(raw: Record<string, unknown>): ProductDbPayload {
  const upp = Math.max(1, Number(raw.units_per_packet) || 1);
  const ppc = Math.max(1, Number(raw.packets_per_case) || 1);
  const upc = raw.unit_type === 'pcs' && raw.units_per_case && Number(raw.units_per_case) > 1
    ? Number(raw.units_per_case)
    : (upp * ppc);

  const weightUnit = (raw.pack_size_unit || "").toString().toLowerCase();
  let standardizedPackUnit = raw.pack_size_unit ? String(raw.pack_size_unit) : null;
  if (weightUnit === "g" || weightUnit === "gms" || weightUnit === ".gms") standardizedPackUnit = "g";
  if (weightUnit === "kg" || weightUnit === "kgs") standardizedPackUnit = "Kg";
  if (weightUnit === "ml") standardizedPackUnit = "ml";
  if (weightUnit === "ltr" || weightUnit === "l") standardizedPackUnit = "ltr";

  const packSizeVal = raw.pack_size_value != null && raw.pack_size_value !== ""
    ? Number(raw.pack_size_value)
    : null;

  const rawName = String(raw.name || "").trim();
  const rawHsn = raw.hsn ? String(raw.hsn).trim() : null;
  const safeDivisionCategory = normalizeDivisionCategoryForDb(
    raw.division_category ? String(raw.division_category) : null,
    rawName,
    rawHsn
  );

  const safeDivision = raw.division ? String(raw.division).trim() : inferTaxonomyDivision(safeDivisionCategory);

  // Compute tax rates accurately
  let gst = raw.gst_rate !== undefined && raw.gst_rate !== null && raw.gst_rate !== "" ? Number(raw.gst_rate) : 0;
  if (gst === 0 && rawHsn) {
    const hsnMatch = lookupHsnTaxonomy(rawHsn);
    if (hsnMatch && hsnMatch.defaultGstRate) {
      gst = hsnMatch.defaultGstRate;
    }
  }
  const taxBreakdown = computeTaxBreakdown(gst);
  const cgst = raw.cgst_rate !== undefined && raw.cgst_rate !== null && raw.cgst_rate !== "" 
    ? Number(raw.cgst_rate) 
    : taxBreakdown.cgst_rate;
  const sgst = raw.sgst_rate !== undefined && raw.sgst_rate !== null && raw.sgst_rate !== "" 
    ? Number(raw.sgst_rate) 
    : taxBreakdown.sgst_rate;
  const igst = raw.igst_rate !== undefined && raw.igst_rate !== null && raw.igst_rate !== "" 
    ? Number(raw.igst_rate) 
    : taxBreakdown.igst_rate;

  const inferredUnitType = raw.unit_type ? String(raw.unit_type) : (
    (weightUnit === "kg" || weightUnit === "kgs" || weightUnit === "g" || weightUnit === "gms") ? "kg_g" : "packet"
  );
  const cleanItemPackType = (raw.item_pack_type as string) || (
    inferredUnitType === "kg_g" ? (weightUnit.startsWith("k") ? "kg" : "g") : "packet"
  );
  const cleanPreferredSellUnit = (raw.preferred_sell_unit as string) || (
    inferredUnitType === "kg_g" ? (weightUnit.startsWith("k") ? "kg" : "g") : "packet"
  );
  const cleanUnit = (raw.unit as string) || (
    inferredUnitType === "kg_g" ? (weightUnit.startsWith("k") ? "kg" : "g") : "packet"
  );

  const clean: ProductDbPayload = {
    name: String(raw.name || "").trim(),
    sku: String(raw.sku || "").trim().toUpperCase(),
    mrp: Number(raw.mrp) || 0,
    hsn: rawHsn,
    min_stock: Number(raw.min_stock) || 0,
    is_active: raw.is_active !== undefined ? Boolean(raw.is_active) : true,
    units_per_packet: upp,
    packets_per_case: ppc,
    units_per_case: upc,
    item_pack_type: cleanItemPackType,
    division_category: safeDivisionCategory,
    division: safeDivision,
    sub_category: (raw.sub_category as string) || null,
    gst_rate: gst,
    cgst_rate: cgst,
    sgst_rate: sgst,
    igst_rate: igst,
    preferred_sell_unit: cleanPreferredSellUnit,
    brand: (raw.brand as string) || null,
    pack_size_value: packSizeVal,
    pack_size_unit: standardizedPackUnit,
    unit: cleanUnit,
  };

  if (raw.company_id) {
    clean.company_id = String(raw.company_id);
  }
  if (raw.weight_per_unit_grams != null && raw.weight_per_unit_grams !== "") {
    clean.weight_per_unit_grams = Number(raw.weight_per_unit_grams);
  }
  if (raw.selling_price != null && raw.selling_price !== "") {
    clean.selling_price = Number(raw.selling_price);
  }

  return clean;
}

export { persistProductToSupabase } from "@/lib/productPersistence";
