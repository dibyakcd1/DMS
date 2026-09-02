import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { inferTaxonomyCategory, normalizeDivisionCategory, inferTaxonomyDivision, computeTaxBreakdown } from '@/lib/taxonomy';
import { lookupHsnTaxonomy } from '@/lib/hsnTaxonomy';

export type ImportStatus = 'valid' | 'warning' | 'error';

export interface MappedProduct {
  name?: string;
  sku?: string;
  mrp: number;
  gst_rate: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  division_category?: string;
  hsn?: string;
  item_pack_type?: string;
  pack_size_value?: number;
  pack_size_unit?: string;
  base_unit?: string;
  unit?: string;
  brand: string;
  units_per_packet: number;
  packets_per_case: number;
  units_per_case: number;
  case_qty_value?: number;
  case_qty_unit?: string;
  preferred_sell_unit: string;
  min_stock: number;
  division?: string;
  is_chain_item: boolean;
  is_mrp_priced: boolean;
  is_active: boolean;
  chain_mrp_label?: string;
  batch_number?: string;
  sub_category?: string;
  opening_stock?: number;
  base_weight_unit?: string | null;
  unit_type: "pcs" | "packet" | "kg_g";
  weight_per_unit_grams: number | null;
  display_weight_unit: "g" | "kg" | "ml" | "ltr" | null;
  target_margin_basic?: number;
  target_margin_bronze?: number;
  target_margin_silver?: number;
  target_margin_gold?: number;
  target_margin_premium?: number;
}

export interface ImportRowResult {
  row_index: number;
  status: ImportStatus;
  errors: string[];
  warnings: string[];
  mapped_data: MappedProduct;
}

export interface ImportSummary {
  total: number;
  valid_count: number;
  warning_count: number;
  error_count: number;
  rows: ImportRowResult[];
  mappings: Record<string, string | null>;
  available_headers: string[];
}

const MANDATORY_MAPPINGS = ['Product Name', 'SKU'];
const OPTIONAL_MAPPINGS = [
  'MRP', 'GST Rate (%)', 'Category', 'Sub Category', 'HSN Code', 'Unit Label', 'Item Pack Type', 
  'Unit Pack Size', 'Pack Size', 'Pack Size Unit', 'Base Unit', 'Base Unit (pcs)', 'Unit', 'Brand', 'Units per Pack', 'Units per Packet', 
  'Packs per Case', 'Pack per Case', 'Units/Case', 'Qty in Case', 'QTY Case', 'QTY BAG/CARTON', 'QTY BAG/CARTOON', 'QTY Case/Carton', 'QTY/CARTOON', 'Preferred Sell Unit', 
  'Min Stock', 'Opening Stock', 'Batch Number', 'Active', 'Chain Pack?', 'Chain MRP Label',
  'Margin Basic', 'Margin Bronze', 'Margin Silver', 'Margin Gold', 'Margin Premium'
];
const ALL_SYSTEM_COLUMNS = [...MANDATORY_MAPPINGS, ...OPTIONAL_MAPPINGS];

