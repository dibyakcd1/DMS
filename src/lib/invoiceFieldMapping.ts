import { type PackType } from "@/lib/pricing";
import { inferTaxonomyCategory } from "@/lib/taxonomy";

export interface InvoiceFieldMapping {
  nameCol?: string;
  skuCol?: string;
  basepackCol?: string;
  hsnCol?: string;
  qtyCol?: string;
  rateCol?: string;
  purchaseRateCol?: string;
  mrpCol?: string;
  gstCol?: string;
  cgstCol?: string;
  sgstCol?: string;
  igstCol?: string;
  taxableAmountCol?: string;
  taxAmountCol?: string;
  cgstAmtCol?: string;
  sgstAmtCol?: string;
  igstAmtCol?: string;
  grossAmountCol?: string;
  categoryCol?: string;
  divisionCol?: string;
  packTypeCol?: string;
  batchCol?: string;
  pkmCol?: string;
  expiryCol?: string;
  unitsPerPacketCol?: string;
  packetsPerCaseCol?: string;
}

export interface ParsedInvoiceMetadata {
  invoiceNumber?: string;
  invoiceDate?: string;
  supplierName?: string;
  supplierGstn?: string;
  totalAmount?: number;
  totalFreight?: number;
  totalHandling?: number;
  batchNumber?: string;
}

export interface ParsedInvoiceItem {
  sku_or_name: string;
  sku_code?: string;
  basepack_code?: string;
  external_code?: string;
  hsn?: string;
  category?: string;
  division?: string;
  quantity: number;
  cost_per_pack: number;
  mrp?: number;
  gst_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  net_value?: number;
  tax_amount?: number;
  gross_value?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  pack_type: PackType;
  batch_number?: string;
  packed_date?: string;
  expiry_date?: string;
  extracted_multipliers?: {
    units_per_packet?: number;
    packets_per_case?: number;
  };
  raw_row?: Record<string, unknown>;
}

export interface SpreadsheetParseResult {
  metadata: ParsedInvoiceMetadata;
  items: ParsedInvoiceItem[];
  headerRowIndex?: number;
}

