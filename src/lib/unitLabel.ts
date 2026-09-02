import { Product } from "@/types";
import { isProductDozenPackaging, normalizePackUnit } from "@/lib/packaging";

export type UnitLabelOptions = {
  short?: boolean;
  fallback?: string;
};

/**
 * Single source of truth for display unit labels across Cart, Catalog, Orders, Invoices, Stock, and Reports.
 * 
 * Rules:
 * 1. Multi-unit or bundle tiers (Packet, Case, Doz, Kg, Ltr, g, Ml) ALWAYS return their tier label.
 *    `item_pack_type` is NEVER allowed to substitute or override a bundle selling tier.
 * 2. `item_pack_type` provides cosmetic container decoration (Pouch, Jar, Bottle, Can, Strip, Box, Bag)
 *    ONLY when the transacted unit is the singular base tier (Pcs/Unit).
 * 3. `item_pack_type === 'packet'` on a singular base sale displays as "Pcs" to prevent confusing
 *    a single piece with a multi-piece bundle packet.
 * 4. Respects `isProductDozenPackaging()` as an intelligent fallback for unconfigured legacy items.
 */
export function resolveDisplayUnit(
  packType: string | null | undefined,
  product?: Partial<Product> | null,
  opts: UnitLabelOptions = {}
): string {
  const { short = false, fallback = "Pcs" } = opts;
  const raw = (packType || "").toLowerCase().trim();

  // 1. Handle missing/empty packType
  if (!raw) {
    if (product && isProductDozenPackaging(product)) {
      return short ? "Doz" : "Dozen";
    }
    return fallback;
  }

  const canonical = normalizePackUnit(raw);

  // 2. Dozen Tier (Multi-piece bundle)
  if (canonical === 'doz') {
    return short ? "Doz" : "Dozen";
  }

  // 3. Multi-unit Bundle Tiers (Packet / Case / Weight / Volume)
  // item_pack_type is NEVER consulted here to override the bundle tier
  if (canonical === 'packet') {
    return short ? "Pkt" : "Packet";
  }

  if (canonical === 'case') {
    const ipt = (product?.item_pack_type || "").toLowerCase().trim();
    if (ipt === 'carton') return "Carton";
    if (ipt === 'bag') return "Bag";
    return "Case";
  }

  if (canonical === 'kg') return "Kg";
  if (canonical === 'g') return short ? "g" : "Grams";
  if (canonical === 'ltr') return short ? "Ltr" : "Litre";
  if (canonical === 'ml') return "Ml";

  // 4. Singular Base Tier (Pcs / Unit)
  // ONLY place where item_pack_type adds container flavor
  if (canonical === 'pcs') {
    if (product) {
      const ipt = (product.item_pack_type || "").toLowerCase().trim();
      if (ipt === "pouch") return "Pouch";
      if (ipt === "jar") return "Jar";
      if (ipt === "bottle" || ipt === "btl") return short ? "Btl" : "Bottle";
      if (ipt === "can") return "Can";
      if (ipt === "box") return "Box";
      if (ipt === "strip") return "Strip";
      if (ipt === "bag") return "Bag";
      if (ipt === "tin") return "Tin";
      if (ipt === "sachet") return "Sachet";
      // Note: ipt === 'packet' on a single piece sale intentionally returns "Pcs"
    }
    return "Pcs";
  }

  // 5. Container-direct names when passed directly as packType (e.g. from legacy DB row)
  if (canonical === 'pouch') return "Pouch";
  if (canonical === 'jar') return "Jar";
  if (canonical === 'bottle') return short ? "Btl" : "Bottle";
  if (canonical === 'can') return "Can";
  if (canonical === 'box') return "Box";
  if (canonical === 'strip') return "Strip";
  if (canonical === 'tin') return "Tin";
  if (canonical === 'sachet') return "Sachet";
  if (canonical === 'bag') return "Bag";

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