const HEADER_SYNONYMS: Record<string, string[]> = {
  'Product Name': [
    'product name', 'product', 'item name', 'item', 'title', 'name', 'product_name', 'item_name', 
    'description', 'particulars', 'item description', 'description of goods', 'goods description', 
    'material description', 'product description', 'name of product', 'name of item', 'particulars of goods',
    'details', 'stock item', 'commodity', 'goods', 'article description', 'article desc', 'item details'
  ],
  'SKU': ['sku', 'sku code', 'item code', 'product code', 'barcode', 'code', 'sku_code', 'item_sku', 'material code', 'article code', 'item no', 'product_code'],
  'MRP': ['mrp', 'm.r.p', 'm.r.p.', 'maximum retail price', 'retail price', 'price', 'rate'],
  'GST Rate (%)': ['gst rate (%)', 'gst rate', 'gst (%)', 'gst %', 'gst', 'gst slab rate', 'gst slab', 'gst slab (%)', 'tax rate (%)', 'tax rate', 'tax %', 'tax slab', 'tax slab rate', 'tax', 'igst', 'cgst', 'sgst', 'gst_rate', 'tax_rate'],
  'Category': ['category', 'division category', 'category division', 'product category', 'item category', 'division_category', 'cat', 'group', 'product group', 'dept', 'department'],
  'Sub Category': ['sub category', 'subcategory', 'sub-category', 'sub category name', 'sub_category', 'sub group', 'subgroup'],
  'HSN Code': ['hsn code', 'hsn', 'hsn/sac', 'hsn/sac code', 'hsn_code', 'sac code', 'sac', 'tariff code', 'tariff', 'commodity code'],
  'Unit Label': ['unit label', 'pack type', 'packaging type', 'item pack type', 'pack format', 'packing'],
  'Item Pack Type': ['item pack type', 'unit label', 'pack type', 'packaging type', 'pack format', 'packing'],
  'Unit Pack Size': ['unit pack size', 'pack size', 'size', 'net weight', 'weight', 'volume', 'content size', 'net qty', 'net quantity'],
  'Pack Size Unit': ['pack size unit', 'size unit', 'weight unit', 'unit of measure', 'uom'],
  'Base Unit': ['base unit', 'base unit (pcs)', 'unit', 'primary unit', 'base_unit'],
  'Brand': ['brand', 'company', 'brand name', 'manufacturer', 'supplier'],
  'Units per Pack': ['units per pack', 'units per packet', 'upp', 'units/pack', 'units/packet', 'pcs per pack', 'pcs per packet'],
  'Packs per Case': ['packs per case', 'pack per case', 'ppc', 'packs/case', 'packets per case', 'packets/case', 'packets per carton', 'pouches per bag', 'pouches per carton'],
  'Units/Case': ['units/case', 'qty in case', 'qty case', 'qty bag/carton', 'qty bag/cartoon', 'qty case/carton', 'qty/cartoon', 'units per case', 'upc', 'total pcs in case', 'total units per case'],
  'Preferred Sell Unit': ['preferred sell unit', 'sell unit', 'preferred unit', 'default unit', 'selling unit'],
  'Min Stock': ['min stock', 'minimum stock', 'reorder level', 'min stock threshold', 'min_stock', 'safety stock'],
  'Opening Stock': ['opening stock', 'initial stock', 'current stock', 'stock', 'qty on hand', 'quantity', 'stock qty', 'opening qty'],
  'Batch Number': ['batch number', 'batch no', 'batch', 'lot number', 'lot no', 'lot'],
  'Active': ['active', 'is active', 'status', 'enabled'],
  'Chain Pack?': ['chain pack?', 'chain pack', 'is chain', 'chain item', 'chain'],
  'Chain MRP Label': ['chain mrp label', 'chain label', 'chain price tag']
};

function parseNumericTax(raw: unknown, hsnCode?: string | null): number {
  if (raw !== undefined && raw !== null && raw !== '') {
    if (typeof raw === 'number' && !isNaN(raw)) return raw;
    const str = String(raw).replace(/%/g, '').trim();
    const val = parseFloat(str);
    if (!isNaN(val)) return val;
  }
  if (hsnCode) {
    const hsnMatch = lookupHsnTaxonomy(hsnCode);
    if (hsnMatch && hsnMatch.defaultGstRate != null) {
      return hsnMatch.defaultGstRate;
    }
  }
  return 0;
}

export interface ExtractedProductItem {
  name?: string | null;
  sku?: string | null;
  mrp?: number | null;
  gst_rate?: number | null;
  category?: string | null;
  sub_category?: string | null;
  hsn?: string | null;
  item_pack_type?: string | null;
  units_per_packet?: number | null;
  packets_per_case?: number | null;
  opening_stock?: number | null;
  preferred_sell_unit?: string | null;
}