const FIELD_PATTERNS: Record<keyof InvoiceFieldMapping, RegExp[]> = {
  nameCol: [
    /^(product\s*name|product\s*desc(?:ription)?|item\s*name|item\s*desc(?:ription)?|material\s*desc(?:ription)?|article\s*name|particulars|description|goods\s*description|description\s*of\s*goods|name\s*of\s*product|name\s*of\s*item|particulars\s*of\s*goods|item\s*details|details|stock\s*item|commodity|brand\s*\/\s*product)$/i,
    /^(product|item|material|description|desc|goods|commodity|article|stock_item|prod_name|item_name)$/i,
    /(product\s*name|item\s*name|material\s*desc|particulars|description|desc\s*of\s*goods|goods\s*desc)/i
  ],
  skuCol: [
    /^(sku\s*7\s*code|sku7\s*code|sku7|sku\s*code|item\s*code|material\s*code|article\s*code|article\s*no|prod\s*code|item\s*no|item_sku|product_code)$/i,
    /^(sku|item\s*no|art\s*no|prod\s*code|item_code|product_code)$/i,
    /(sku7|sku\s*code|item\s*code|mat\s*code|material\s*code|prod\s*code)/i
  ],
  basepackCol: [
    /^(basepack\s*code|basepack\s*no|basepack|base\s*pack|material\s*no|parent\s*code|base\s*code|base_pack_code)$/i,
    /(basepack|base\s*pack)/i
  ],
  hsnCol: [
    /^(hsn\s*code|hsn\s*no|hsn\/sac|tariff|sac\s*code|hsncode|hsn|hsn_code|sac)$/i,
    /^(hsn|sac|tariff|hsncode)$/i,
    /(hsn|tariff|sac)/i
  ],
  qtyCol: [
    /^(units|rcpt\s*qty|inv\s*qty|billed\s*qty|invoice\s*qty|quantity|qty|shipped\s*qty|billed\s*quantity|units\s*qty|received\s*qty|dispatch\s*qty)$/i,
    /^(qty|units|quantity|nos|pieces|rcpt)$/i,
    /(rcpt\s*qty|inv\s*qty|billed\s*qty|units|quantity|qty)/i
  ],
  rateCol: [
    /^(unit\s*rate|basic\s*rate|unit\s*price|rate|cost\s*price|net\s*rate|rate\/unit|basic\s*price|rate\s*per\s*unit)$/i,
    /^(rate|price|cost|basic)$/i,
    /(unit\s*rate|basic\s*rate|unit\s*price|basic)/i
  ],
  purchaseRateCol: [
    /^(purchase\s*rate|pur\s*rate|landing\s*rate|net\s*purchase\s*rate|invoice\s*rate)$/i,
    /(purchase\s*rate|pur\s*rate)/i
  ],
  mrpCol: [
    /^(mrp|m\.r\.p|m\.r\.p\.|max\s*retail\s*price|retail\s*price|max\s*price)$/i,
    /(mrp|retail\s*price)/i
  ],
  gstCol: [
    /^(gst\s*rate|gst\s*%|tax\s*%|tax\s*rate|gst\s*\(%\)|tax\s*\(%\)|tot\s*gst\s*%|tax_rate|gst_rate|total\s*tax\s*%|total\s*gst\s*%)$/i,
    /(?:gst|tax).*(?:%|rate|\(%\)|pct)/i,
    /^(gst|total\s*tax)$/i
  ],
  cgstCol: [
    /^(cgst\s*%|cgst\s*rate|cgst\s*\(%\)|central\s*tax\s*%|c_gst\s*%|c-gst\s*%|cgst_rate|cgst_pct|cgst\s*pct)$/i,
    /(?:cgst|c_gst|c-gst|central\s*tax).*(?:%|rate|\(%\)|pct)/i,
    /^(cgst|c_gst|c-gst)$/i
  ],
  sgstCol: [
    /^(sgst\s*%|sgst\s*rate|sgst\s*\(%\)|utgst\s*%|utgst\s*rate|ugst\s*%|ugst\s*rate|sgst\s*\/\s*ugst\s*%|sgst\s*\/\s*utgst\s*%|sgst\s*\/\s*ugs\s*%|state\s*tax\s*%|s_gst\s*%|s-gst\s*%|sgst_rate|sgst_pct|sgst\s*pct)$/i,
    /(?:sgst|utgst|ugst|s_gst|s-gst|state\s*tax).*(?:%|rate|\(%\)|pct)/i,
    /^(sgst|utgst|ugst|s_gst|s-gst)$/i
  ],
  igstCol: [
    /^(igst\s*%|igst\s*rate|igst\s*\(%\)|integrated\s*tax\s*%|i_gst\s*%|i-gst\s*%|igst_rate|igst_pct|igst\s*pct)$/i,
    /(?:igst|i_gst|i-gst|integrated\s*tax).*(?:%|rate|\(%\)|pct)/i,
    /^(igst|i_gst|i-gst)$/i
  ],
  taxableAmountCol: [
    /^(taxable\s*amt|taxable\s*value|taxable\s*amount|assessable\s*value|net\s*value|basic\s*amount|taxable|gross\s*amt|gross\s*amount|gross\s*value)$/i,
    /(taxable\s*value|taxable\s*amt|assessable\s*val|taxable)/i
  ],
  taxAmountCol: [
    /^(tax\s*amt|tax\s*amount|total\s*tax\s*amt|total\s*tax|total\s*gst|gst\s*amt|gst\s*amount)$/i,
    /(tax\s*amt|gst\s*amt|tax\s*amount)/i
  ],
  cgstAmtCol: [
    /^(cgst\s*amt|cgst\s*amount|central\s*tax\s*amt|cgst_amt|c_gst_amt|cgst\s*val|cgst\s*value)$/i,
    /(?:cgst|c_gst|c-gst|central\s*tax).*(?:amt|amount|val|value|rs|inr)/i
  ],
  sgstAmtCol: [
    /^(sgst\s*amt|sgst\s*amount|sgst\s*\/\s*ugs|sgst\s*\/\s*ugst\s*amt|sgst\s*\/\s*utgst\s*amt|sgst\s*\/\s*ugst|sgst\s*\/\s*utgst|state\s*tax\s*amt|utgst\s*amt|ugst\s*amt|sgst_amt|s_gst_amt|sgst\s*val|sgst\s*value)$/i,
    /(?:sgst|utgst|ugst|s_gst|s-gst|state\s*tax).*(?:amt|amount|val|value|rs|inr)/i,
    /(?:sgst\s*\/\s*ugs)/i
  ],
  igstAmtCol: [
    /^(igst\s*amt|igst\s*amount|integrated\s*tax\s*amt|igst_amt|i_gst_amt|igst\s*val|igst\s*value)$/i,
    /(?:igst|i_gst|i-gst|integrated\s*tax).*(?:amt|amount|val|value|rs|inr)/i
  ],
  grossAmountCol: [
    /^(gross\s*amount|gross\s*value|total\s*amount|total\s*value|invoice\s*amount|inv\s*amt|net\s*payable|bill\s*amount|line\s*total|gross\s*amt|net\s*amount)$/i,
    /(gross\s*amount|total\s*amt|net\s*payable|net\s*amount)/i
  ],
  categoryCol: [
    /^(category|product\s*category|item\s*category|division\s*category|group|prod\s*group|cat\s*name|cat)$/i,
    /(category|division\s*category|prod\s*group)/i
  ],
  divisionCol: [
    /^(division|business\s*division|business\s*unit|bu|div)$/i,
    /(division|business\s*unit)/i
  ],
  packTypeCol: [
    /^(uom|pack\s*type|packaging|pack\s*uom|unit\s*of\s*measure|pkg|unit|pack)$/i,
    /(uom|pack\s*type|packaging)/i
  ],
  batchCol: [
    /^(batch\s*no|batch\s*number|batch|lot\s*no|lot|batch#|lot#|batch_no)$/i,
    /^(batch|lot)$/i,
    /(batch\s*no|batch\s*number|lot\s*no)/i
  ],
  pkmCol: [
    /^(pkm|pkg\s*mth|mfg\s*date|mfg|pack\s*month|packing\s*month|packed\s*date|pkd\s*date|pkd|pack\s*date|mfg_date|packed|pkg\s*date|pkd\s*mth)$/i,
    /^(pkm|pkg\s*mth|mfg|pkd|pkd\s*mth)$/i,
    /(pkm|pkg\s*mth|pack\s*month|packing\s*month|mfg\s*date|pkd\s*date|packed\s*date)/i
  ],
  expiryCol: [
    /^(exp\s*date|expiry\s*date|expiry|exp|use\s*by|best\s*before|exp_date|expiration\s*date)$/i,
    /^(exp|expiry)$/i,
    /(exp\s*date|expiry|best\s*before|expiration)/i
  ],
  unitsPerPacketCol: [
    /^(units\s*per\s*pack|units\/pack|units\s*per\s*packet|inner\s*qty|pack\s*size|units\/inner)$/i,
    /(units\s*per\s*pack|units\/pack)/i
  ],
  packetsPerCaseCol: [
    /^(packs\s*per\s*case|packets\s*per\s*case|outer\s*qty|case\s*size|units\s*per\s*case|units\/case|qty\s*case|case\s*pack)$/i,
    /(packs\s*per\s*case|case\s*size|units\/case|qty\s*case)/i
  ]
};

export function detectInvoiceFieldMappings(headers: string[]): InvoiceFieldMapping {
  const result: InvoiceFieldMapping = {};
  const cleanedHeaders = headers.map(h => ({
    raw: h,
    clean: String(h || "").trim()
  })).filter(h => h.clean.length > 0 && !h.clean.startsWith("__EMPTY"));

  const isRateField = (field: string) => ['gstCol', 'cgstCol', 'sgstCol', 'igstCol'].includes(field);
  const isAmountField = (field: string) => ['taxableAmountCol', 'taxAmountCol', 'cgstAmtCol', 'sgstAmtCol', 'igstAmtCol', 'grossAmountCol'].includes(field);

  const findHeader = (field: keyof InvoiceFieldMapping, patterns: RegExp[]): string | undefined => {
    // Try strict pattern matches first
    for (const pattern of patterns) {
      for (const h of cleanedHeaders) {
        const cleanLower = h.clean.toLowerCase();
        
        // If searching for a % / rate column, do not match amount columns (e.g. "SGST Amt", "SGST/UGS", "CGST Amount")
        if (isRateField(field)) {
          if (/(?:amt|amount|value|val|rs|inr|gross\s*amt|disc\s*amt)/i.test(cleanLower) && !/(?:%|pct|percent|rate)/i.test(cleanLower)) {
            continue;
          }
        }

        // If searching for an amount column, do not match pure rate columns (e.g. "CGST %", "SGST %")
        if (isAmountField(field)) {
          if (/(?:%|pct|percent)/i.test(cleanLower) && !/(?:amt|amount|val|value)/i.test(cleanLower)) {
            continue;
          }
        }

        if (pattern.test(h.clean)) {
          return h.raw;
        }
      }
    }
    return undefined;
  };

  for (const field of Object.keys(FIELD_PATTERNS) as (keyof InvoiceFieldMapping)[]) {
    result[field] = findHeader(field, FIELD_PATTERNS[field]);
  }

  return result;
}

export function normalizePackType(raw?: string): PackType {
  if (!raw) return "packet";
  const lower = String(raw).trim().toLowerCase();
  if (lower.includes("doz") || lower.includes("dz") || lower.includes("dzn") || lower.includes("dozen")) return "doz";
  if (lower.includes("case") || lower.includes("cs") || lower.includes("box") || lower.includes("carton") || lower.includes("ctn")) return "case";
  if (lower.includes("kg") || lower.includes("kilo")) return "kg";
  if (lower.includes("ltr") || lower.includes("litre") || lower.includes("liter") || lower.includes("lt")) return "ltr";
  if (lower.includes("pc") || lower.includes("pcs") || lower.includes("unit") || lower.includes("nos") || lower.includes("ea")) return "unit";
  return "packet";
}

export function parseNumeric(val: unknown, fallback = 0): number {
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (!val) return fallback;
  const str = String(val).replace(/[^0-9.-]/g, '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? fallback : num;
}

export function parseDateString(val: unknown): string | undefined {
  if (!val) return undefined;
  
  // 1. Excel serial numeric dates (e.g. 45405 = 2024-04-23)
  if (typeof val === "number") {
    if (val >= 10000 && val <= 60000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + val * 86400000);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
      }
    }
  }

  const str = String(val).trim();
  if (!str) return undefined;

  // 2. YYYY-MM-DD already valid
  const yyyymmdd = str.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, "0");
    const day = yyyymmdd[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    let year = ddmmyyyy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // 4. PKM / MMYY 4-digit code (e.g. "0226" -> Feb 2026, "0126" -> Jan 2026, "1225" -> Dec 2025)
  const mmyy4 = str.match(/^(\d{2})(\d{2})$/);
  if (mmyy4) {
    const mm = Number(mmyy4[1]);
    const yy = Number(mmyy4[2]);
    if (mm >= 1 && mm <= 12 && yy >= 0 && yy <= 99) {
      const fullYear = 2000 + yy;
      const lastDay = new Date(fullYear, mm, 0).getDate();
      return `${fullYear}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  // 5. PKM 3-digit code (e.g. "226" -> month 2, 2026, "126" -> month 1, 2026)
  const mmyy3 = str.match(/^(\d{1})(\d{2})$/);
  if (mmyy3) {
    const mm = Number(mmyy3[1]);
    const yy = Number(mmyy3[2]);
    if (mm >= 1 && mm <= 9 && yy >= 0 && yy <= 99) {
      const fullYear = 2000 + yy;
      const lastDay = new Date(fullYear, mm, 0).getDate();
      return `${fullYear}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  // 6. MM/YY or MM-YY or MM.YY (e.g. "02/26", "2/26", "02-26")
  const mmyySlash = str.match(/^(\d{1,2})[/.-](\d{2})$/);
  if (mmyySlash) {
    const mm = Number(mmyySlash[1]);
    const yy = Number(mmyySlash[2]);
    if (mm >= 1 && mm <= 12 && yy >= 0 && yy <= 99) {
      const fullYear = 2000 + yy;
      const lastDay = new Date(fullYear, mm, 0).getDate();
      return `${fullYear}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  // 7. MM/YYYY or MM-YYYY (e.g. "02/2026", "2-2026")
  const mmyyyySlash = str.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (mmyyyySlash) {
    const mm = Number(mmyyyySlash[1]);
    const fullYear = Number(mmyyyySlash[2]);
    if (mm >= 1 && mm <= 12 && fullYear >= 2000 && fullYear <= 2099) {
      const lastDay = new Date(fullYear, mm, 0).getDate();
      return `${fullYear}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  // 8. Month name formats (e.g. "FEB 26", "FEB-26", "FEB 2026", "28-FEB-2026")
  const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  
  const ddMonYyyy = str.match(/^(\d{1,2})[\s/.-]([a-zA-Z]{3})[\s/.-](\d{2,4})$/i);
  if (ddMonYyyy) {
    const day = ddMonYyyy[1].padStart(2, "0");
    const mm = MONTHS[ddMonYyyy[2].toLowerCase()];
    let year = Number(ddMonYyyy[3]);
    if (year < 100) year += 2000;
    if (mm && year >= 2000 && year <= 2099) {
      return `${year}-${String(mm).padStart(2, "0")}-${day}`;
    }
  }

  const monYearMatch = str.match(/^([a-zA-Z]{3})[\s/.-]?(\d{2,4})$/i);
  if (monYearMatch) {
    const mm = MONTHS[monYearMatch[1].toLowerCase()];
    let year = Number(monYearMatch[2]);
    if (year < 100) year += 2000;
    if (mm && year >= 2000 && year <= 2099) {
      const lastDay = new Date(year, mm, 0).getDate();
      return `${year}-${String(mm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  return undefined;
}

export function generateDefaultBatchNumber(
  invoiceNo?: string,
  invoiceDate?: string,
  prefix = "B"
): string {
  const cleanInv = invoiceNo ? invoiceNo.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
  let datePart = '';
  if (invoiceDate) {
    const d = new Date(invoiceDate);
    if (!isNaN(d.getTime())) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      datePart = `${mm}${yy}`;
    }
  }
  if (!datePart) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    datePart = `${mm}${yy}`;
  }

  if (cleanInv) {
    return `${prefix}-${cleanInv}-${datePart}`;
  }
  return `${prefix}-INV-${datePart}`;
}

/**
 * Checks if a string is a valid Indian 15-digit GSTIN
 */
export function isValidGSTIN(gstin?: string): boolean {
  if (!gstin) return false;
  const cleaned = gstin.trim().toUpperCase();
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(cleaned);
}

/**
 * Intelligent filter that detects junk / noise rows, placeholder rows (e.g. 'xxxxx'),
 * blank lines, summary/total footers, bank details, and non-product rows.
 */
export function isJunkOrNoiseRow(
  nameStr: string,
  rawRow?: Record<string, unknown>,
  skuOrCode?: string
): boolean {
  if (!nameStr) return true;
  const clean = nameStr.trim();
  if (clean.length < 2) return true;

  // 1. Placeholder check: e.g. "xxxxx", "XXXXX", "xxxx", "---", "***", "0000"
  const alphaChars = clean.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (alphaChars.length > 0 && /^[x]+$/.test(alphaChars)) {
    return true;
  }
  if (/^[xX\-_*#.\s0]+$/.test(clean)) {
    return true;
  }

  const lower = clean.toLowerCase();

  // Filter out placeholder names like "unknown", "unknown product", "null", "undefined", "n/a", "none" when no valid code exists
  if (['unknown', 'unknown product', 'unknown item', 'null', 'undefined', 'n/a', 'na', 'none', '-'].includes(lower)) {
    if (!skuOrCode || skuOrCode.trim().length < 2 || ['unknown', 'null', 'n/a'].includes(skuOrCode.toLowerCase().trim())) {
      return true;
    }
  }

  // 2. Summary / Total keywords
  const summaryPatterns = [
    /^(grand\s*total|sub\s*total|subtotal|total|total\s*amount|net\s*amount|gross\s*amount)$/i,
    /^(cgst\s*total|sgst\s*total|igst\s*total|total\s*gst|total\s*tax|taxable\s*amount|taxable\s*value)$/i,
    /^(round\s*off|discount|less\s*discount|tcs|tds|freight\s*charges|loading\s*charges)$/i,
    /^(bank\s*details|a\/c\s*no|ifsc|account\s*number|bank\s*name|branch)$/i,
    /^(authorized\s*signatory|authorise\s*signatory|signature|prepared\s*by|checked\s*by|verified\s*by)$/i,
    /^(terms\s*and\s*conditions|terms\s*&\s*conditions|e\.\s*&\s*o\.e\.|declarations?)$/i,
    /^(for\s+[a-z0-9\s.,&]+|e-way\s*bill|irn\s*no|ack\s*no|qr\s*code)$/i,
    /^(page\s*\d+\s*of\s*\d+|continued\s*on\s*next\s*page|\*{3,}|-{3,})$/i
  ];

  if (summaryPatterns.some(pat => pat.test(lower))) {
    return true;
  }

  // 3. If raw row is provided, check if all cells are summary or blank
  if (rawRow) {
    const rowValues = Object.values(rawRow).map(v => String(v ?? '').toLowerCase()).join(' ');
    if (rowValues.includes('grand total') || rowValues.includes('total amount in words') || rowValues.includes('for tatvisha')) {
      return true;
    }
  }

  // 4. Must not be just a single letter or non-alphanumeric noise if no code is present
  if (!skuOrCode && !/[a-zA-Z0-9]{3,}/.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Brand-specific mandatory code validations
 */
export interface BrandValidationRule {
  companyShortCode: string;
  name: string;
  requiresBasepack: boolean;
  requiresSku7: boolean;
  requiresHsn: boolean;
  requiresProductName: boolean;
  skuPrefix: string;
  description: string;
}

export const BRAND_VALIDATION_RULES: Record<string, BrandValidationRule> = {
  HUL: {
    companyShortCode: "HUL",
    name: "Hindustan Unilever (HUL)",
    requiresBasepack: true,
    requiresSku7: true,
    requiresHsn: true,
    requiresProductName: true,
    skuPrefix: "HUL-",
    description: "Requires Basepack Code, SKU7 Code, HSN Code, and Product Title"
  },
  ITC: {
    companyShortCode: "ITC",
    name: "ITC Limited",
    requiresBasepack: false,
    requiresSku7: true,
    requiresHsn: true,
    requiresProductName: true,
    skuPrefix: "ITC-",
    description: "Requires Item/Material Code, HSN, and Product Title"
  },
  PARLE: {
    companyShortCode: "PARLE",
    name: "Parle Products",
    requiresBasepack: false,
    requiresSku7: true,
    requiresHsn: true,
    requiresProductName: true,
    skuPrefix: "PL-",
    description: "Requires Item Code/SKU, HSN, and Product Title"
  },
  JYOTHY: {
    companyShortCode: "JYOTHY",
    name: "Jyothy Labs",
    requiresBasepack: false,
    requiresSku7: true,
    requiresHsn: true,
    requiresProductName: true,
    skuPrefix: "JL-",
    description: "Requires Article Code, HSN, and Product Title"
  },
  BM: {
    companyShortCode: "BM",
    name: "Bharat Masala",
    requiresBasepack: false,
    requiresSku7: false,
    requiresHsn: true,
    requiresProductName: true,
    skuPrefix: "BM-",
    description: "Requires Product Title and HSN"
  },
  MK: {
    companyShortCode: "MK",
    name: "Madhukunj",
    requiresBasepack: false,
    requiresSku7: false,
    requiresHsn: true,
    requiresProductName: true,
    skuPrefix: "MK-",
    description: "Requires Product Title, HSN, and Dozen/Piece pack pricing"
  },
  MADHUKUNJ: {
    companyShortCode: "MK",
    name: "Madhukunj",
    requiresBasepack: false,
    requiresSku7: false,
    requiresHsn: true,
    requiresProductName: true,
    skuPrefix: "MK-",
    description: "Requires Product Title, HSN, and Dozen/Piece pack pricing"
  },
  DEFAULT: {
    companyShortCode: "GEN",
    name: "General / Independent Brand",
    requiresBasepack: false,
    requiresSku7: false,
    requiresHsn: false,
    requiresProductName: true,
    skuPrefix: "ITEM-",
    description: "Standard validation"
  }
};

export function validateItemForBrand(
  brandCode: string | undefined,
  item: {
    sku_or_name: string;
    basepack_code?: string;
    sku_code?: string;
    external_code?: string;
    hsn?: string;
  }
): { isValid: boolean; missingFields: string[] } {
  const code = (brandCode || "").toUpperCase();
  const rule = BRAND_VALIDATION_RULES[code] || BRAND_VALIDATION_RULES.DEFAULT;
  const missing: string[] = [];

  if (rule.requiresProductName && (!item.sku_or_name || item.sku_or_name.trim().length < 2)) {
    missing.push("Product Name");
  }

  if (rule.requiresBasepack && (!item.basepack_code || item.basepack_code.trim().length < 2)) {
    missing.push("Basepack Code");
  }

  if (rule.requiresSku7 && (!item.sku_code || item.sku_code.trim().length < 2) && (!item.external_code || item.external_code.trim().length < 2)) {
    missing.push("SKU7 / Item Code");
  }

  if (rule.requiresHsn && (!item.hsn || item.hsn.trim().length < 2)) {
    missing.push("HSN Code");
  }

  return {
    isValid: missing.length === 0,
    missingFields: missing
  };
}

/**
 * Parses raw lines or 2D array of rows from any spreadsheet (XLSX, XLS, CSV)
 * Finds the actual header row (even if preceded by metadata lines) and extracts
 * invoice metadata + line items accurately with full GST rate capture.
 */
export function parseSpreadsheetMatrix(rows2D: (string | number | null | undefined)[][]): SpreadsheetParseResult {
  const result: SpreadsheetParseResult = {
    metadata: {},
    items: []
  };

  if (!rows2D || rows2D.length === 0) return result;

  // 1. Scan the first 35 rows to locate metadata & find the table header row
  let headerRowIdx = -1;
  let maxScore = 0;

  for (let r = 0; r < Math.min(rows2D.length, 35); r++) {
    const row = rows2D[r];
    if (!row || row.length === 0) continue;

    const rowText = row.map(c => String(c ?? "").trim()).filter(Boolean);
    if (rowText.length === 0) continue;

    const joinedText = rowText.join(" ");

    // Extract metadata from header lines
    if (!result.metadata.invoiceNumber) {
      const matchNo = joinedText.match(/(?:MATCH\s*NO\.?|INV(?:OICE)?\s*(?:NO\.?|NUMBER|#)?|BILL\s*NO\.?|DC\s*NO\.?)\s*[:.-]?\s*([A-Za-z0-9\-_/]+)/i);
      if (matchNo && matchNo[1]) {
        result.metadata.invoiceNumber = matchNo[1].trim();
      }
    }

    if (!result.metadata.invoiceDate) {
      const matchDate = joinedText.match(/(?:INVOICE\s*DATE|INV\s*DATE|DATE|BILL\s*DATE)\s*[:.-]?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})/i);
      if (matchDate && matchDate[1]) {
        const parsedD = parseDateString(matchDate[1]);
        if (parsedD) result.metadata.invoiceDate = parsedD;
      }
    }

    if (!result.metadata.supplierGstn) {
      const matchGstin = joinedText.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/i);
      if (matchGstin && matchGstin[1]) {
        result.metadata.supplierGstn = matchGstin[1].toUpperCase();
      }
    }

    if (!result.metadata.supplierName) {
      const matchSupplier = joinedText.match(/(?:Purchase\s*Receipt\s*&\s*GDS\s*&\s*|Supplier\s*[:.-]?\s*|Company\/C&FA\s*[:.-]?\s*|Party\s*[:.-]?\s*|M\/s\.?\s*)([A-Za-z0-9\s&()\-.,]+)/i);
      if (matchSupplier && matchSupplier[1]) {
        const cleanedSupp = matchSupplier[1].split(/GSTIN|Vehicle|DC No|IRN|MATCH|Date/i)[0].trim();
        if (cleanedSupp.length > 2 && !/^(total|grand total|invoice)/i.test(cleanedSupp)) {
          result.metadata.supplierName = cleanedSupp;
        }
      }
    }

    if (!result.metadata.totalAmount) {
      const matchAmt = joinedText.match(/(?:Invoice\s*Amt|Inv\s*Amt|Total\s*Amt|Gross\s*Amt|Grand\s*Total)\s*[:.-]?\s*([\d,]+\.?\d*)/i);
      if (matchAmt && matchAmt[1]) {
        result.metadata.totalAmount = parseNumeric(matchAmt[1], 0);
      }
    }

    if (!result.metadata.batchNumber) {
      const matchBatch = joinedText.match(/(?:BATCH\s*(?:NO\.?|NUMBER|#)?|LOT\s*(?:NO\.?|NUMBER|#)?)\s*[:.-]?\s*([A-Za-z0-9\-_/]+)/i);
      if (matchBatch && matchBatch[1]) {
        result.metadata.batchNumber = matchBatch[1].trim();
      }
    }

    // Score this row to see if it is the Table Column Header row
    let score = 0;
    for (const cell of rowText) {
      const cleanCell = cell.toLowerCase();
      if (/^(product|product\s*name|product\s*desc|item\s*name|material\s*desc|description|particulars)$/i.test(cleanCell)) score += 5;
      if (/^(basepack\s*code|basepack|sku\s*7\s*code|sku7|sku\s*code|item\s*code|mat\s*code)$/i.test(cleanCell)) score += 4;
      if (/^(units|rcpt\s*qty|inv\s*qty|qty|quantity|billed\s*qty)$/i.test(cleanCell)) score += 3;
      if (/^(unit\s*rate|basic\s*rate|purchase\s*rate|rate|mrp)$/i.test(cleanCell)) score += 3;
      if (/^(hsn\s*code|hsn|uom|pack\s*type|cgst|sgst|igst|tax\s*%|gst\s*%)$/i.test(cleanCell)) score += 3;
      if (/^(sr\s*no|s\.no|sl\s*no|#)$/i.test(cleanCell)) score += 1;
    }

    if (score >= 4 && score > maxScore) {
      maxScore = score;
      headerRowIdx = r;
    }
  }

  if (headerRowIdx === -1) {
    return result;
  }

  result.headerRowIndex = headerRowIdx;
  const rawHeaders = rows2D[headerRowIdx].map(c => String(c ?? "").trim());
  const mapping = detectInvoiceFieldMappings(rawHeaders);

  // Parse rows starting after the header row
  for (let r = headerRowIdx + 1; r < rows2D.length; r++) {
    const row = rows2D[r];
    if (!row || row.length === 0) continue;

    // Convert array row into an object keyed by header names
    const rowObj: Record<string, unknown> = {};
    let nonBlankCount = 0;
    row.forEach((cellVal, idx) => {
      const headerName = rawHeaders[idx] || `__COL_${idx}`;
      rowObj[headerName] = cellVal;
      if (cellVal !== null && cellVal !== undefined && String(cellVal).trim() !== "") {
        nonBlankCount++;
      }
    });

    if (nonBlankCount === 0) continue;

    const rawName = mapping.nameCol ? rowObj[mapping.nameCol] : undefined;
    const rawSku = mapping.skuCol ? rowObj[mapping.skuCol] : undefined;
    const rawBasepack = mapping.basepackCol ? rowObj[mapping.basepackCol] : undefined;

    if (!rawName && !rawSku && !rawBasepack) continue;

    const nameStr = String(rawName || rawSku || rawBasepack || "").trim();
    const skuCode = rawSku ? String(rawSku).trim() : undefined;
    const basepackCode = rawBasepack ? String(rawBasepack).trim() : undefined;
    const externalCode = basepackCode || skuCode;

    // Filter out noise, dummy 'xxxxx' lines, totals, bank info
    if (isJunkOrNoiseRow(nameStr, rowObj, externalCode)) {
      continue;
    }

    // Quantity
    const qty = mapping.qtyCol ? parseNumeric(rowObj[mapping.qtyCol], 1) : 1;
    if (qty <= 0) continue;

    // Unit Cost / Rate (prefer Unit Rate, then Purchase Rate)
    let rate = mapping.rateCol ? parseNumeric(rowObj[mapping.rateCol], 0) : 0;
    if (rate === 0 && mapping.purchaseRateCol) {
      rate = parseNumeric(rowObj[mapping.purchaseRateCol], 0);
    }

    // MRP
    const mrp = mapping.mrpCol ? parseNumeric(rowObj[mapping.mrpCol], 0) : 0;

    // Net Value (Taxable Amount)
    let netValue = mapping.taxableAmountCol ? parseNumeric(rowObj[mapping.taxableAmountCol], 0) : 0;
    if (netValue === 0) {
      netValue = qty * rate;
    } else if (rate === 0 && qty > 0) {
      rate = netValue / qty;
    }

    // Robust GST calculation from CGST, SGST, IGST, or GST Rate columns
    let cgstVal = mapping.cgstCol ? parseNumeric(rowObj[mapping.cgstCol], 0) : 0;
    let sgstVal = mapping.sgstCol ? parseNumeric(rowObj[mapping.sgstCol], 0) : 0;
    let igstVal = mapping.igstCol ? parseNumeric(rowObj[mapping.igstCol], 0) : 0;
    let gstRate = mapping.gstCol ? parseNumeric(rowObj[mapping.gstCol], 0) : 0;

    let explicitCgstAmt = mapping.cgstAmtCol ? parseNumeric(rowObj[mapping.cgstAmtCol], 0) : 0;
    let explicitSgstAmt = mapping.sgstAmtCol ? parseNumeric(rowObj[mapping.sgstAmtCol], 0) : 0;
    let explicitIgstAmt = mapping.igstAmtCol ? parseNumeric(rowObj[mapping.igstAmtCol], 0) : 0;

    // Sanity check: GST rates in India are 0%, 5%, 12%, 18%, 28% (CGST/SGST = 0, 2.5, 6, 9, 14%).
    // If a rate field holds a value > 35, it is actually a tax amount in currency (e.g., 228.36).
    if (cgstVal > 35) {
      if (explicitCgstAmt === 0) explicitCgstAmt = cgstVal;
      cgstVal = netValue > 0 ? Number(((cgstVal / netValue) * 100).toFixed(2)) : 0;
    }
    if (sgstVal > 35) {
      if (explicitSgstAmt === 0) explicitSgstAmt = sgstVal;
      sgstVal = netValue > 0 ? Number(((sgstVal / netValue) * 100).toFixed(2)) : (cgstVal > 0 && cgstVal <= 35 ? cgstVal : 0);
    }
    if (igstVal > 35) {
      if (explicitIgstAmt === 0) explicitIgstAmt = igstVal;
      igstVal = netValue > 0 ? Number(((igstVal / netValue) * 100).toFixed(2)) : 0;
    }
    if (gstRate > 50) {
      gstRate = netValue > 0 ? Number(((gstRate / netValue) * 100).toFixed(2)) : 0;
    }

    // Rule: GST = CGST + SGST + IGST where applicable
    if (cgstVal > 0 && sgstVal > 0) {
      gstRate = cgstVal + sgstVal;
    } else if (cgstVal > 0 && sgstVal === 0 && igstVal === 0) {
      sgstVal = cgstVal; // Intra-state mirror (e.g. 2.5% CGST -> 2.5% SGST)
      gstRate = cgstVal + sgstVal;
    } else if (sgstVal > 0 && cgstVal === 0 && igstVal === 0) {
      cgstVal = sgstVal; // Intra-state mirror
      gstRate = cgstVal + sgstVal;
    } else if (igstVal > 0 && cgstVal === 0 && sgstVal === 0) {
      gstRate = igstVal;
    } else if (gstRate > 0) {
      if (cgstVal === 0 && sgstVal === 0 && igstVal === 0) {
        cgstVal = gstRate / 2;
        sgstVal = gstRate / 2;
        igstVal = 0;
      }
    }

    // Tax Amounts
    const cgstAmt = explicitCgstAmt > 0 ? explicitCgstAmt : (netValue * (cgstVal / 100));
    const sgstAmt = explicitSgstAmt > 0 ? explicitSgstAmt : (netValue * (sgstVal / 100));
    const igstAmt = explicitIgstAmt > 0 ? explicitIgstAmt : (netValue * (igstVal / 100));

    let taxAmount = mapping.taxAmountCol ? parseNumeric(rowObj[mapping.taxAmountCol], 0) : 0;
    if (taxAmount === 0) {
      if (cgstVal > 0 || sgstVal > 0) {
        taxAmount = cgstAmt + sgstAmt;
      } else if (igstVal > 0) {
        taxAmount = igstAmt;
      } else if (gstRate > 0) {
        taxAmount = netValue * (gstRate / 100);
      }
    }

    // Gross Value (Invoice Line Total)
    let grossValue = mapping.grossAmountCol ? parseNumeric(rowObj[mapping.grossAmountCol], 0) : 0;
    if (grossValue === 0) {
      grossValue = netValue + taxAmount;
    }

    // Category and Division smart detection
    const rawCategory = mapping.categoryCol && rowObj[mapping.categoryCol] ? String(rowObj[mapping.categoryCol]).trim() : undefined;
    const rawDivision = mapping.divisionCol && rowObj[mapping.divisionCol] ? String(rowObj[mapping.divisionCol]).trim() : undefined;
    const detectedCategory = rawCategory || inferTaxonomyCategory(nameStr);
    const detectedDivision = rawDivision || detectedCategory;

    // HSN
    let hsnStr: string | undefined;
    if (mapping.hsnCol && rowObj[mapping.hsnCol] != null) {
      hsnStr = String(rowObj[mapping.hsnCol]).replace(/[^0-9]/g, '').trim();
    }

    // Pack type
    const rawPack = mapping.packTypeCol ? String(rowObj[mapping.packTypeCol]) : undefined;
    const packType = normalizePackType(rawPack);

    // Multipliers
    const unitsPerPacket = mapping.unitsPerPacketCol ? parseNumeric(rowObj[mapping.unitsPerPacketCol], 1) : (packType === 'doz' ? 12 : 1);
    const packetsPerCase = mapping.packetsPerCaseCol ? parseNumeric(rowObj[mapping.packetsPerCaseCol], 1) : 1;

    // Batch, PKM (Packed Date) & Expiry
    const batchNumber = mapping.batchCol && rowObj[mapping.batchCol] != null ? String(rowObj[mapping.batchCol]).trim() : undefined;
    const packedDate = mapping.pkmCol && rowObj[mapping.pkmCol] != null ? parseDateString(rowObj[mapping.pkmCol]) : undefined;
    let expiryDate = mapping.expiryCol && rowObj[mapping.expiryCol] != null ? parseDateString(rowObj[mapping.expiryCol]) : undefined;

    // If expiry date is not given on invoice but packed date is present, compute default 2-year shelf life
    if (!expiryDate && packedDate) {
      const pDate = new Date(packedDate);
      if (!isNaN(pDate.getTime())) {
        const autoExp = new Date(pDate);
        autoExp.setFullYear(autoExp.getFullYear() + 2);
        expiryDate = autoExp.toISOString().split('T')[0];
      }
    }

    result.items.push({
      sku_or_name: nameStr,
      sku_code: skuCode || undefined,
      basepack_code: basepackCode || undefined,
      external_code: externalCode || undefined,
      hsn: hsnStr || undefined,
      category: detectedCategory,
      division: detectedDivision,
      quantity: qty,
      cost_per_pack: rate,
      mrp: mrp > 0 ? mrp : undefined,
      gst_rate: Number.isFinite(gstRate) ? gstRate : 0,
      cgst_rate: Number.isFinite(cgstVal) ? cgstVal : 0,
      sgst_rate: Number.isFinite(sgstVal) ? sgstVal : 0,
      igst_rate: Number.isFinite(igstVal) ? igstVal : 0,
      net_value: Number.isFinite(netValue) ? Number(netValue.toFixed(2)) : 0,
      tax_amount: Number.isFinite(taxAmount) ? Number(taxAmount.toFixed(2)) : 0,
      gross_value: Number.isFinite(grossValue) ? Number(grossValue.toFixed(2)) : 0,
      cgst_amount: Number.isFinite(cgstAmt) ? Number(cgstAmt.toFixed(2)) : 0,
      sgst_amount: Number.isFinite(sgstAmt) ? Number(sgstAmt.toFixed(2)) : 0,
      igst_amount: Number.isFinite(igstAmt) ? Number(igstAmt.toFixed(2)) : 0,
      pack_type: packType,
      batch_number: batchNumber,
      packed_date: packedDate,
      expiry_date: expiryDate,
      extracted_multipliers: {
        units_per_packet: unitsPerPacket,
        packets_per_case: packetsPerCase
      },
      raw_row: rowObj
    });
  }

  // Auto-detect or Auto-generate single batch when batch is not present or partially specified
  const invoiceBatch = result.metadata.batchNumber || generateDefaultBatchNumber(result.metadata.invoiceNumber, result.metadata.invoiceDate);
  result.metadata.batchNumber = invoiceBatch;

  result.items.forEach(item => {
    if (!item.batch_number || item.batch_number.trim() === '') {
      item.batch_number = invoiceBatch;
    }
  });

  return result;
}

export function parseStructuredInvoiceRows(
  rows: Record<string, unknown>[],
  customMapping?: InvoiceFieldMapping
): ParsedInvoiceItem[] {
  if (!rows || rows.length === 0) return [];

  const headers = Object.keys(rows[0] || {});
  const mapping = customMapping || detectInvoiceFieldMappings(headers);

  const items: ParsedInvoiceItem[] = [];

  for (const row of rows) {
    const rawName = mapping.nameCol ? row[mapping.nameCol] : undefined;
    const rawSku = mapping.skuCol ? row[mapping.skuCol] : undefined;
    const rawBasepack = mapping.basepackCol ? row[mapping.basepackCol] : undefined;
    
    // Skip empty or header rows
    if (!rawName && !rawSku && !rawBasepack) continue;
    const nameStr = String(rawName || rawSku || rawBasepack || '').trim();
    const skuCode = rawSku ? String(rawSku).trim() : undefined;
    const basepackCode = rawBasepack ? String(rawBasepack).trim() : undefined;
    const externalCode = basepackCode || skuCode;

    if (isJunkOrNoiseRow(nameStr, row, externalCode)) {
      continue;
    }

    // Quantity
    const qty = mapping.qtyCol ? parseNumeric(row[mapping.qtyCol], 1) : 1;
    if (qty <= 0) continue;

    // Unit Cost / Rate
    let rate = mapping.rateCol ? parseNumeric(row[mapping.rateCol], 0) : 0;
    if (rate === 0 && mapping.purchaseRateCol) {
      rate = parseNumeric(row[mapping.purchaseRateCol], 0);
    }

    // MRP
    const mrp = mapping.mrpCol ? parseNumeric(row[mapping.mrpCol], 0) : 0;

    // GST
    let cgstVal = mapping.cgstCol ? parseNumeric(row[mapping.cgstCol], 0) : 0;
    let sgstVal = mapping.sgstCol ? parseNumeric(row[mapping.sgstCol], 0) : 0;
    let igstVal = mapping.igstCol ? parseNumeric(row[mapping.igstCol], 0) : 0;
    let gstRate = mapping.gstCol ? parseNumeric(row[mapping.gstCol], 0) : 0;

    // Rule: GST = CGST + SGST + IGST where applicable
    if (cgstVal > 0 && sgstVal > 0) {
      gstRate = cgstVal + sgstVal;
    } else if (cgstVal > 0 && sgstVal === 0 && igstVal === 0) {
      sgstVal = cgstVal;
      gstRate = cgstVal + sgstVal;
    } else if (sgstVal > 0 && cgstVal === 0 && igstVal === 0) {
      cgstVal = sgstVal;
      gstRate = cgstVal + sgstVal;
    } else if (igstVal > 0 && cgstVal === 0 && sgstVal === 0) {
      gstRate = igstVal;
    } else if (gstRate > 0) {
      if (cgstVal === 0 && sgstVal === 0 && igstVal === 0) {
        cgstVal = gstRate / 2;
        sgstVal = gstRate / 2;
        igstVal = gstRate;
      }
    }

    // Net Value (Taxable Amount)
    let netValue = mapping.taxableAmountCol ? parseNumeric(row[mapping.taxableAmountCol], 0) : 0;
    if (netValue === 0) {
      netValue = qty * rate;
    } else if (rate === 0 && qty > 0) {
      rate = netValue / qty;
    }

    // Tax Amounts
    const cgstAmt = mapping.cgstAmtCol ? parseNumeric(row[mapping.cgstAmtCol], 0) : (netValue * (cgstVal / 100));
    const sgstAmt = mapping.sgstAmtCol ? parseNumeric(row[mapping.sgstAmtCol], 0) : (netValue * (sgstVal / 100));
    const igstAmt = mapping.igstAmtCol ? parseNumeric(row[mapping.igstAmtCol], 0) : (netValue * (igstVal / 100));

    let taxAmount = mapping.taxAmountCol ? parseNumeric(row[mapping.taxAmountCol], 0) : 0;
    if (taxAmount === 0) {
      if (cgstVal > 0 || sgstVal > 0) {
        taxAmount = cgstAmt + sgstAmt;
      } else if (igstVal > 0) {
        taxAmount = igstAmt;
      } else if (gstRate > 0) {
        taxAmount = netValue * (gstRate / 100);
      }
    }

    // Gross Value (Invoice Line Total)
    let grossValue = mapping.grossAmountCol ? parseNumeric(row[mapping.grossAmountCol], 0) : 0;
    if (grossValue === 0) {
      grossValue = netValue + taxAmount;
    }

    // Category and Division smart detection
    const rawCategory = mapping.categoryCol && row[mapping.categoryCol] ? String(row[mapping.categoryCol]).trim() : undefined;
    const rawDivision = mapping.divisionCol && row[mapping.divisionCol] ? String(row[mapping.divisionCol]).trim() : undefined;
    const detectedCategory = rawCategory || inferTaxonomyCategory(nameStr);
    const detectedDivision = rawDivision || detectedCategory;

    // HSN
    let hsnStr: string | undefined;
    if (mapping.hsnCol && row[mapping.hsnCol] != null) {
      hsnStr = String(row[mapping.hsnCol]).replace(/[^0-9]/g, '').trim();
    }

    // Batch, PKM (Packed Date) & Expiry
    const batchNumber = mapping.batchCol && row[mapping.batchCol] != null ? String(row[mapping.batchCol]).trim() : undefined;
    const packedDate = mapping.pkmCol && row[mapping.pkmCol] != null ? parseDateString(row[mapping.pkmCol]) : undefined;
    let expiryDate = mapping.expiryCol && row[mapping.expiryCol] != null ? parseDateString(row[mapping.expiryCol]) : undefined;

    // If expiry date is not given on invoice but packed date is present, compute default 2-year shelf life
    if (!expiryDate && packedDate) {
      const pDate = new Date(packedDate);
      if (!isNaN(pDate.getTime())) {
        const autoExp = new Date(pDate);
        autoExp.setFullYear(autoExp.getFullYear() + 2);
        expiryDate = autoExp.toISOString().split('T')[0];
      }
    }

    // Pack Type
    const rawPack = mapping.packTypeCol ? String(row[mapping.packTypeCol]) : undefined;
    const packType = normalizePackType(rawPack);

    // Multipliers
    const unitsPerPacket = mapping.unitsPerPacketCol ? parseNumeric(row[mapping.unitsPerPacketCol], 1) : (packType === 'doz' ? 12 : 1);
    const packetsPerCase = mapping.packetsPerCaseCol ? parseNumeric(row[mapping.packetsPerCaseCol], 1) : 1;

    items.push({
      sku_or_name: nameStr,
      sku_code: skuCode || undefined,
      basepack_code: basepackCode || undefined,
      external_code: externalCode || undefined,
      hsn: hsnStr || undefined,
      category: detectedCategory,
      division: detectedDivision,
      quantity: qty,
      cost_per_pack: rate,
      mrp: mrp > 0 ? mrp : undefined,
      gst_rate: Number.isFinite(gstRate) ? gstRate : 0,
      cgst_rate: Number.isFinite(cgstVal) ? cgstVal : 0,
      sgst_rate: Number.isFinite(sgstVal) ? sgstVal : 0,
      igst_rate: Number.isFinite(igstVal) ? igstVal : 0,
      net_value: Number.isFinite(netValue) ? Number(netValue.toFixed(2)) : 0,
      tax_amount: Number.isFinite(taxAmount) ? Number(taxAmount.toFixed(2)) : 0,
      gross_value: Number.isFinite(grossValue) ? Number(grossValue.toFixed(2)) : 0,
      cgst_amount: Number.isFinite(cgstAmt) ? Number(cgstAmt.toFixed(2)) : 0,
      sgst_amount: Number.isFinite(sgstAmt) ? Number(sgstAmt.toFixed(2)) : 0,
      igst_amount: Number.isFinite(igstAmt) ? Number(igstAmt.toFixed(2)) : 0,
      pack_type: packType,
      batch_number: batchNumber,
      packed_date: packedDate,
      expiry_date: expiryDate,
      extracted_multipliers: {
        units_per_packet: unitsPerPacket,
        packets_per_case: packetsPerCase
      },
      raw_row: row
    });
  }

  // If not all items have a batch, use the first detected batch or generate a default batch for the batch
  const existingBatch = items.find(it => it.batch_number && it.batch_number.trim() !== '')?.batch_number;
  const defaultBatch = existingBatch || generateDefaultBatchNumber();
  items.forEach(it => {
    if (!it.batch_number || it.batch_number.trim() === '') {
      it.batch_number = defaultBatch;
    }
  });

  return items;
}
