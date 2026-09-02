import { Product } from '@/types';
import { token_set_ratio } from 'fuzzball';

export type InvoiceType = 'TYPE_A' | 'TYPE_B' | 'TYPE_C';

export type ParsedDimensions = {
  product_name: string;
  weight: string | null;
  qty_per_pack: number | null;
  packs_per_carton: number | null;
  total_qty: number | null;
  mrp: number | null;
  packaging: string;
};

export type MatchStatus = 'MATCHED' | 'LOW_CONFIDENCE' | 'UNMATCHED';

export const GRN_MATCHER_CONFIG = {
  GATE_MIN_TOKEN_RATIO: 45,
  EXACT_CODE_BOOST: 100,
  WEIGHT_MATCH_BOOST: 100,
  QTY_PER_PACK_BOOST: 80,
  PACKS_PER_CARTON_BOOST: 80,
  TOTAL_QTY_BOOST: 60,
  MRP_MATCH_BOOST: 70,
  PACKAGING_MATCH_BOOST: 20,
  PROCESSING_ITEM_BOOST: 50,
  MATCHED_SCORE_THRESHOLD: 140,
  LOW_CONFIDENCE_THRESHOLD: 80,
  AMBIGUITY_DELTA_THRESHOLD: 20,
  SUGGESTION_MIN_NAME_SCORE: 45,
  SUGGESTION_MIN_TOTAL_SCORE: 70,
  MAX_SUGGESTIONS: 5,
};

export type MatchResult = {
  invoice_text: string;
  detected_type: InvoiceType;
  parsed: ParsedDimensions;
  match_status: MatchStatus;
  matched_product: Product | null;
  match_score: number;
  score_breakdown: {
    name_gate: number;
    pack_size: number;
    qty_per_pack: number;
    packs_per_carton: number;
    total_qty: number;
    mrp: number;
    packaging: number;
  };
  suggestions: {
    product: Product;
    score: number;
    name_score: number; // exposed so UI can sort by relevance
    reason: string;
  }[];
};

// ─── Alias table ────────────────────────────────────────────────────────────
const HINDI_ALIAS_TABLE: Record<string, string> = {
  HALDI: 'TURMERIC',
  MIRCH: 'CHILLI',
  MIRCHI: 'CHILLI',
  'LAL MIRCH': 'CHILLI',
  'LAL MIRCHI': 'CHILLI',
  DHANIA: 'CORIANDER',
  DHANIYA: 'CORIANDER',
  JEERA: 'CUMIN',
  'SABUT JEERA': 'CUMIN',
  'KALI MIRCH': 'BLACK PEPPER',
  'METHI DANA': 'FENUGREEK SEED',
  'KASURI METHI': 'KASURI METHI',
  'KASTURI METHI': 'KASURI METHI',
  HING: 'ASAFOETIDA',
  AJWAIN: 'CARAWAY SEED',
  JUANI: 'CARAWAY SEED',
  SAUNF: 'FENNEL SEED',
  POSTAK: 'POPPY SEED',
  'KHUS KHUS': 'POPPY SEED',
  'SENDHA NAMAK': 'ROCK SALT',
  'KALA NAMAK': 'BLACK SALT',
  LEHSUN: 'GARLIC',
  ADRAK: 'GINGER',
  SONTH: 'GINGER',
  DALCHINI: 'CINNAMON',
  'TEJ PATTA': 'BAY LEAF',
  BESAN: 'GRAM FLOUR',
  DALIA: 'WHEAT DALIA',
  ATTA: 'WHEAT FLOUR',
  MAIDA: 'REFINED FLOUR',
  DAAL: 'LENTILS',
  'CHANA DAAL': 'CHANA DAL',
  'TOOR DAAL': 'TOOR DAL',
  'MOONG DAAL': 'MOONG DAL',
  'URAD DAAL': 'URAD DAL',
  CHAWAL: 'RICE',
  CHINI: 'SUGAR',
  NAMAK: 'SALT',
  TEL: 'OIL',
  GHEE: 'GHEE',
  DOODH: 'MILK',
  SABUN: 'SOAP',
  SURF: 'DETERGENT',
  BISCUIT: 'BISCUIT',
  NAMKEEN: 'NAMKEEN SNACK',
  SABUDANA: 'SABUDANA SAGO',
  SAGO: 'SABUDANA SAGO',
  AGARBATTI: 'INCENSE',
  DHOOP: 'INCENSE',
  CHANA: 'CHICKPEAS',
  POHA: 'FLATTENED RICE',
  RAVA: 'SEMOLINA',
  SOOJI: 'SEMOLINA',
  SUJI: 'SEMOLINA'
};