export const productImportService = {

  /**
   * Parse a file (XLSX or CSV) from a buffer
   */
  async parseFile(buffer: ArrayBuffer, filename: string, userMappings?: Record<string, string>): Promise<ImportSummary> {
    const isCsv = filename.toLowerCase().endsWith('.csv');
    let data: Record<string, unknown>[] = [];
    let available_headers: string[] = [];

    if (isCsv) {
      const decoder = new TextDecoder('utf-8');
      const csvString = decoder.decode(buffer);
      const result = Papa.parse<Record<string, unknown>>(csvString, { header: true, skipEmptyLines: true });
      data = result.data;
      available_headers = result.meta.fields || [];
    } else {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
      if (data.length > 0) {
        available_headers = Object.keys(data[0]);
      }
    }

    // Determine mappings if not provided
    const mappings: Record<string, string | null> = {};
    ALL_SYSTEM_COLUMNS.forEach(sysCol => {
      if (userMappings && userMappings[sysCol]) {
        mappings[sysCol] = userMappings[sysCol];
      } else {
        const synonyms = HEADER_SYNONYMS[sysCol] || [sysCol.toLowerCase()];
        const match = available_headers.find(h => {
          const cleanH = h.trim().toLowerCase();
          return synonyms.some(syn => cleanH === syn || cleanH.includes(syn) || syn.includes(cleanH));
        });
        mappings[sysCol] = match || null;
      }
    });

    return {
      ...this.processData(data, mappings),
      mappings,
      available_headers
    };
  },

  /**
   * Process raw data rows into structured import results
   */
  processData(data: Record<string, unknown>[], mappings: Record<string, string | null>): Omit<ImportSummary, 'mappings' | 'available_headers'> {
    const rows: ImportRowResult[] = [];
    const seenSkus = new Set<string>();
    const seenNames = new Set<string>();

    data.forEach((row, index) => {
      if (index === 0 && row[Object.keys(row)[0]] === "EXAMPLE - DO NOT REMOVE") {
        return; // Skip example row
      }
      const processed = this.processRow(row, index + 1, seenSkus, seenNames, mappings);
      rows.push(processed);
      if (processed.mapped_data.sku) {
        seenSkus.add(processed.mapped_data.sku.toUpperCase());
      }
      if (processed.mapped_data.name) {
        seenNames.add(processed.mapped_data.name.toLowerCase().trim());
      }
    });

    return {
      total: rows.length,
      valid_count: rows.filter(r => r.status === 'valid').length,
      warning_count: rows.filter(r => r.status === 'warning').length,
      error_count: rows.filter(r => r.status === 'error').length,
      rows
    };
  },

  /**
   * Process a single row with validation and mapping
   */
  processRow(
    row: Record<string, unknown>, 
    rowIndex: number, 
    seenSkusInFile: Set<string>, 
    seenNamesInFile: Set<string>, 
    mappings: Record<string, string | null>
  ): ImportRowResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const ITEM_PACK_TYPE_OPTIONS = ['packet', 'jar', 'bottle', 'bag', 'box', 'tin', 'can', 'kg', 'pcs'];

    const mapped: MappedProduct = {
      mrp: 0,
      gst_rate: 0,
      brand: 'Tatvisha Enterprises',
      units_per_packet: 1,
      packets_per_case: 1,
      units_per_case: 1,
      preferred_sell_unit: 'packet',
      min_stock: 0,
      is_chain_item: false,
      is_mrp_priced: false,
      is_active: true,
      opening_stock: 0,
      unit_type: 'pcs',
      weight_per_unit_grams: null,
      display_weight_unit: null
    };

    // Header Mapping & Normalization using the mappings passed from parseFile
    const getVal = (systemKey: string): string | number | undefined => {
      const fileKey = mappings[systemKey];
      return fileKey ? (row[fileKey] as string | number | undefined) : undefined;
    };

    // Mandatory checks
    const rawName = getVal('Product Name') || getVal('Product Name ?');
    const rawSku = getVal('SKU') || getVal('SKU Code ?');

    let skuStr = '';
    if (!rawSku || String(rawSku).trim() === '') {
      errors.push("SKU is mandatory");
    } else {
      skuStr = String(rawSku).trim().toUpperCase();
      if (seenSkusInFile.has(skuStr)) {
        errors.push(`Duplicate SKU in file: ${skuStr}`);
      }
      mapped.sku = skuStr;
    }

    if (!rawName || String(rawName).trim() === '') {
      if (skuStr) {
        // Derive name from SKU and brand instead of Unknown
        mapped.name = `${mapped.brand} Item [${skuStr}]`;
        warnings.push(`Product Name was missing; auto-derived as "${mapped.name}"`);
      } else {
        errors.push("Product Name is mandatory");
      }
    } else {
      let nameStr = String(rawName).trim();
      const lowerName = nameStr.toLowerCase();
      if (['unknown', 'unknown product', 'unknown item', 'null', 'undefined'].includes(lowerName)) {
        if (skuStr) {
          nameStr = `${mapped.brand} Item [${skuStr}]`;
          warnings.push(`Replaced placeholder name with derived name: "${nameStr}"`);
        } else {
          errors.push("Product Name cannot be 'Unknown'");
        }
      }
      const normName = nameStr.toLowerCase();
      if (seenNamesInFile.has(normName)) {
        errors.push(`Duplicate Product Name in file: "${nameStr}"`);
      }
      mapped.name = nameStr;
    }

    // HSN parsing
    const hsn = getVal('HSN Code');
    if (hsn != null && String(hsn).trim() !== '') {
      const cleanHsn = String(hsn).trim();
      const hsnNum = Number(cleanHsn);
      if (!isNaN(hsnNum)) {
        mapped.hsn = String(Math.floor(hsnNum));
      } else {
        mapped.hsn = cleanHsn;
      }
    }

    // Standard fields
    mapped.mrp = Number(getVal('MRP') ?? 0);
    if (mapped.mrp === 0) warnings.push("MRP is 0 (Check if chain pack)");

    const rawGst = getVal('GST Rate (%)');
    mapped.gst_rate = parseNumericTax(rawGst, mapped.hsn);
    const taxBreakdown = computeTaxBreakdown(mapped.gst_rate);
    mapped.cgst_rate = taxBreakdown.cgst_rate;
    mapped.sgst_rate = taxBreakdown.sgst_rate;
    mapped.igst_rate = taxBreakdown.igst_rate;
    
    const rawCategory = getVal('Category') as string | undefined;
    mapped.division_category = normalizeDivisionCategory(rawCategory, mapped.name, mapped.hsn);
    mapped.division = inferTaxonomyDivision(mapped.division_category);
    if (!mapped.division_category) warnings.push("Category is missing");

    mapped.sub_category = getVal('Sub Category') as string | undefined;

    // Item Pack Type (Unit Label in CSV)
    const iptRaw = (getVal('Unit Label') || getVal('Item Pack Type') || 'Packet').toString().trim();
    mapped.item_pack_type = iptRaw;
    
    const iptLower = iptRaw.toLowerCase();
    if (!ITEM_PACK_TYPE_OPTIONS.some(opt => iptLower.includes(opt))) {
      warnings.push(`Unusual Item Pack Type: ${iptRaw}. Standard types: ${ITEM_PACK_TYPE_OPTIONS.join(', ')}`);
    }

    // Pack Size Parsing (Unit Pack Size in CSV)
    const packSizeStr = getVal('Unit Pack Size') || getVal('Pack Size');
    const packSizeUnitExplicit = getVal('Pack Size Unit');

    if (packSizeStr) {
      const match = String(packSizeStr).match(/(\d+\.?\d*)\s*(gms?|g|kg|ml|ltr|l|pcs|packets?|pc)/i);
      if (match) {
        mapped.pack_size_value = Number(match[1]);
        if (!packSizeUnitExplicit) {
          let unit = match[2].toLowerCase();
          // Standardize variations to 'g' or 'Kg'
          if (unit === 'g' || unit === 'gms' || unit === '.gms') unit = 'g';
          if (unit.startsWith('kg')) unit = 'Kg';
          if (unit.startsWith('l')) unit = 'ltr';
          mapped.pack_size_unit = unit;
        }
      } else {
        const numVal = Number(packSizeStr);
        if (!isNaN(numVal)) {
          mapped.pack_size_value = numVal;
        }
      }
    }

    if (packSizeUnitExplicit) {
      let unit = String(packSizeUnitExplicit).toLowerCase().replace(/[0-9\s]/g, '');
      if (unit === 'g' || unit === 'gms' || unit === '.gms') unit = 'g';
      if (unit === 'kg') unit = 'Kg';
      if (unit.includes('ltr') || unit.includes('lit')) unit = 'ltr';
      if (unit.includes('pc')) unit = 'pcs';
      mapped.pack_size_unit = unit || mapped.pack_size_unit;
    }

    // Standardize pack_size_unit and sync base_weight_unit
    const finalUnit = (mapped.pack_size_unit || "").toLowerCase();
    if (finalUnit === "g" || finalUnit === "gms" || finalUnit === ".gms") {
      mapped.pack_size_unit = "g";
      mapped.base_weight_unit = "g";
      mapped.display_weight_unit = "g";
    } else if (finalUnit === "kg" || finalUnit === "kgs") {
      mapped.pack_size_unit = "Kg";
      mapped.base_weight_unit = "Kg";
      mapped.display_weight_unit = "kg";
    } else if (finalUnit === "ml") {
      mapped.display_weight_unit = "ml";
    } else if (finalUnit === "ltr" || finalUnit === "l") {
      mapped.display_weight_unit = "ltr";
    } else {
      mapped.base_weight_unit = null;
      mapped.display_weight_unit = null;
    }

    // Determine weight_per_unit_grams
    const val = Number(mapped.pack_size_value) || 0;
    if (mapped.display_weight_unit === 'kg' || mapped.display_weight_unit === 'ltr') {
      mapped.weight_per_unit_grams = val * 1000;
    } else if (mapped.display_weight_unit) {
      mapped.weight_per_unit_grams = val;
    } else {
      mapped.weight_per_unit_grams = null;
    }

    mapped.base_unit = (getVal('Base Unit (pcs)') || getVal('Base Unit') || getVal('Unit')) as string | undefined;
    mapped.unit = mapped.base_unit;
    mapped.brand = (getVal('Brand') as string) || 'Tatvisha Enterprises';

    // Hierarchy
    mapped.units_per_packet = Number(getVal('Units per Pack') || getVal('Units per Packet') || 1);
    mapped.packets_per_case = Number(getVal('Packs per Case') || getVal('Pack per Case') || 1);
    
    // Determine unit_type
    const isWeighted = mapped.display_weight_unit !== null;
    if (isWeighted) {
      mapped.unit_type = 'kg_g';
    } else if (mapped.units_per_packet > 1) {
      mapped.unit_type = 'packet';
    } else {
      mapped.unit_type = 'pcs';
    }
    
    const unitsPerCaseProvided = getVal('Units/Case') || getVal('QTY Case') || getVal('QTY BAG/CARTON') || getVal('QTY BAG/CARTOON') || getVal('QTY Case/Carton') || getVal('QTY/CARTOON');
    const calculatedUPC = mapped.units_per_packet * mapped.packets_per_case;
    
    if (unitsPerCaseProvided != null) {
      mapped.units_per_case = Number(unitsPerCaseProvided);
      if (mapped.units_per_case !== calculatedUPC) {
        warnings.push(`Units/Case (${mapped.units_per_case}) differs from UPP×PPC (${calculatedUPC}). Using provided value.`);
      }
    } else {
      mapped.units_per_case = calculatedUPC;
    }

    // Auto-derivation of Division from SKU
    // Logic: BS, BL, WS, etc. usually at start or after first hyphen
    if (mapped.sku) {
      const sku = mapped.sku.toUpperCase();
      if (sku.startsWith('BS') || sku.includes('-BS')) mapped.division = 'BS';
      else if (sku.startsWith('BL') || sku.includes('-BL')) mapped.division = 'BL';
      else if (sku.startsWith('WS') || sku.includes('-WS')) mapped.division = 'WS';
      else if (sku.startsWith('CP') || sku.includes('-CP')) mapped.division = 'CP';
      else {
        const parts = sku.split('-');
        if (parts.length >= 2) mapped.division = parts[1];
      }
    }

    // Qty in Case parsing
    const qtyInCaseStr = getVal('Qty in Case') || getVal('QTY Case') || getVal('QTY BAG/CARTON') || getVal('QTY BAG/CARTOON') || getVal('QTY Case/Carton') || getVal('QTY/CARTOON');
    if (qtyInCaseStr != null && qtyInCaseStr !== '') {
      const strVal = String(qtyInCaseStr).trim();
      const match = strVal.match(/^(\d+\.?\d*)\s*(kg|kgs|kilograms?|pkt|pkts|packets?|pcs|units?|units?|gms?|grams?|g)?$/i);
      
      if (match) {
        mapped.case_qty_value = Number(match[1]);
        let unit = (match[2] || '').toLowerCase();
        
        // Normalize unit
        if (unit.startsWith('kg')) unit = 'kg';
        else if (unit.startsWith('pkt') || unit.startsWith('packet')) unit = 'packet';
        else if (unit.startsWith('pcs') || unit.startsWith('unit') || unit.startsWith('pc')) unit = 'pcs';
        else if (unit.startsWith('g')) unit = 'g';
        
        // Defaulting if no unit provided
        if (!unit) {
          if (mapped.pack_size_unit === 'g' || mapped.pack_size_unit === 'kg') {
            unit = 'kg';
          } else {
            unit = 'packet';
          }
        }
        
        mapped.case_qty_unit = unit;
      } else {
        // Just in case it's a number but somehow didn't match the regex anchor
        const numVal = Number(strVal);
        if (!isNaN(numVal)) {
          mapped.case_qty_value = numVal;
          mapped.case_qty_unit = (mapped.pack_size_unit === 'g' || mapped.pack_size_unit === 'kg') ? 'kg' : 'packet';
        }
      }
    }

    // Preferred Sell Unit
    let psu = String(getVal('Preferred Sell Unit') || '').toLowerCase().trim();
    if (psu === 'doz' || psu === 'dozen' || psu === 'dz') psu = 'doz';
    else if (psu === 'pkt' || psu === 'pouch' || psu === 'packet' || psu === 'sachet' || psu === 'pack') psu = 'packet';
    else if (psu === 'pcs' || psu === 'unit' || psu === 'pc') psu = 'pcs';
    else if (psu === 'case' || psu === 'carton' || psu === 'box') psu = 'case';
    else if (psu === 'kg' || psu === 'kilogram' || psu === 'kgs') psu = 'kg';
    if (psu) mapped.preferred_sell_unit = psu;

    mapped.min_stock = Number(getVal('Min Stock') || 10);
    mapped.batch_number = getVal('Batch Number') as string | undefined;
    
    const activeVal = getVal('Active');
    if (activeVal !== undefined) {
      const activeStr = String(activeVal).toLowerCase();
      mapped.is_active = activeStr === 'yes' || activeStr === 'true' || activeStr === '1' || activeStr === 'active';
    }

    // Margin Tiers
    mapped.target_margin_basic = Number(getVal('Margin Basic') || 0);
    mapped.target_margin_bronze = Number(getVal('Margin Bronze') || 0);
    mapped.target_margin_silver = Number(getVal('Margin Silver') || 0);
    mapped.target_margin_gold = Number(getVal('Margin Gold') || 0);
    mapped.target_margin_premium = Number(getVal('Margin Premium') || 0);
    
    // Inventory
    const openingStock = Number(getVal('Opening Stock') || 0);
    mapped.opening_stock = openingStock;
    if (openingStock === 0) warnings.push("Opening Stock is 0");

    const nameLower = (mapped.name || "").toLowerCase();
    // Rule: ACB is NOT a chain item. Chain items are specific names.
    const isChainName = nameLower.includes('chain pack') || nameLower.includes('cb items') || nameLower.includes('chainpack');
    
    // Explicit Chain MRP Label mapping or manual override
    const explicitChainLabel = getVal('Chain MRP Label');
    const explicitIsChain = getVal('Chain Pack?'); 
    
    // 1. Determine if Chain Item
    if (explicitIsChain !== undefined) {
      const isChainStr = String(explicitIsChain).toLowerCase();
      mapped.is_chain_item = isChainStr === 'yes' || isChainStr === 'true' || isChainStr === '1';
    } else {
      mapped.is_chain_item = isChainName && !nameLower.includes('[acb]');
    }

    // Rule: is_mrp_priced should be true if it has an MRP > 0
    mapped.is_mrp_priced = (Number(mapped.mrp) > 0) || mapped.is_chain_item;

    // 2. Clear Chain MRP Label if not a chain item
    if (mapped.is_chain_item) {
      if (explicitChainLabel) {
        mapped.chain_mrp_label = String(explicitChainLabel);
      } else if (packSizeStr || mapped.sku) {
        // Improved regex for label extraction: Rs/Re with flexibility for dots, slashes and piece counts
        const labelMatch = (mapped.name + " " + String(packSizeStr || "")).match(/(Rs?\.?|Re\.?)\s*\d+\s*[/-]*(\s*\(\d+p[cs]\))?/i);
        if (labelMatch) {
          mapped.chain_mrp_label = labelMatch[0].trim();
        }
      }
    } else {
      mapped.chain_mrp_label = null;
    }

    // 3. Preferred Sell Unit Logic
    const isDozenProduct = nameLower.includes('doz') || nameLower.includes('dozen') || 
      nameLower.includes('12 pcs') || nameLower.includes('12pcs') || 
      iptLower.includes('doz') || iptLower.includes('dozen') ||
      psu === 'doz';

    if (isDozenProduct) {
      mapped.preferred_sell_unit = 'doz';
      if (!mapped.units_per_packet || mapped.units_per_packet <= 1) {
        mapped.units_per_packet = 12;
      }
    } else {
      const hasPcsInName = nameLower.includes('pc') || nameLower.includes('pcs');
      
      if (hasPcsInName) {
        mapped.preferred_sell_unit = 'packet';
      } else if (iptLower.includes('acb') || iptLower.includes('jar') || iptLower.includes('tin') || iptLower.includes('bottle')) {
        mapped.preferred_sell_unit = 'pcs';
      } else {
        // Default to what is in the sheet or 'packet'
        const rawPSU = getVal('Preferred Sell Unit');
        const sheetPSU = String(rawPSU || 'packet').toLowerCase();
        if (sheetPSU.includes('doz') || sheetPSU.includes('dz')) mapped.preferred_sell_unit = 'doz';
        else if (sheetPSU.includes('pcs') || sheetPSU.includes('unit')) mapped.preferred_sell_unit = 'pcs';
        else if (sheetPSU.includes('case') || sheetPSU.includes('carton')) mapped.preferred_sell_unit = 'case';
        else if (sheetPSU.includes('kg')) mapped.preferred_sell_unit = 'kg';
        else mapped.preferred_sell_unit = 'packet';
      }
    }

    // Determine Status
    let status: ImportStatus = 'valid';
    if (errors.length > 0) status = 'error';
    else if (warnings.length > 0) status = 'warning';

    return {
      row_index: rowIndex,
      status,
      errors,
      warnings,
      mapped_data: mapped
    };
  },

  /**
   * Convert AI-extracted products into an ImportSummary
   */
  processAIExtractedProducts(extractedProducts: ExtractedProductItem[]): ImportSummary {
    const rows: ImportRowResult[] = [];
    const seenSkus = new Set<string>();
    const seenNames = new Set<string>();

    extractedProducts.forEach((item, index) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      const rawHsn = item.hsn ? String(item.hsn).trim() : undefined;
      const gstRate = parseNumericTax(item.gst_rate, rawHsn);
      const tax = computeTaxBreakdown(gstRate);
      const category = normalizeDivisionCategory(item.category, item.name || undefined, rawHsn);
      const division = inferTaxonomyDivision(category);

      const mapped: MappedProduct = {
        name: item.name ? String(item.name).trim() : "",
        sku: item.sku ? String(item.sku).trim().toUpperCase() : "",
        mrp: Number(item.mrp || 0),
        gst_rate: gstRate,
        cgst_rate: tax.cgst_rate,
        sgst_rate: tax.sgst_rate,
        igst_rate: tax.igst_rate,
        division_category: category,
        division: division,
        sub_category: item.sub_category || "",
        hsn: rawHsn,
        item_pack_type: item.item_pack_type || "packet",
        units_per_packet: Number(item.units_per_packet || 1),
        packets_per_case: Number(item.packets_per_case || 1),
        units_per_case: Number(item.units_per_packet || 1) * Number(item.packets_per_case || 1),
        opening_stock: Number(item.opening_stock || 0),
        preferred_sell_unit: item.preferred_sell_unit || "packet",
        brand: "Hindustan Unilever (HUL)", // Brand name specifically requested/recognized
        min_stock: 10,
        is_chain_item: false,
        is_mrp_priced: Number(item.mrp || 0) > 0,
        is_active: true,
        unit_type: "pcs",
        weight_per_unit_grams: null,
        display_weight_unit: null
      };

      if (!mapped.name) {
        errors.push("Product Name is mandatory");
      } else {
        const normName = mapped.name.toLowerCase();
        if (seenNames.has(normName)) {
          errors.push(`Duplicate Product Name in file: "${mapped.name}"`);
        }
        seenNames.add(normName);
      }

      if (!mapped.sku) {
        errors.push("SKU is mandatory");
      } else {
        if (seenSkus.has(mapped.sku)) {
          errors.push(`Duplicate SKU in file: ${mapped.sku}`);
        }
        seenSkus.add(mapped.sku);
      }

      if (mapped.mrp === 0) {
        warnings.push("MRP is 0");
      }
      if (mapped.opening_stock === 0) {
        warnings.push("Opening Stock is 0");
      }

      let status: ImportStatus = "valid";
      if (errors.length > 0) status = "error";
      else if (warnings.length > 0) status = "warning";

      rows.push({
        row_index: index + 1,
        status,
        errors,
        warnings,
        mapped_data: mapped
      });
    });

    return {
      total: rows.length,
      valid_count: rows.filter(r => r.status === 'valid').length,
      warning_count: rows.filter(r => r.status === 'warning').length,
      error_count: rows.filter(r => r.status === 'error').length,
      rows,
      mappings: {},
      available_headers: []
    };
  }
};