// ─── Normalization ────────────────────────────────────────────────────────────
export function normalizeNameForGate(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let n = text.toUpperCase();

  // Apply Hindi→English aliases (longest match first to avoid partial replacement)
  const keys = Object.keys(HINDI_ALIAS_TABLE).sort((a, b) => b.length - a.length);
  for (const hindi of keys) {
    const regex = new RegExp(`\\b${hindi}\\b`, 'g');
    n = n.replace(regex, HINDI_ALIAS_TABLE[hindi]);
  }

  // Strip digits
  n = n.replace(/[0-9]/g, '');
  // Strip punctuation / brackets
  n = n.replace(/[\][().,\-/X*#:_]/g, ' ');

  // Strip unit fillers
  const fillers = ['GMS', 'GM', 'G', 'KG', 'ML', 'LTR', 'POUCHS', 'POUCH', 'PKD', 'PKTS', 'PKT', 'RS', 'RE', 'PACKS', 'PACK', 'BAG', 'BOX', 'CARTON', 'CASE', 'UNIT', 'PCS', 'NOS', 'DZ', 'DOZ', 'DOZEN'];
  for (const f of fillers) {
    n = n.replace(new RegExp(`\\b${f}\\b`, 'g'), ' ');
  }

  const cleaned = n.replace(/\s+/g, ' ').trim();
  // Safe fallback: if stripping digits/fillers removed the entire string (e.g. numeric product names like "500G" or "D-10"), return alphanumeric normalized text
  if (!cleaned) {
    return text.toUpperCase().replace(/[\][().,\-/X*#:_]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return cleaned;
}

// ─── Invoice-type detection ───────────────────────────────────────────────────
function detectInvoiceType(line: string): InvoiceType {
  const u = line.toUpperCase();
  if (/\b(RS|RE)\s*\d+/.test(u) && (u.includes('PKD') || u.includes('POUCH') || u.includes('CHAIN')))
    return 'TYPE_B';
  if (/\[.*?X.*?X.*?\]|X\s*\d+\s*X/.test(u)) return 'TYPE_A';
  return 'TYPE_C';
}

// ─── Dimension parser ─────────────────────────────────────────────────────────
function parseDimensions(line: string, type: InvoiceType): ParsedDimensions {
  const u = line.toUpperCase();

  let weight: string | null = null;
  let qty_per_pack: number | null = null;
  let packs_per_carton: number | null = null;
  let total_qty: number | null = null;
  let mrp: number | null = null;
  let packaging = 'PCS';

  const wm = u.match(/(\d+\.?\d*)\s*(GMS|GM|G|KG)\b/);
  if (wm) weight = wm[1] + (wm[2].toLowerCase().startsWith('g') ? 'g' : 'kg');

  if (type === 'TYPE_B') {
    const mrpM = u.match(/\b(RS|RE)\s*(\d+)/);
    if (mrpM) mrp = parseInt(mrpM[2]);
    const parts = u.match(/(\d+)\s*POUCH\s*X\s*(\d+)\s*PKD|(\d+)\s*X\s*(\d+)/);
    if (parts) {
      qty_per_pack = parseInt(parts[1] || parts[3]);
      packs_per_carton = parseInt(parts[2] || parts[4]);
    }
    const totalM = u.match(/(\d+)\s*P$/);
    if (totalM) total_qty = parseInt(totalM[1]);
    else if (qty_per_pack && packs_per_carton) total_qty = qty_per_pack * packs_per_carton;
    packaging = 'Packet';
  } else if (type === 'TYPE_A') {
    const parts = u.match(/\[?(\d+\.?\d*)\s*(?:GMS|GM|KG)?\s*X\s*(\d+)\s*(?:POUCH|PKT|POUCHS)?\s*X\s*(\d+)\s*(?:PKD|PKT)?\]?/);
    if (parts) {
      qty_per_pack = parseInt(parts[2]);
      packs_per_carton = parseInt(parts[3]);
      total_qty = qty_per_pack * packs_per_carton;
    }
  } else {
    const qm = u.match(/\[(\d+)\]/);
    if (qm) total_qty = parseInt(qm[1]);
  }

  if (u.includes('JAR')) packaging = 'Jar';
  else if (u.includes('SACHET')) packaging = 'PCS';
  else if (u.includes('BAG') || (weight?.includes('kg') && parseFloat(weight) >= 5)) packaging = 'Case';
  else if (u.includes('BOTTLE')) packaging = 'Bottle';
  else if (weight) {
    const wv = parseFloat(weight);
    const wu = weight.replace(/[0-9.]/g, '');
    if (wu === 'g' && wv <= 25) packaging = 'Sachet';
    else if (wu === 'kg' && wv >= 5) packaging = 'Bag';
  }

  return { product_name: normalizeNameForGate(line), weight, qty_per_pack, packs_per_carton, total_qty, mrp, packaging };
}

// ─── Weight comparison ────────────────────────────────────────────────────────
function compareWeights(w1: string | null, w2: string | null): boolean {
  if (!w1 || !w2) return false;
  const parse = (w: string) => {
    const v = parseFloat(w);
    const u = w.replace(/[0-9.]/g, '').toLowerCase();
    return u === 'kg' ? v * 1000 : v;
  };
  const v1 = parse(w1), v2 = parse(w2);
  if (v1 === 0) return v2 === 0;
  return Math.abs(v1 - v2) / v1 <= 0.05;
}

// ─── Normalized catalog type ──────────────────────────────────────────────────
export type NormalizedProduct = Product & { normalized_name: string };

/** Pre-normalize a catalog once; pass result to matchProduct / matchAllRows */
export function buildNormalizedCatalog(catalog: Product[]): NormalizedProduct[] {
  return catalog.map(p => ({ ...p, normalized_name: normalizeNameForGate(p.name) }));
}

// ─── Core match function ──────────────────────────────────────────────────────
export function matchProduct(
  invoiceLine: string,
  catalog: NormalizedProduct[]
): MatchResult {
  const type = detectInvoiceType(invoiceLine);
  const parsed = parseDimensions(invoiceLine, type);
  const normInvoice = parsed.product_name;

  // ── STAGE 1: Gate (support SKU, external code, name token ratio >= GATE_MIN_TOKEN_RATIO) ──
  const gatePassers = catalog.filter(p => {
    if (p.sku && (invoiceLine.toUpperCase().includes(p.sku.toUpperCase()) || normInvoice.includes(p.sku.toUpperCase()))) return true;
    if (p.external_code && (invoiceLine.toUpperCase().includes(p.external_code.toUpperCase()) || normInvoice.includes(p.external_code.toUpperCase()))) return true;
    return token_set_ratio(normInvoice, p.normalized_name) >= GRN_MATCHER_CONFIG.GATE_MIN_TOKEN_RATIO;
  });

  // ── STAGE 2: Full scoring ──
  const candidates = gatePassers.map(p => {
    const nameScore = token_set_ratio(normInvoice, p.normalized_name);

    const breakdown = {
      name_gate: nameScore,
      pack_size: 0,
      qty_per_pack: 0,
      packs_per_carton: 0,
      total_qty: 0,
      mrp: 0,
      packaging: 0,
    };

    // SKU / External code exact match boost
    if (p.sku && invoiceLine.toUpperCase().includes(p.sku.toUpperCase())) breakdown.name_gate += GRN_MATCHER_CONFIG.EXACT_CODE_BOOST;
    if (p.external_code && invoiceLine.toUpperCase().includes(p.external_code.toUpperCase())) breakdown.name_gate += GRN_MATCHER_CONFIG.EXACT_CODE_BOOST;

    // Chain pack / processing items
    const isChain = p.division_category === 'PROCESSING ITEMS' || p.name.toUpperCase().includes('CHAIN');
    if (type === 'TYPE_B') breakdown.packaging += isChain ? GRN_MATCHER_CONFIG.PROCESSING_ITEM_BOOST : -GRN_MATCHER_CONFIG.PROCESSING_ITEM_BOOST;
    else if (isChain) breakdown.packaging -= GRN_MATCHER_CONFIG.PROCESSING_ITEM_BOOST;

    const catWeight = p.pack_size_value ? `${p.pack_size_value}${p.pack_size_unit || 'g'}` : null;
    if (compareWeights(parsed.weight, catWeight)) breakdown.pack_size = GRN_MATCHER_CONFIG.WEIGHT_MATCH_BOOST;
    if (parsed.qty_per_pack && p.units_per_packet === parsed.qty_per_pack) breakdown.qty_per_pack = GRN_MATCHER_CONFIG.QTY_PER_PACK_BOOST;
    if (parsed.packs_per_carton && p.packets_per_case === parsed.packs_per_carton) breakdown.packs_per_carton = GRN_MATCHER_CONFIG.PACKS_PER_CARTON_BOOST;
    const catTotal = (p.units_per_packet || 1) * (p.packets_per_case || 1);
    if (parsed.total_qty === catTotal) breakdown.total_qty = GRN_MATCHER_CONFIG.TOTAL_QTY_BOOST;
    if (type === 'TYPE_B' && parsed.mrp === p.mrp) breakdown.mrp = GRN_MATCHER_CONFIG.MRP_MATCH_BOOST;
    if (p.item_pack_type?.toLowerCase() === parsed.packaging.toLowerCase()) breakdown.packaging += GRN_MATCHER_CONFIG.PACKAGING_MATCH_BOOST;

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

    const reasonParts: string[] = [];
    if (breakdown.pack_size > 0) reasonParts.push(parsed.weight!);
    if (breakdown.qty_per_pack > 0) reasonParts.push(`${parsed.qty_per_pack}pc`);
    if (breakdown.packs_per_carton > 0) reasonParts.push(`${parsed.packs_per_carton}pkd`);
    if (breakdown.mrp > 0) reasonParts.push(`Rs.${parsed.mrp}`);

    return { product: p, score, nameScore, breakdown, reason: reasonParts.join('+') || 'Name match' };
  })
    .sort((a, b) => b.score - a.score);

  const top = candidates[0] || null;

  let status: MatchStatus = 'UNMATCHED';
  if (top) {
    if (top.score >= GRN_MATCHER_CONFIG.MATCHED_SCORE_THRESHOLD) status = 'MATCHED';
    else if (top.score >= GRN_MATCHER_CONFIG.LOW_CONFIDENCE_THRESHOLD) status = 'LOW_CONFIDENCE';
  }
  // Ambiguity check
  if (status === 'MATCHED' && candidates.length > 1 && candidates[0].score - candidates[1].score < GRN_MATCHER_CONFIG.AMBIGUITY_DELTA_THRESHOLD) {
    status = 'LOW_CONFIDENCE';
  }

  // ── Suggestions: sort by relevance (score or name_score) ──
  const suggestions = candidates
    .filter(c => c.nameScore >= GRN_MATCHER_CONFIG.SUGGESTION_MIN_NAME_SCORE || c.score >= GRN_MATCHER_CONFIG.SUGGESTION_MIN_TOTAL_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, GRN_MATCHER_CONFIG.MAX_SUGGESTIONS)
    .map(c => ({ product: c.product, score: c.score, name_score: c.nameScore, reason: c.reason }));

  return {
    invoice_text: invoiceLine,
    detected_type: type,
    parsed,
    match_status: status,
    matched_product: status !== 'UNMATCHED' ? top!.product : null,
    match_score: top?.score || 0,
    score_breakdown: top?.breakdown || { name_gate: 0, pack_size: 0, qty_per_pack: 0, packs_per_carton: 0, total_qty: 0, mrp: 0, packaging: 0 },
    suggestions,
  };
}

// ─── Batch match (pre-normalizes catalog once) ───────────────────────────────
export function matchAllRows(lines: string[], catalog: Product[]): MatchResult[] {
  const normalizedCatalog = buildNormalizedCatalog(catalog);
  return lines.map(line => matchProduct(line, normalizedCatalog));
}

// ─── Compatibility ───────────────────────────────────────────────────────────
export function buildProductIndex(products: Product[]): Map<string, Product> {
  const index = new Map<string, Product>();
  products.forEach(p => {
    index.set(p.name.toLowerCase(), p);
    if (p.sku) index.set(p.sku.toLowerCase(), p);
  });
  return index;
}
